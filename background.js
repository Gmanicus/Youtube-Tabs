// Handles export downloads from the content script using the extension Downloads API.
function toBase64Utf8(text) {
    return btoa(unescape(encodeURIComponent(text)));
}

function getApi() {
    return (typeof browser !== "undefined") ? browser : chrome;
}

const extensionApi = getApi();

extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== "ytt-export-backup") return;

    const dataUrl = "data:application/json;base64," + toBase64Utf8(message.payload || "{}");
    const filename = message.filename || ("ytt-backup-" + new Date().toISOString() + ".json");

    extensionApi.downloads.download({
        url: dataUrl,
        filename,
        saveAs: true
    }, (downloadId) => {
        if (extensionApi.runtime.lastError || !downloadId) {
            sendResponse({ ok: false, error: extensionApi.runtime.lastError?.message || "download failed" });
            return;
        }

        sendResponse({ ok: true, downloadId });
    });

    // Keep the message channel open for the async downloads callback.
    return true;
});
