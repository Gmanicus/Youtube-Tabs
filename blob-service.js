const blobUrls = new Set();

// This small service creates temporary JSON file URLs and releases them later.
function createBlobUrl(payload) {
    // Store each URL so only URLs made by this service can be revoked.
    const blobUrl = URL.createObjectURL(new Blob([payload || "{}"], {type: "application/json"}));
    blobUrls.add(blobUrl);
    return blobUrl;
}

function revokeBlobUrl(blobUrl) {
    // Revoking makes the temporary file eligible for cleanup after the download ends.
    if (blobUrls.delete(blobUrl)) URL.revokeObjectURL(blobUrl);
}

globalThis.yttBlobService = {
    downloadJson(payload, filename) {
        const blobUrl = createBlobUrl(payload);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = filename;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        link.remove();

        // Keep the URL alive long enough for the browser to start reading it.
        setTimeout(() => revokeBlobUrl(blobUrl), 1000);
    }
};
