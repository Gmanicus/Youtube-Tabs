// Developed by Grant @ GeekOverdriveStudio
var hexDigits = new Array("0","1","2","3","4","5","6","7","8","9","a","b","c","d","e","f"); 
var currentURL = window.location.href;
var scrollDist = 0;
var darkModeEnabled = false;
var userAgent = "";
var loaded = false;

var guide = null;
var innerGuide = null;
var widgetContainer = null;
var pulledSub = null;
var pulledMenu = null;
var colorPicker = null;
var helpMenu = null;
var subscriptionWidgetPromise = null;

var tabNodes = [];
var subLinkDict = JSON.parse(localStorage.getItem("subscription_links"));
var subTabDict = JSON.parse(localStorage.getItem("subscription_tabs"));

// Grab tab shared variables
var subProps = {};
var grabbedTab = null;

window.onload = function() {
    let waitForGuide = setInterval(()=>{
        // Get guide button, dispatch 'yt-guide-hover', causing the guide to load
        let guideBtn = document.getElementById("guide-button");
        if (!guideBtn) return;
        else clearInterval(waitForGuide);
        guideBtn.dispatchEvent(new CustomEvent("yt-guide-hover", { bubbles: true }));

        let waitForSections = setInterval(()=>{
            let guideSections = document.getElementsByTagName("ytd-guide-section-renderer");
            if (guideSections.length < 2) return;
            else clearInterval(waitForSections);

            // Get the 'Show more' subscriptions button in the guide and click it, causing the subscriptions to load
            let showMoreSubscriptions = guideSections[1].querySelector("#expander-item");
            showMoreSubscriptions.click();

            new TabManager();
        }, 100)
    }, 100)
}

Object.nonFunctionKeys = (obj) => {
    return Object.keys(obj).filter((key) => typeof obj[key] != "function")
}

class TabManager {

    // Modal is an attribute that can be used to darken the content of the page to display a form over it
    _modal = false;

    set modal(value) {
        if (this._modal == value) return;
        this._modal = value;
        if (value) { // If we are enabling modal, add the modal class to the page content and add a listener to close the active menu when it is clicked
            let content = document.getElementById("page-manager");
            content.classList.add("modal");

            // prevent scrolling
            document.documentElement.style.overflow = "hidden";

            // Close active menus and pages when background is clicked
            content.addEventListener("click", () => { if (this.modal) { this.activeMenu?.close(); this.activePage?.close(); } })
        } else {
            document.getElementById("page-manager").classList.remove("modal");
            // enable scrolling
            document.documentElement.style.overflow = "";

            // Close active menus
            this.activeMenu?.close();
            this.activePage?.close();
        }
    }

    get modal() { return this._modal; }

    constructor() {
        this.badgeTabAssociations = JSON.parse(localStorage.getItem("subscription_links"));
        this.badgeTabs = JSON.parse(localStorage.getItem("subscription_tabs"));

        // Retrieve version stored in the manifest
        this.version = null;
        try { this.version = browser.runtime.getManifest().version; }
        catch (e) {
            try { ver = chrome.runtime.getManifest().version; }
            catch (e) { this.logMessage("info", "Unable to get version from manifest") }
        }
        
        // Update the version stored in localStorage
        if (localStorage.getItem("youtube_tabs_version") != this.version) {
            localStorage.setItem("youtube_tabs_version", this.version);
            // help();
        }

        if (this.version) this.logMessage("info", `Running version ${this.version}`)

        // Elements
        this.sidePanel = document.getElementById("guide-content");
        this.sidePanelTrack = document.getElementById("guide-inner-content");
        this.badgeContainer = this.sidePanel.querySelectorAll("#items")[1];
        this.badgeHeader = this.createAndConfigureElement("div", { className: "badge-header" });
        this.newTab = this.createAndConfigureElement("span", {
            className: "btn",
            title: "New Tab",
            style: { backgroundImage: "url('https://i.imgur.com/zggQshn.png')" },
            event: { name: "click", callback: this.createNewTab.bind(this) }
        });
        this.info = this.createAndConfigureElement("span", {
            className: "btn",
            title: "Help/Info",
            style: { backgroundImage: "url('https://i.imgur.com/9RJ5eKQ.png')" },
            event: { name: "click", callback: this.help.bind(this) }
        });

        // Variables
        this.scrollDistance = 0;
        this.tabIndex = [];
        this.tabs = [];
        this.badges = [];
        this.modal = false;
        this.grabbing = false;

        // Active menu / page when user interacts
        this.activeMenu;
        this.activePage;

        this.reformatGuide();
        this.initializeTabs();
        this.initializeBadges();
        this.initializeFeedImprover();
        this.initializeSubListener();
    }

    logMessage(level, ...msg) {
        switch (level) {
            case "error":   { console.error("[Youtube Tabs]", ...msg); break; }
            case "warn":    { console.warn("[Youtube Tabs]", ...msg); break; }
            default:        { console.log("[Youtube Tabs]", ...msg); break; }
        }
    }

    /** Changes some styling for the guide (the left side-panel) to make it 'Youtube Tabs accessible'
      *
    **/
    reformatGuide() {
        this.setStyle(this.sidePanel, { overflow: "visible" });
        this.setStyle(this.sidePanelTrack, { overflow: "visible", transition: "margin-top 0.05s linear" });
        // Update with ScrollTop or ScrollTo? https://stackoverflow.com/questions/635706/how-to-scroll-to-an-element-inside-a-div
        this.sidePanelTrack.addEventListener("wheel", (e) => {
            if (this.modal) return; // If modal (some other menu is in focus), don't scroll the side-bar
            this.scrollDistance -= e.deltaY * 0.75;
            this.scrollDistance = Math.min(Math.max(this.scrollDistance, -this.sidePanelTrack.offsetHeight + window.innerHeight), 0);
            this.sidePanelTrack.style.marginTop = this.scrollDistance + "px";
            this.showBadges();
        })

        this.setStyle(this.badgeContainer, { position: "relative" });
        // Move the elements from the 'expanded items' container to the badgeContainer
        moveElementsTo(this.badgeContainer, ...this.badgeContainer.querySelector("#expandable-items").children);
        this.badgeContainer.getElementsByTagName("ytd-guide-collapsible-entry-renderer")[0].remove(); // Remove the 'expander item' element so that the badgeContainer only contains subscription badges

        // Add widgets to the 'Subscriptions' header
        this.badgeHeader.appendChild(this.badgeContainer.parentElement.children[0]);
        this.badgeHeader.appendChild(this.createAndConfigureElement("span", { className: "badge-header-controls" }));
        this.badgeHeader.controls = this.badgeHeader.lastChild;
        this.badgeHeader.text = this.badgeHeader.firstChild;

        this.badgeHeader.controls.appendChild(this.info);
        this.badgeHeader.controls.appendChild(this.newTab);
        this.badgeContainer.parentElement.insertBefore(this.badgeHeader, this.badgeContainer);
    }

    initializeTabs() {
        // Create tabs in ascending order by index
        Object.nonFunctionKeys(this.badgeTabs).sort((keyA, keyB)=>{return this.badgeTabs[keyA].index - this.badgeTabs[keyB].index}).forEach((id)=>{
            let tab = this.badgeTabs[id];
            this.createTab(tab.name, id, tab.color, tab.hidden).moveToBottom();
        })

        // Insert tab at index
        // ...append tab
        this.badgeTabs.insert = (tab, index) => {
            let constrainedIndex = Math.min(index, 0); // Constrain the index so it is always within possible range

            let updateIndex = this.tabIndex.findIndex((id) => id == tab.id);
            let updateInPlace = (updateIndex != -1) ? true : false;

            if (updateInPlace) {
                // Remove current tab id item
                // Insert tab id item at new desired index
                this.tabIndex.splice(updateIndex, 1);
                this.tabIndex.splice(index, 0, tab.id);
            } else {
                // Insert new tab id item at new desired index
                this.tabIndex.splice(constrainedIndex, 0, tab.id);
            }

            this.badgeTabs.update(tab);

            // Update all indexes
            Object.nonFunctionKeys(this.badgeTabs).forEach((id) => {
                this.badgeTabs[id].index = this.tabIndex.findIndex((index_id) => index_id == id);
            })

            // Reorder tab elements
            Object.nonFunctionKeys(this.badgeTabs).sort((keyA, keyB)=>{return this.badgeTabs[keyA].index - this.badgeTabs[keyB].index}).forEach((id)=>{
                this.tabs.find((tab) => tab.id == id)?.moveToBottom();
            })

            this.save();
        }

        // Update tabs in storage
        this.badgeTabs.update = (tab) => {
            // If tab is already in the database list, update it
            if (Object.nonFunctionKeys(this.badgeTabs).find((id) => id == tab.id)) {
                Object.assign(this.badgeTabs[tab.id], {
                    name: tab.title,
                    color: tab.color,
                    hidden: tab.closed,
                    index: this.tabIndex.findIndex((id) => id == tab.id)
                })
            // If not, add it
            } else {
                this.badgeTabs[tab.id] = {
                    name: tab.title,
                    color: tab.color,
                    hidden: tab.closed,
                    index: this.tabIndex.findIndex((id) => id == tab.id)
                }
            }

            this.save();
        }

        this.badgeTabs.delete = (tab) => {
            delete this.badgeTabs[tab.id];
            this.tabs.splice(this.tabs.findIndex((tabItem) => tabItem.id == tab.id), 1);
            this.tabIndex.splice(this.tabIndex.findIndex((idItem) => idItem == tab.id), 1);
                
            // Remove all badge tab associations to this tab
            for (const [key, value] of Object.entries(this.badgeTabAssociations)) { if (value == tab.id) this.badgeTabAssociations[key] = -1; }
            this.save();
        }
    }

    initializeBadges() {
        this.badges = this.badgeContainer.querySelectorAll("ytd-guide-entry-renderer");
        this.badges.forEach((badge)=>{
            if (badge.classList.contains("badge")) return; // Return if we've already initialized this badge
            badge.id = this.getChannelIDFromBadge(badge);
            badge.classList.add("badge")
            switch (badge.getAttribute("line-end-style")) {
                case "none": badge.status = 0; break;
                case "dot": badge.status = 1; break;
                case "badge": badge.status = 2; break;
            }

            // Add badge menu button
            badge.appendChild(this.createAndConfigureElement("button", {className: "badge-retractor", event: { name: "click", callback: (e)=>{
                e.stopImmediatePropagation();
                this.badgeOptions(badge);
            }}}));

            // Add badge functions
            // • moveTo: move this badge to a specific tab and save it
            badge.moveTo = (tabID) => {
                let association = this.badgeTabAssociations[badge.id];
                if (!tabID) { this.logMessage("error", "Badge.moveTo() tab ID doesn't exist!", badge.id, tabID); return; }
                else if (tabID != -1 && !document.getElementById(tabID)) { this.logMessage("error", "Badge.moveTo() tab not found!", tabID); return; }

                // Set badge tab association to target tab
                if (tabID == -1) this.logMessage("info", `Removing badge '${badge.id}' from tab ${association}`);
                else if (association) this.logMessage("info", `Badge '${badge.id}' moving from ${association} to ${tabID}`);
                else this.logMessage("info", `Badge '${badge.id}' moving to ${tabID}`);
                
                this.badgeTabAssociations[badge.id] = tabID;
                this.save();

                if (tabID != -1) {
                    // Get badge list from target tab, insert the target badge, sort
                    let newSiblings = document.getElementById(tabID).querySelectorAll(".badge");
                    let family = Array.from(newSiblings); family.push(badge);
                    let sortedFamily = this.sortBadges(family);
                    let newIndex = sortedFamily.findIndex(item => { return item.id == badge.id } );

                    // insert target badge into tab at sorted index, save
                    if (newIndex == 0) document.getElementById(tabID).insertBefore(badge, sortedFamily[1]);
                    else insertAfter(sortedFamily[newIndex-1], badge);
                } else {
                    this.sortBadges();
                    this.arrangeBadges();
                }

                // Close the badge options menu if there is one
                if (badge.menu) badge.menu.close();
            }

            badge.lock = () => {
                // Disable pointer events until the menu is closed to prevent badge from being interacted with
                // And highlight this badge
                this.setStyle(badge, { pointerEvents: "none" });
                badge.setAttribute("active", "");
            }

            badge.unlock = () => {
                this.setStyle(badge, { pointerEvents: "all" });
                badge.removeAttribute("active");
            }
        })

        this.sortBadges();
        this.arrangeBadges();
    }

    // After scrolling through your feed, Youtube's performance will reduce drastically
    // This function watches the feed and hides items outside the viewport to improve performance
    initializeFeedImprover() {
        let feed_container = document.getElementById("contents");

        let options = {
            // root: ,
            rootMargin: '0px',
            threshold: 0
        }
        
        let observer = new IntersectionObserver((seen) => {
            seen.forEach((item) => {
                if (item.isIntersecting) item.target.style = null;
                else item.target.style.visibility = "hidden";
            })
        }, options);

        // Sick observer on all feed items that are not already observed every interval
        setInterval(() => {
            if (!feed_container) feed_container = document.getElementById("contents");
            Array.from(feed_container.children).forEach((child)=>{
                if (child.classList.contains("observed") || child.tagName.toLowerCase() == "ytd-continuation-item-renderer") return;
                observer.observe(child);
                child.classList.add("observed");
            })
        }, 1000)
    }

    initializeSubListener() {
        // Handle new sub
        // Handle removed sub
        document.addEventListener("yt-subscription-changed", (e) => {
            let id = this.getChannelIDFromPage();
            let unsubscribed = Array.from(this.badges).find((badge) => badge.id == id) != undefined;

            if (unsubscribed) {
                this.logMessage("info", "Unsubscribed from", id)
                let oldBadge = Array.from(this.badges).find((badge) => badge.id == id);
                let oldBadgeIndex = Array.from(this.badges).findIndex((badge) => badge.id == id);

                oldBadge.remove();
                this.badges.splice(oldBadgeIndex, 1);
            } else {
                this.logMessage("info", "Subscribed to", id)

                let subsUpdate = new MutationObserver(() => {
                    this.initializeBadges();
                    let newBadge = Array.from(this.badges).find((badge) => badge.id == id);
                    // if (newBadge) newBadge.style.backgroundColor = 'red';
                    
                    subsUpdate.disconnect();

                    this.handleSubscription(newBadge);
                })

                subsUpdate.observe(this.badgeContainer, { childList: true });
            }
        })
    }

    // ACTIONS

    sortBadges(badgeList) {
        let setMaster = false;
        if (badgeList == undefined || badgeList.length == 0) { badgeList = this.badges; setMaster = true; }
        badgeList = Array.from(badgeList).sort((badge1, badge2)=>{
            let badge1TabIndex = this.badgeTabs[this.badgeTabAssociations[badge1.id]]?.index + 1 || Infinity;
            let badge2TabIndex = this.badgeTabs[this.badgeTabAssociations[badge2.id]]?.index + 1 || Infinity;
            
            // Sort the widgets by
            // TODO: >>>> Favorited
            // >>>  Tab Index
            // >>   Status
            // >    Name
            if (badge1TabIndex != badge2TabIndex) return badge1TabIndex - badge2TabIndex;
            else if (badge1.status != badge2.status) return badge2.status - badge1.status;
            else return badge1.id.localeCompare(badge2.id);
        })
        
        if (setMaster) this.badges = badgeList;
        else return badgeList;
    }

    // In the currently sorted order, add badges to their respective tabs
    arrangeBadges() {
        this.badges.forEach((badge)=>{
            let tab = this.tabs.find((tab)=>{ return tab.id == this.badgeTabAssociations[badge.id] }) // Get the tab element that this badge belongs in
            if (tab) tab.appendChild(badge); // If that tab exists, append the badge to the tab
            else this.badgeContainer.appendChild(badge); // If not, append the badge to the container
        })
    }

    showBadges() {
        // let time = new Date();
        let visibleBadges = Array.from(this.badges).filter((badge)=>{ return this.isInViewport(badge) && !badge.classList.contains("shown"); });
        visibleBadges.sort((badge1, badge2)=>{
            let index1 = this.badges.findIndex((badge)=>{ return badge.id == badge1.id });
            let index2 = this.badges.findIndex((badge)=>{ return badge.id == badge2.id });
            if (index1 > index2) return 1;
            else return -1;
        })

        visibleBadges.forEach((badge, i)=>{
            // console.log(`Badge ${i} updated: ${((new Date() - time) / 1000).toFixed(4)}s`)
            badge.style.animationDelay = `${i * 0.1}s`; // console.log(badge.style.animationDelay);
            badge.className += " shown"
        })
        // console.log(`Done after: ${((new Date() - time) / 1000).toFixed(4)}s`)
    }

    createTab(title, id, color = "firebrick", hidden = false) {
        // Create and configure tab, tab header, and tab controls
        let newTab = this.createAndConfigureElement("div", {
            className: "tab " + ((hidden) ? "closed" : ""),
            title: title,
            id: id,
            style: { borderColor: color },
            color: color,
            closed: hidden
        });

        // Register tab events
        newTab.getName = () => title;
        newTab.setName = (name) => { newTab.title = name; newTab.getElementsByClassName("tab-menu-name")[0].innerHTML = name.toUpperCase(); }

        // Darkmode

        // Tab positioning methods
        newTab.moveToBottom = () => {
            let lastTab = [...this.badgeContainer.getElementsByClassName("tab")].pop();
            if (lastTab) insertAfter(lastTab, newTab);
            else this.badgeContainer.insertBefore(newTab, this.badgeContainer.firstChild);
        }

        newTab.moveToTop = () => {
            this.badgeContainer.insertBefore(newTab, this.badgeContainer.firstChild);
        }

        // Delete tab method
        newTab.delete = () => {
            if (confirm("Are you sure?")) {
                this.badgeTabs.delete(newTab);
                newTab.remove();
                this.sortBadges();
                this.arrangeBadges();
            }
        }

        newTab.toggle = () => {
            newTab.classList.toggle("closed");
            newTab.closed = newTab.classList.contains("closed")
            this.badgeTabs.update(newTab);
        }

        // When user click & holds on the header of the tab to reorder
        newTab.grab = (event) => {
            if (!event.button == 0) return; // If the left-mouse button was not pressed
            this.grabbing = true;

            let oldPosition = newTab.getBoundingClientRect().top;
            let oldTrackPosition = parseInt(this.sidePanelTrack.style.marginTop); if (!oldTrackPosition) oldTrackPosition = 0;
            let oldTransition = this.sidePanelTrack.style.transition;

            // Set every tab to closed
            this.tabs.forEach((tab) => {
                tab.classList.add("closed");
            })

            // Stop grabbing on mouse up
            document.addEventListener("mouseup", () => { newTab.drop(oldTrackPosition); }, { once: true });

            // Make sidepanel scroll instantaneous
            this.sidePanelTrack.style.transition = "none";

            // Scroll the sidebar so that the cursor is still on the grabbed tab
            let posDifference = newTab.getBoundingClientRect().top - oldPosition;
            let newPosition = oldTrackPosition - posDifference;

            this.sidePanelTrack.style.marginTop = newPosition + "px";
            this.sidePanelTrack.getBoundingClientRect(); // Trigger reflow
            this.sidePanelTrack.style.transition = oldTransition;
        }

        // When user lets go of the tab after reordering it
        newTab.drop = (oldPosition) => {

            let oldTransition = this.sidePanelTrack.style.transition;
            // Make sidepanel scroll instantaneous
            this.sidePanelTrack.style.transition = "none";

            // Reset sidepanel position
            this.sidePanelTrack.style.marginTop = oldPosition + "px";
            this.sidePanelTrack.getBoundingClientRect(); // Trigger reflow
            this.sidePanelTrack.style.transition = oldTransition;

            this.tabs.forEach((tab) => {
                let closed = this.badgeTabs[tab.id]?.hidden;
                if (!closed) tab.classList.remove("closed");
            })
        }

        // Configure tab elements
        newTab.header = this.createAndConfigureElement("div", {className: "tab-menu"});
        newTab.edit = this.createAndConfigureElement("button", {className: "tab-menu-btn edit-back", event: { name: "click", callback: this.tabOptions.bind(this, newTab) }});
        newTab.delete = this.createAndConfigureElement("button", {className: "tab-menu-btn delete-back", event: { name: "click", callback: newTab.delete }});
        newTab.expand = this.createAndConfigureElement("button", {className: "tab-menu-btn expand-arrow", event: { name: "click", callback: newTab.toggle }});
        newTab.grab = this.createAndConfigureElement("span", {className: "hover-zone", event: { name: "mousedown", callback: newTab.grab }});
        
        moveElementsTo(newTab.header, ...[newTab.edit, newTab.delete, newTab.expand, newTab.grab]);
        newTab.header.appendChild(this.createAndConfigureElement("h3", {innerHTML: title?.toUpperCase() || "", className: "tab-menu-name"}));
        newTab.appendChild(newTab.header);

        this.tabs.push(newTab);
        this.tabIndex.push(newTab.id);
        return newTab;
    }

    // ◙ ACTIONS ◙

    help() {}

    createNewTab(badge) {
        let newTab = this.createTab(null, new Date().getTime());
        this.badgeTabs.insert(newTab, 0);
        if (badge) badge.moveTo(newTab.id);
        this.tabOptions(newTab);
    }

    badgeOptions(badge) {
        if (this.modal) this.activeMenu?.close();
        this.modal = true;
        
        // Create and configure menu elements
        let menu = this.createAndConfigureElement("div", { className: "badge-menu", event: { name: "click", callback: (e)=>{e.stopPropagation()} } });
        menu.head = this.createAndConfigureElement("div", { className: "menu-head" });
        menu.body = this.createAndConfigureElement("div", { className: "menu-body" });
        menu.favorite = this.createAndConfigureElement("button", {className: "badge-menu-btn favorite", event: { name: "click", callback: ()=>{} }});
        menu.new = this.createAndConfigureElement("button", {className: "badge-menu-btn new", event: { name: "click", callback: ()=>{
            menu.close();
            this.createNewTab(badge);
        }}});
        badge.menu = menu;
        this.activeMenu = menu;

        menu.close = () => {
            menu.remove();
            badge.menu = null;
            this.modal = false;
            badge.unlock();
        }

        badge.lock();

        // Start adding elements to DOM
        moveElementsTo(menu.head, ...[menu.favorite, menu.new]);
        appendChildren(menu, [menu.head, menu.body]);
        badge.appendChild(menu);

        // Generate tab selection list and append to menu in the order that they appear in the side-panel
        Object.nonFunctionKeys(this.badgeTabs).sort((tabA, tabB) => this.badgeTabs[tabA].index - this.badgeTabs[tabB].index).forEach(tabKey => {
            let tab = this.badgeTabs[tabKey];
            let item = this.createAndConfigureElement("span", {
                className: "tab-selector",
                innerHTML: tab.name,
                event: { name: "click", callback: badge.moveTo.bind(this, tabKey) }
            });
            item.style.setProperty("--color", tab.color);
            menu.body.appendChild(item);
        })
        
        // Set menu position to be right of the badge and centered vertically
        let viewportPosition = menu.getBoundingClientRect();
        let difference = {x:0, y:-menu.offsetHeight/2 + badge.offsetHeight/2};
        
        if (viewportPosition.top + difference.y < 60) difference.y = 60 - viewportPosition.top;
        if (viewportPosition.bottom + difference.y > window.innerHeight) difference.y = window.innerHeight - viewportPosition.bottom;

        menu.style.left = `${difference.x + badge.offsetWidth}px`;
        menu.style.top = `${difference.y}px`;
    }

    tabOptions(tab) {
        if (this.modal) this.activeMenu.close();
        this.modal = true;
        
        // Create and configure menu elements
        let menu = this.createAndConfigureElement("div", { className: "badge-menu", event: { name: "click", callback: (e)=>{e.stopPropagation()} } });
        menu.body = this.createAndConfigureElement("div", { className: "menu-body", style: { display: 'flex', flexDirection: 'column' } });
        menu.colorContainer = this.createAndConfigureElement("div", { id: "color-picker", title: "iro.js by James Daniel" });
        menu.nameField = this.createAndConfigureElement("input", { id: "name", className: "menu-input", placeholder: "Tab name...", value: tab.getName() });
        this.activeMenu = menu;

        menu.close = () => {
            this.badgeTabs.update(tab);
            menu.remove();
            this.modal = false;
        }

        // Start adding elements to DOM
        moveElementsTo(menu.body, ...[menu.colorContainer, menu.nameField]);
        moveElementsTo(menu, ...[menu.body]);
        tab.header.appendChild(menu);

        // Add the color picker
        menu.colorPicker = new iro.ColorPicker("#color-picker", {
            width: 86,
            sliderSize: 15,
            layoutDirection: "vertical",
            borderWidth: 2,
            borderColor: "#555",
            color: { r: getRandomInt(255), g:getRandomInt(255), b:getRandomInt(255) }
        });

        // If the color has already been set, use that instead of a random color
        if (tab.style.borderColor) menu.colorPicker.color.hexString = convertColor(tab.style.borderColor);

        // Set event listeners to update tab when changes are made
        menu.colorPicker.on('color:change', (color) => { tab.style.borderColor = color.hexString; tab.color = color.hexString; } )
        menu.nameField.addEventListener('input', (e) => tab.setName(e.target.value) )
        
        // Set menu position to be right of the badge and centered vertically
        let viewportPosition = menu.getBoundingClientRect();
        let difference = {x:0, y:-menu.offsetHeight/2 + tab.header.offsetHeight/2};
        
        if (viewportPosition.top + difference.y < 60) difference.y = 60 - viewportPosition.top;
        if (viewportPosition.bottom + difference.y > window.innerHeight) difference.y = window.innerHeight - viewportPosition.bottom;

        menu.style.left = `${difference.x + tab.header.offsetWidth}px`;
        menu.style.top = `${difference.y}px`;
    }

    handleSubscription(badge) {
        if (this.modal) this.activeMenu.close();
        this.modal = true;

        let popUp = this.createAndConfigureElement("div", { className: "new-badge-popup ytt-popup" });
        popUp.exit = this.createAndConfigureElement("btn", { className: "exit" });
        popUp.body = this.createAndConfigureElement("div", { className: "popup-body" });
        popUp.text = this.createAndConfigureElement("p", { className: "header", innerHTML: "Where would you like to put this subscription?" });
        this.activePage = popUp;
        
        popUp.close = () => {
            popUp.remove();
            this.activeMenu?.close();
            this.modal = false;
        }

        // Clicking badge menu causes this pop-up to close, also removing badge menu
        // Override needed

        moveElementsTo(popUp, ...[popUp.exit, popUp.body]);
        moveElementsTo(popUp.body, ...[
            popUp.text,
            this.createAndConfigureElement("div", { className: "ruler" }),
            badge
        ]);
        document.body.append(popUp);

    }

    // ▲ HELPER FUNCTIONS ▲

    getChannelIDFromPage() {
        // wait .5s to let page set
        if (window.location.href.includes("watch?")) { // If we are on a video page
            let id = document.querySelector("#upload-info[class*='style-scope']").querySelector("a").innerHTML;
            return id;
        } else if (window.location.href.includes("https://www.youtube.com/channel/") || window.location.href.includes("https://www.youtube.com/c/")) { // If we are on a channel page
            let id = document.getElementById("inner-header-container").querySelector("#text").innerHTML;
            return id;
        }
    }

    isInViewport(elem) {
        var bounding = elem.getBoundingClientRect();
        return (
            bounding.top >= 0 &&
            bounding.left >= 0 &&
            bounding.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            bounding.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    };

    createAndConfigureElement(type, properties) {
        let newNode = document.createElement(type);

        // If there is an event in the properties, add an event listener
        if (properties.event) { newNode.addEventListener(properties.event.name, properties.event.callback); delete properties.event; }

        // Assign the rest of the properties
        newNode = Object.assign(newNode, properties);

        // STYLE : If it is a string, apply it directly. If it is an object, copy any new key value pairs and overwrite the older ones
        // This has to be done separately because setting via Object.assign does not properly set the style property for some reason
        if (typeof properties.style == "string") newNode.style = properties.style;
        else if (typeof properties.style == "object") Object.assign(newNode.style, properties.style); 

        return newNode;
    }

    setStyle(element, style) {
        // STYLE : If it is a string, apply it directly. If it is an object, copy any new key value pairs and overwrite the older ones
        if (typeof style == "string") element.style = style;
        else if (typeof style == "object") Object.assign(element.style, style); 
    }

    getChannelIDFromBadge(badge) {
        let channel = badge.children[0].title;
        return channel; // channel IDs are either custom channel names or auto-generated IDs. I.e, they are inconsistent and can no longer be used
    }

    save() {
        localStorage.setItem("subscription_links", JSON.stringify(this.badgeTabAssociations));
        localStorage.setItem("subscription_tabs", JSON.stringify(this.badgeTabs));
    }
}

// Raw JS InsertAfter code from StackOverflow. StackOverflow FTW!
function insertAfter(referenceNode, newNode) {
    referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}

function moveElementsTo(newParent, ...children) { children.forEach((child)=>newParent.appendChild(child)); }



function waitForPageLoad() {
    check = setInterval(function(){
        if (document.getElementsByClassName("tab").length > 0) { return; } // If we already have set tabs
        if (!document.getElementById("contentContainer").getAttribute("opened") == null) { return; } // If the side menu has not been opened yet
        if (!document.getElementById("sections")) { return; } // If the sections have not been populated yet

        guide = document.getElementById("guide-content");
        innerGuide = document.getElementById("guide-inner-content");

        // Get browser agent
        userAgent = navigator.userAgent;
        
        // Sections > Subscription Renderer > Subscription List
        // Get "Show # More" button (<a> element)
        // Click it

        subList = document.querySelectorAll("#sections .style-scope #items")[1];
        if (subList == null) { return; } // If the guide hasn't been opened yet, it hasn't been populated with menu options or subscriptions, leading subList to be null

        expandBtn = document.querySelectorAll("#expander-item")[1];  // find all expander items. This finds 2 matches, the parent of "Show more", and the parent of "Show ### more"
        if (!expandBtn) { expandBtn = document.querySelectorAll("#expander-item")[0]; }   // EXCEPT when the user does not have any saved playlists! In that case, this only finds 2 matches, with the 2nd being "Show ### more"
        expandBtn.click();
        
        clearInterval(check);
        setupSubs();
        
        let ver = "";
        try { ver = browser.runtime.getManifest().version; }
        catch (e) {
            try { ver = chrome.runtime.getManifest().version; }
            catch (e) { console.log("[Youtube Tabs] Unable to get version from manifest"); }
        }
        
        let storedVer = localStorage.getItem("youtube_tabs_version");
        if (storedVer != ver) {
            localStorage.setItem("youtube_tabs_version", ver);
            help();
        }

        onPageUpdate();
    }, 100);
}

function setupSubs() {
    console.log("[Youtube Tabs] LOADED")
    loaded = true;

    // Allow overflow to make subs visible
    guide.style.overflow = "visible";
    innerGuide.style.overflow = "visible";
    innerGuide.style.transition = "margin-top 0.1s linear";
    innerGuide.addEventListener("wheel", function(e) {
        if (pulledMenu) { return }
        scrollDist -= e.deltaY * 0.75;
        scrollDist = Math.min(Math.max(scrollDist, -innerGuide.offsetHeight + window.innerHeight), 0);
        innerGuide.style.marginTop = scrollDist + "px";
    })

    // Get the sub widget container
    widgetContainer = document.querySelectorAll("#sections .style-scope #items")[1];
    widgetContainer.style.position = "relative";
    // Get the "show more" widget, reposition the subs from within it to the container, and delete the expandable widget
    expandableWidget = widgetContainer.childNodes[widgetContainer.childNodes.length-1];
    appendChildren(widgetContainer, Array.from(expandableWidget.childNodes[3].childNodes[1].childNodes));
    expandableWidget.remove();

    // Get the "Subscriptions" element and add our help/info button
    infoBtn = document.createElement("div"); infoBtn.className = "info-btn"; infoBtn.style.backgroundImage = "url('https://i.imgur.com/9RJ5eKQ.png')"; infoBtn.title = "Help/Info";
    infoBtn.addEventListener("click", help);
    widgetContainer.parentElement.childNodes[1].appendChild(infoBtn);

    // Get saved data
    subLinkDict = JSON.parse(localStorage.getItem("subscription_links"));
    if (!(subLinkDict)) { subLinkDict = {}; }

    // Get the sub widgets and add our new functionality to them
    // Add tabs to the container
    setupTabs();
    updateSubs();

    // Check and update any new subs to add tab functionality
    setInterval(function(){
        updateSubs(true);
    }, 1000);
}

function updateSubs(filter) {
    widgets = getSubs(widgetContainer, filter);
    if (!widgets) { return; }


    // Sort the widgets by
    // >>>  Tab Index
    // >>   Status
    // >    Name
    widgets.sort((a, b) => {
        aID = getChannelIDFromNode(a); bID = getChannelIDFromNode(b);
        aTabIndex = -1; bTabIndex = -1;
        aStatus = (a.getAttribute("line-end-style") != "none") ? 1 : 0;
        bStatus = (b.getAttribute("line-end-style") != "none") ? 1 : 0;
        if (aID in subLinkDict) {
            if (subLinkDict[aID] != -1 && subTabDict[subLinkDict[aID]] != undefined) {
                aTabIndex = subTabDict[ subLinkDict[aID] ].index;
            }
        } if (bID in subLinkDict) {
            if (subLinkDict[bID] != -1 && subTabDict[subLinkDict[bID]] != undefined) {
                bTabIndex = subTabDict[ subLinkDict[bID] ].index;
            }
        }

        if (aTabIndex < bTabIndex) { return 1; }        // If a index is lower than b index, +1
        else if (aTabIndex > bTabIndex) { return -1; }  // If a index is higher than b index, -1
        else if (aStatus < bStatus) { return 1; }       // If a status is less active than b status, +1
        else if (aStatus > bStatus) { return -1; }       // If a status is more active than b status, -1
        else { return aID.localeCompare(bID); }             // Compare IDs
    })

    addSubSlides(widgets);
    addSubListeners(widgets);
    checkDarkMode();
}

function onPageUpdate() {
    getSubscribeButton(function(btn) {
        if (btn != null) { addSubscribeWidget(btn); }
    });
}

function addSubSlides(nodes) {
    for (index in nodes) {
        if (!nodes[index]) { continue; }
        sub = document.createElement("span"); sub.className = "sub"
        subSlide = document.createElement("div"); subSlide.className = "sub-slide"
        subIcon = document.createElement("div"); subIcon.className = "sub-icon"
        subCover = document.createElement("div"); subCover.className = "sub-cover"
        subSlide.appendChild(subIcon);
        sub.appendChild(subSlide);
        sub.appendChild(subCover);
        sub.id = getChannelIDFromNode(nodes[index]);

        nodes[index].style = "z-index: 1; overflow: visible;";
        nodes[index].appendChild(sub);
        nodes[index].insertBefore(sub, nodes[index].firstChild);

        // If this subscription doesn't have a value in the subTab dictionary
        if (!(sub.id in subLinkDict)) {
            subLinkDict[sub.id] = -1;
        } else if (subLinkDict[sub.id] != -1) {
            if (subTabDict[ subLinkDict[sub.id] ] != undefined) {
                tabNum = subTabDict[ subLinkDict[sub.id] ].index;
            } else {
                tabNum = -1;
            }
            // Set sub as child of corresponding tab
            if (tabNum >= 0 && tabNodes[tabNum]) {
                tabNodes[tabNum].appendChild(nodes[index]);
            } else {
                subLinkDict[sub.id] = -1;
            }
        }
    }
    if (nodes) { saveData(); }
}

function addSubListeners(nodes) {
    // Close sub button if we mouse out of the 'items' div
    widgetContainer.addEventListener('mouseout', pushSub)
    for (index in nodes) {
        // nodes[index].addEventListener('mouseover', pullSub)
        nodes[index].firstChild.addEventListener('click', pullSub)
    }
}

function addSubscribeWidget(btn) {
    if (btn.childNodes.length == 0) { return; }
    if (subscriptionWidgetPromise) { clearInterval(subscriptionWidgetPromise); } // Shutdown any previous custom "watchForSubscribeChange" promises
    let oldBtn = document.getElementsByClassName("sub-widget")[0]; if (oldBtn) { oldBtn.remove(); } // Remove any old subscribe widgets

    let subWidget = document.createElement("div"); subWidget.className = "sub-widget";
    getChannelIDFromPage(function(id) { subWidget.id = id}); // set ID after getting data from callback
    
    btn.childNodes[0].appendChild(subWidget);
    subWidget.addEventListener("click", subMenu);

    subscriptionWidgetPromise = watchForSubscribeChange(btn, adaptSubscribeWidget)
    adaptSubscribeWidget(btn); // adapt subscribe widget for current subscription status
}



function subMenu(e) {
    // Click +
    // List of subs & "Add a sub"
    if (pulledMenu) { return; }
    e.stopPropagation();
    pulledMenu = document.createElement("div"); pulledMenu.className = "sub-menu";
    e.currentTarget.appendChild(pulledMenu);
    if (e.currentTarget.className == "sub-widget") { pulledSub = e.currentTarget; } // Pretend the subscribe button widget is a pulled sub for this special case
    setupSubMenu();

    console.log("pulled sub:", pulledSub);

    difference = {x:0, y:-pulledMenu.offsetHeight/2 + e.currentTarget.offsetHeight/2};
    pulledMenu.style.left = difference.x + e.currentTarget.offsetWidth + "px";
    pulledMenu.style.top = difference.y + "px";

    pulledMenu.addEventListener('mouseout', closeMenu);
    pushSub(e);
}

function tabMenu(e, edit) {
    e.stopPropagation();
    let container = pulledSub;
    if (edit) { container = edit; }

    // Create tab-menu containers
    let colorMenu = document.createElement("div"); colorMenu.className = "create-tab-menu";
    let colorDiv = document.createElement("div"); colorDiv.id = "color-picker";
    let credit = document.createElement("p"); credit.style = "position: absolute; z-index: 1; color: #555; font-size: 7px;"; credit.innerHTML = "IRO.JS"
    colorMenu.appendChild(credit);
    colorMenu.appendChild(colorDiv);
    container.appendChild(colorMenu);

    // Add Color Picker UI
    colorPicker = new iro.ColorPicker("#color-picker", {
        width: 100,
        sliderSize: 15,
        layoutDirection: "horizontal",
        borderWidth: 2,
        borderColor: "#ddd",
        color: { r: getRandomInt(255), g:getRandomInt(255), b:getRandomInt(255) }
    });

    let difference = {};
    if (!edit) {
        difference = {x:0, y:-colorMenu.offsetHeight/2 + container.offsetHeight/2};
    } else {
        difference = {x:-5, y:-colorMenu.offsetHeight/2 + 20};
    }
    colorMenu.style.left = difference.x + container.offsetWidth + "px";
    colorMenu.style.top = difference.y + "px";

    // Add Tab Menu UI
    let name = document.createElement("input"); name.id = "create-tab-name"; name.placeholder = "Tab Name";
    let cancel = document.createElement("button"); cancel.className = "create-tab-btn"; cancel.innerHTML = "Cancel"; cancel.style = "margin-right: 5px; background-color: black; color: #fefefe;";
    let confirm = document.createElement("button"); confirm.className = "create-tab-btn"; confirm.innerHTML = "Confirm"; confirm.style = "background-color: white;";
    if (edit) { name.value = edit.title; }

    colorMenu.appendChild(name);
    colorMenu.appendChild(cancel);
    colorMenu.appendChild(confirm);

    if (darkModeEnabled) {
        colorMenu.classList.add("dark");
        name.style.backgroundColor = "#000";
        name.classList.add("dark-menu-item");
    }

    name.addEventListener('click', interruptClick); // Stop click from causing a redirect to channel page
    cancel.addEventListener('click', closeMenu);
    if (!edit) { confirm.addEventListener('click', createTab); }
    else { confirm.addEventListener('click', editTab); }


    // Replace menu with create tab menu
    if (pulledMenu) { pulledMenu.remove(); }
    pulledMenu = colorMenu;
}



function pullSub(e) {
    e.stopPropagation()
    if (pulledMenu) { return }
    // if (pulledSub) {
    //     if (pulledSub.className != "sub-widget") {
    //         pulledSub.firstChild.style.left = "0px"
    //         pulledSub.lastChild.style.boxShadow = "3px 0 1px -3px white"
    //     }
    // }
    pulledSub = e.currentTarget;

    console.log("pulled sub:", pulledSub);
    // pulledSub.firstChild.style.left = "40px"
    // pulledSub.lastChild.style.boxShadow = "3px 0 1px -3px gray"
    // pulledSub.lastChild.style.backgroundColor = "#ededed"
    subMenu(e);
}

function pushSub(e) {
    e.stopPropagation()
    if (pulledSub) {
        if (pulledSub.className == "sub-widget") { return; }
        // pulledSub.firstChild.style.left = "0px"
        // pulledSub.lastChild.style.boxShadow = "3px 0 1px -3px white"
        // pulledSub.lastChild.style.backgroundColor = "white"
        // pulledSub.removeEventListener('click', subMenu)
    }
}

function closeMenu(e) {
    if (e) { e.stopPropagation(); }
    if (!pulledMenu) { return; }
    if (e && e.relatedTarget && (e.relatedTarget.parentElement == pulledMenu || e.relatedTarget == pulledMenu)) { return } // JS stupidity causes 'mouseout' to call when hovering over child elements OF THE MENU!!!
    pulledMenu.remove();
    pulledMenu = null;
}

function moveSubToTab(e, id) {
    let tabId = 0;
    if (id) { tabId = id; }
    else {
        e.stopPropagation();
        tabId = parseInt(e.target.id);
    }
    
    closeMenu();
    
    // If we're dealing with a subscription widget, skip appending it to a tab.
    if (pulledSub.className != "sub-widget") {
        if (tabId != -1) {
            tabNodes[ subTabDict[tabId].index ].appendChild(pulledSub.parentElement);
        } else {
            widgetContainer.appendChild(pulledSub.parentElement);
        }
    } else {
        subLinkDict[pulledSub.id] = tabId;
        saveData();

        updateSubs(true);
        sortSub(tabId, pulledSub.id);
    }

    subLinkDict[pulledSub.id] = tabId;
    saveData();
}

function sortSub(tabId, subId) {
    let sub = document.querySelector(`.sub[id='${subId}']`).parentElement; // Get element with .sub class and id equal to our subscription
    if (tabId != -1) { tabNodes[ subTabDict[tabId].index ].appendChild(sub); }
    else { widgetContainer.appendChild(sub) }
}

function createTab(e) {
    e.stopPropagation();

    let tabName = document.getElementById("create-tab-name").value;
    let tabColor = colorPicker.color.hexString;

    // If the user didn't set a name, mark the input field
    if (tabName == "") {
        document.getElementById("create-tab-name").style.borderColor = "red";
        return;
    } else {
        closeMenu(e);
    }

    let tab = generateTab(tabName, new Date().getTime(), tabColor);
    // Insert tab after the last visible tab in the menu
    insertAfter(widgetContainer.childNodes[tabNodes.length-1], tab);

    subLinkDict[pulledSub.id] = parseInt(tab.id);
    subTabDict[ parseInt(tab.id) ] = {
        name: tab.title,
        index: tabNodes.length-1,
        color: convertColor(tab.style.borderColor),
        hidden: false
    };
    
    moveSubToTab(null, parseInt(tab.id));
    saveData();
}

function editTab(e) {
    e.stopPropagation();
    let tab = e.target.parentElement.parentElement;
    if (e.target.className.includes("create-tab-btn")) {
        let tabName = document.getElementById("create-tab-name").value;

        if (tabName == "") {
            document.getElementById("create-tab-name").style.borderColor = "red";
            return;
        }
        console.log("[Youtube Tabs] EDIT CONFIRMED");

        // Edit values in save data
        let subTab = subTabDict[ parseInt(tab.id) ];
        subTab.name = tabName;
        subTab.color = colorPicker.color.hexString;

        // Edit values in elements
        tab.title = tabName;
        tab.childNodes[0].childNodes[3].innerHTML = tabName.toUpperCase();
        tab.style.borderColor = colorPicker.color.hexString;
        tab.style.overflow = subTab.hidden;

        // SAVE DATA
        closeMenu();
        saveData();
    } else {
        console.log("[Youtube Tabs] EDITING: " + tab.title);
        tabMenu(e, tab);

        colorPicker.color.hexString = convertColor(tab.style.borderColor);
        tab.style.overflow = "visible";
    }
}

function deleteTab(e) {
    e.stopPropagation();
    let tab = e.target.parentElement.parentElement;
    console.log("[Youtube Tabs] DELETING: " + tab.title);
    let confirmed = confirm(`Are you sure you want to delete '${tab.title}'?`)
    if (confirmed) {
        console.log("[Youtube Tabs] DELETE CONFIRMED");

        // Edit values in save data
        // Update higher tabs' indexes
        for (key in subTabDict) {
            if (subTabDict[key].index > subTabDict[parseInt(tab.id)].index) {
                subTabDict[key].index--;
            }
        }

        // Update child subs
        for (key in subLinkDict) {
            if (subLinkDict[key] == parseInt(tab.id)) {
                subLinkDict[key] = -1;
            }
        }

        // Remove from lists
        tabNodes.splice(subTabDict[parseInt(tab.id)].index, 1)
        delete subTabDict[parseInt(tab.id)];

        // Edit values in elements
        appendChildren(widgetContainer, getSubs(tab));
        tab.remove();
        saveData();
    }
}

function toggleTab(e) {
    e.stopPropagation();
    let tab = e.target.parentElement.parentElement;
    if (subTabDict[parseInt(tab.id)].hidden) {
        console.log("[Youtube Tabs] SHOWING: " + tab.title);
        tab.style.maxHeight = (userAgent.includes("Firefox") ? "-moz-max-content" : "fit-content");
        tab.style.overflow = "visible";
        tab.firstChild.childNodes[2].style.transform = "rotate(0deg)";
    } else {
        console.log("[Youtube Tabs] HIDING: " + tab.title);
        // Set to 50px to show tab-menu
        tab.style.maxHeight = "50px";
        tab.style.overflow = "hidden";
        tab.firstChild.childNodes[2].style.transform = "rotate(180deg)";
    }

    // Invert the hidden property of this sub in the saved data
    subTabDict[parseInt(tab.id)].hidden = !subTabDict[parseInt(tab.id)].hidden;
    saveData();
}

function showTab(tab) {
    // Explicitly force a tab to show rather than toggle
    console.log("[Youtube Tabs] SHOWING: " + tab.title);
    tab.style.maxHeight = (userAgent.includes("Firefox") ? "-moz-max-content" : "fit-content");
    tab.style.overflow = "visible";
    tab.firstChild.childNodes[2].style.transform = "rotate(0deg)";
}

function hideTab(tab) {
    // Explicitly force a tab to hide rather than toggle
    console.log("[Youtube Tabs] HIDING: " + tab.title);
    // Set to 50px to show tab-menu
    tab.style.maxHeight = "50px";
    tab.style.overflow = "hidden";
    tab.firstChild.childNodes[2].style.transform = "rotate(180deg)";
}

function grabTab(e) {
    e.stopPropagation();
    let tab = e.target.parentElement.parentElement;
    grabbedTab = tab;
    document.body.style.cursor = "grabbing";
    // Make list of tabs and their current show status
    // Hide all tabs
    // Focus mouse on current grab position to prevent skipping in the next step
    // Add mouseover event to every tab and switch tab indexes when the event is encountered
    // Revert all changes except for changes to index when mousebutton is let go > placeTab()
    // Clear shared variables

    innerGuide.style.transition = null; // Temporarily disable easing on innerGuide to make it an instantaneous movement
    let prevPos = tab.getBoundingClientRect().top;

    for (index in tabNodes) {
        subProps[tabNodes[index].id] = { hidden: (tabNodes[index].style.overflow == "hidden") ? true : false};
        if (!subProps[tabNodes[index].id].hidden) { hideTab(tabNodes[index]); }
        tabNodes[index].addEventListener('mouseenter', moveTab);
    }

    let posDifference = tab.getBoundingClientRect().top - prevPos;
    innerGuide.style.marginTop = (parseInt(innerGuide.style.marginTop) - posDifference) + "px";
    scrollDist -= posDifference;

    window.addEventListener("mouseup", placeTab);
}

function placeTab(e) {
    e.stopPropagation();
    // Show tabs that were previously not hidden
    // Clear shared variables
    // Set cursor back to normal
    // Revert misc changes
    // Remove listener for mouseup
    // Save data

    for (key in subProps) {
        if (!subProps[key].hidden) {
            showTab(document.getElementById(key));
        }
    }

    for (index in tabNodes) {
        tabNodes[index].removeEventListener('mouseenter', moveTab);
    }

    subProps = {};
    grabbedTab = null;
    document.body.style.cursor = "default";
    innerGuide.style.transition = "all 0.05s ease-out";
    window.removeEventListener("mouseup", placeTab);
    saveData();
}

function moveTab(e) {
    // Get target id and check if index is greater or less than grabbed tab index
    // Greater than, insert after
    // Less than, insert before
    // Either way, update indexes in subTabDict

    if (e.target == grabbedTab) { return; }
    if (!e.target.className.includes("tab")) { return; }
    if (subTabDict[e.target.id].index > subTabDict[grabbedTab.id].index) {
        insertAfter(e.target, grabbedTab);
    } else {
        widgetContainer.insertBefore(grabbedTab, e.target);
    }

    let newIndex = subTabDict[e.target.id].index;
    subTabDict[e.target.id].index = subTabDict[grabbedTab.id].index;
    subTabDict[grabbedTab.id].index = newIndex;
}

function interruptClick(e) {
    e.stopPropagation();
}




function help(e) {
    if (helpMenu) { return; }
    let ver = "";
    try { ver = browser.runtime.getManifest().version; }
    catch (e) {
        try { ver = chrome.runtime.getManifest().version; }
        catch (e) { console.log("[Youtube Tabs] Unable to get version from manifest"); }
    }
    let poster = `
    <div class="poster">
        <div class="poster-close"></div>
        <img class="poster-img" src="https://i.imgur.com/9RJ5eKQ.png">
        <br>
        <a class="poster-support" href="https://ko-fi.com/geek" target="_blank">Support Me with a Rubber Ducky</a>
        <br>
        <br>
        <h1>Youtube Tabs</h1>
        <br>
        <h5>Created by Grant @ Geek Overdrive</h5>
        <br>
        <h3>${ver} Update</h3>

        <br>
        <br>
        <div class="poster-change-notes">
            <p>- Youtube Tabs no longer relies on English to work
            <b>Note: individual sub-widgets will reset if the content creator changes their channel name. Unfortunately, this can't be worked around, but thankfully it should be very rare</b>
        </div>
        <br>
        <br>

        <h2>Creating Tabs and Organizing Subs</h2>
        <p class="poster-text">To create a tab, mouse over a sub. A button will pop out.
            Click that button and scroll down to the 'Add a Tab' button. Customize as you wish and hit 'Confirm'.</p>
        <br>
        <p class="poster-text">To sort a sub, mouse over it. A button will pop out.
            Click that button and select the tab you want to sort it into.</p>
        <img class="poster-img" src="https://i.imgur.com/x0SQvik.gif">

        <h2>Show/Hide Tabs</h2>
        <p class="poster-text">To show or hide a tab, mouse over the arrow icon in the tab's head.
            Click it to toggle the tab's visibility.</p>
        <img class="poster-img" src="https://i.imgur.com/MUlhz4e.gif">

        <h2>Editing Tabs</h2>
        <p class="poster-text">To edit a tab, mouse over the pen icon in the tab's head.
            Click it and customize the tab's settings with the menu that pops out.</p>
        <img class="poster-img" src="https://i.imgur.com/X4CfUOn.gif">

        <h2>Deleting Tabs</h2>
        <p class="poster-text">To delete a tab, mouse over the trash can icon in the tab's head.
            Click it and hit 'confirm' in the alert menu.</p>
        <img class="poster-img" src="https://i.imgur.com/AjuYDky.gif">

        <h2>Moving Tabs</h2>
        <p class="poster-text">To move a tab, mouse over the right side of the tab's head. A sandwich icon will appear.
            Click, hold, and drag the tab to move it.</p>
        <img class="poster-img" src="https://i.imgur.com/YIwtfgO.gif">

        <br>
        <br>
        <br>
        <p class="poster-text">Thanks for using my extension! If you would be so kind,
            please give it a rating 
            (<a href="https://chrome.google.com/webstore/detail/youtube-tabs/jfdifkfmidcljpedkckpampdeffhlfhn" target="_blank">Chrome</a>)
            (<a href="https://chrome.google.com/webstore/detail/youtube-tabs/jfdifkfmidcljpedkckpampdeffhlfhn" target="_blank">Firefox</a>)
            or <a href="https://ko-fi.com/geek" target="_blank">support me</a> for the work that I put into this.</p>
        <br>
        <br>
        <br>
    </div>
    `

    darkContainer = document.createElement("div"); darkContainer.className = "darken"; darkContainer.innerHTML = poster;
    if (darkModeEnabled) { darkContainer.childNodes[1].classList.add("dark"); darkContainer.childNodes[1].classList.add("dark-menu-item"); }
    document.body.prepend(darkContainer);
    
    helpMenu = darkContainer;
    document.getElementsByClassName("poster-close")[0].addEventListener("click", closeHelpMenu)
}

function closeHelpMenu(e) {
    e.stopPropagation();
    if (helpMenu) { helpMenu.remove(); }
    helpMenu = null;
}

function setupSubMenu() {
    for (tab in tabNodes) {
        menuItem = document.createElement("div"); menuItem.className = "menu-link"; menuItem.innerHTML = tabNodes[tab].title.toUpperCase(); menuItem.id = tabNodes[tab].id;
        menuItem.addEventListener('click', moveSubToTab);
        pulledMenu.appendChild(menuItem);

        if (darkModeEnabled) { menuItem.classList.add("dark-menu-item"); }
    }
    
    line = document.createElement("hr"); line.style = "border-top: 1px solid lightgray; width: 90%; margin: auto; padding-bottom: 5px; margin-top: 5px;";
    addTab = document.createElement("div"); addTab.className = "menu-link"; addTab.innerHTML = "ADD A TAB";
    addTab.addEventListener('click', tabMenu);

    if (darkModeEnabled) { addTab.classList.add("dark-menu-item"); }
    
    pulledMenu.appendChild(line);
    pulledMenu.appendChild(addTab);

    if (darkModeEnabled) { pulledMenu.classList.add("dark"); }

    // If this sub is already in a tab...
    if (!pulledSub) { return; }
    if (subLinkDict[pulledSub.id] != -1) {
        removeFromTab = document.createElement("div"); removeFromTab.className = "menu-link"; removeFromTab.id = -1; removeFromTab.innerHTML = "REMOVE FROM TAB";
        removeFromTab.addEventListener('click', moveSubToTab);
        pulledMenu.appendChild(removeFromTab);

        if (darkModeEnabled) { removeFromTab.classList.add("dark-menu-item"); }
    }

}

function setupTabs() {
    subTabDict = JSON.parse(localStorage.getItem("subscription_tabs"));
    if (!(subTabDict)) {
        subTabDict = {};
        return;
    }

    // Sort tabs according to index property
    let tuples = [];
    for (let key in subTabDict) tuples.push([key, subTabDict[key].index]);

    tuples.sort(function(a, b) {
        a = a[1];
        b = b[1];

        return a < b ? -1 : (a > b ? 1 : 0);
    });

    // Generate tab in sorted order
    for (var i = 0; i < tuples.length; i++) {
        let sortedKey = tuples[i][0];

        generateTab(subTabDict[sortedKey].name, sortedKey, subTabDict[sortedKey].color, subTabDict[sortedKey].hidden);
    }

    
}

function generateTab(name, id, color, hidden) {
    let tab = document.createElement("div"); tab.className = "tab"; tab.title = name; tab.id = id; tab.style.borderColor = color;
    let tabHeader = document.createElement("div"); tabHeader.className = "tab-menu";
    let tabHeaderEdit = document.createElement("div"); tabHeaderEdit.className = "tab-menu-btn edit-back"; tabHeaderEdit.title = "Edit";
    let tabHeaderDelete = document.createElement("div"); tabHeaderDelete.className = "tab-menu-btn delete-back"; tabHeaderDelete.title = "Delete";
    let tabHeaderExpand = document.createElement("div"); tabHeaderExpand.className = "tab-menu-btn expand-arrow"; tabHeaderExpand.title = "Expand/Contract";
    let tabHeaderName = document.createElement("h3"); tabHeaderName.innerHTML = name.toUpperCase(); tabHeaderName.className = "tab-menu-name";
    let tabHeaderGrab = document.createElement("div"); tabHeaderGrab.className = "tab-menu-btn grab"; tabHeaderGrab.title = "Grab";

    tabHeaderDelete.addEventListener('click', deleteTab);
    tabHeaderEdit.addEventListener('click', editTab);
    tabHeaderExpand.addEventListener('click', toggleTab);
    tabHeaderGrab.addEventListener('mousedown', grabTab);

    if (hidden) {
        // tab.style.overflow = "hidden"; TODO: Remove and replace sub items?
        tab.style.maxHeight = "50px";
        tabHeaderExpand.style.transform = "rotate(180deg)";
    }
    if (darkModeEnabled) {
        tab.classList.add("dark");
        tabHeader.classList.add("dark");
        tabHeaderName.classList.add("dark-menu-item");
    }

    tabHeader.appendChild(tabHeaderDelete);
    tabHeader.appendChild(tabHeaderEdit);
    tabHeader.appendChild(tabHeaderExpand);
    tabHeader.appendChild(tabHeaderName);
    tabHeader.appendChild(tabHeaderGrab);
    tab.appendChild(tabHeader);
    widgetContainer.appendChild(tab);
    
    if (tabNodes.length > 0) {
        insertAfter(tabNodes[tabNodes.length-1], tab);
    } else {
        widgetContainer.insertBefore(tab, widgetContainer.firstChild);
    }
    
    tabNodes.push(tab);
    return tab;
}

function updateLightMode(nodes) {
    console.log( (darkModeEnabled) ? "[Youtube Tabs] Enabling Dark Mode..." : "[Youtube Tabs] Disabling Dark Mode..." );
    for (index in nodes) {
        // First child (sub) > edit first and second child (sub-slide, sub-cover)
        let sub = nodes[index].firstChild;
        if (!sub) { continue; }
        if (darkModeEnabled) {
            sub.childNodes[0].classList.add("dark");
            sub.childNodes[1].classList.add("dark");
        } else {
            sub.childNodes[0].classList.remove("dark");
            sub.childNodes[1].classList.remove("dark");
        }
    }

    // first child (tab-menu) > edit third child (tab-menu-name)
    let tabs = document.getElementsByClassName("tab");
    for (index in tabs) {
        if (!tabs[index].classList) { continue; } // ?????? I don't even know why this is necessary
        if (darkModeEnabled) {
            tabs[index].classList.add("dark");
            tabs[index].firstChild.classList.add("dark");
            tabs[index].firstChild.childNodes[3].classList.add("dark-menu-item");
        } else {
            tabs[index].classList.remove("dark");
            tabs[index].firstChild.classList.remove("dark");
            tabs[index].firstChild.childNodes[3].classList.remove("dark-menu-item");
        }
    }
}

function checkDarkMode() {
    // Get the hex value of the actual computed style and compare it to known values
    guideOnDarkMode = rgb2hex( window.getComputedStyle(guide).getPropertyValue("background-color") ).includes("212121");
    if (darkModeEnabled != guideOnDarkMode) {
        darkModeEnabled = guideOnDarkMode;
        updateLightMode(getSubs(widgetContainer));
    }
}

// Given subscribe button, adapt the widget for your current subscription status
function adaptSubscribeWidget(btn) {
    let subWidget = document.getElementsByClassName("sub-widget")[0];
    if (isSubscribed(btn) && loaded && subWidget.id != null) { // If we are subscribed, the side-menu has been loaded, and subWidget was given an ID
        subWidget.style.display = "unset";
    } else {
        subWidget.style.display = "none";
    }
}

function watchForSubscribeChange(btn, callback) {
    let text = btn.childNodes[0].childNodes[1].childNodes[2].innerText;
    let check = setInterval(function(){
        if (text != btn.childNodes[0].childNodes[1].childNodes[2].innerText) {
            callback(btn);

            let waitAndUpdate = setInterval(function() {
                updateLightMode(getSubs(widgetContainer));  // Update light mode in case new subscription was added (white bg by default)
                clearInterval(waitAndUpdate);
            }, 500);
        }
        text = btn.childNodes[0].childNodes[1].childNodes[2].innerText;
    }, 100);
    return check;
}



function saveData() {
    localStorage.setItem("subscription_links", JSON.stringify(subLinkDict));
    localStorage.setItem("subscription_tabs", JSON.stringify(subTabDict));
}

function isSubscribed(subscribeBtn) {
    return (subscribeBtn.childNodes[0].childNodes[1].childNodes[2].innerText == "SUBSCRIBED");
}

function getSubs(container, filterNew) {
    let newList = [];
    let nodes = Array.from(container.childNodes);
    // nodes.length = 0 if the container is empty, but not actually........... What the frick.
    if (nodes.length < 1) { return null; }
    for (index in nodes) {
        // Apparently childNodes includes the text of some elements as a separate item, so it will be defined, but the class name will not
        if (!nodes[index].className) { continue; }
        // If this child is a tab, work through its children and skip the tab itself
        if (nodes[index].className.includes("tab")) {
            add = getSubs(nodes[index], filterNew);
            if (add) { newList.push.apply(newList, add); }
            continue;
        } else if (nodes[index].className.includes("tab-menu")) {
            continue;
        } else if (nodes[index].className.includes("create-tab-menu")) {
            continue;
        }

        // If we want to filter out subs that already have the tab elements...
        if (filterNew) {
            if (nodes[index].firstChild.className != null) { // If this "node" has a class name. <!--css-build:shady--> durrrr
                if (nodes[index].firstChild.className.includes("sub")) {
                    continue
                }
            }
        }
        newList.push(nodes[index]);
    }
    if (newList.length < 1) { return null; }
    return newList;
}

function getChannelIDFromNode(node) {
    let channelName = node.getElementsByClassName("title")[0].innerHTML;
    return channelName; // channel IDs are either custom channel names or auto-generated IDs. I.e, they are inconsistent and can no longer be used
}

async function getChannelIDFromPage(callback) {
    // wait .5s to let page set
    let check = setInterval(async function() {
        if (window.location.href.includes("watch?")) { // If we are on a video page
            let id = document.querySelector("#upload-info[class*='style-scope']").querySelector("a").innerHTML;
            console.log(id);

            if (id != "") { callback(id); }
        } else if (window.location.href.includes("https://www.youtube.com/channel/") || window.location.href.includes("https://www.youtube.com/c/")) { // If we are on a channel page
            let id = document.getElementById("inner-header-container").querySelector("#text").innerHTML;
            callback(id);
        } else {
            console.warn("[Youtube Tabs] Unable to get channel ID. Disabling subscription widget...");
            let subWidget = document.getElementsByClassName("sub-widget")[0]; if (subWidget) { subWidget.remove(); } // Remove any subscribe widgets
        }
        clearInterval(check);
    }, 500);
}

function getSubscribeButton(callback) {
    let tries = 0;
    let check = setInterval(function() {
        if (tries > 5) { clearInterval(check); }
        let btns = document.querySelectorAll("[id='subscribe-button']");
        let nodes = Array.from(btns);

        for (index in nodes) {
            // Look for ytd-video if this is a video (watch?) link and if not, ytd-c4
            if ( nodes[index].className.includes( (window.location.href.includes("watch?")) ? "ytd-video" : "ytd-c4-tabbed-header") ) {
                if (nodes[index].childNodes.length != 0) { // Empty check to ensure the subscription button has fully loaded before returning callback
                    callback(nodes[index]);
                    clearInterval(check); return;
                }
            }
        }
        tries++;
    }, 200)
}

function getMeta(metaName) {
    const metas = document.getElementsByTagName('meta');
  
    for (let i = 0; i < metas.length; i++) {
      if (metas[i].getAttribute('itemprop') === metaName) {
        return metas[i].getAttribute('content');
      }
    }
  
    return '';
}

function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max));
}

// Convert color from name or RGB string to hex value
function convertColor(color) { 
    var colors = { 
        "aliceblue":"#f0f8ff", "antiquewhite":"#faebd7", "aqua":"#00ffff", "aquamarine":"#7fffd4", "azure":"#f0ffff",  "beige":"#f5f5dc", "bisque":"#ffe4c4", "black":"#000000", "blanchedalmond":"#ffebcd", "blue":"#0000ff", "blueviolet":"#8a2be2", "brown":"#a52a2a", "burlywood":"#deb887",  "cadetblue":"#5f9ea0", "chartreuse":"#7fff00", "chocolate":"#d2691e", "coral":"#ff7f50", "cornflowerblue":"#6495ed", "cornsilk":"#fff8dc", "crimson":"#dc143c", "cyan":"#00ffff",  "darkblue":"#00008b", "darkcyan":"#008b8b", "darkgoldenrod":"#b8860b", "darkgray":"#a9a9a9", "darkgreen":"#006400", "darkkhaki":"#bdb76b", "darkmagenta":"#8b008b", "darkolivegreen":"#556b2f",  "darkorange":"#ff8c00", "darkorchid":"#9932cc", "darkred":"#8b0000", "darksalmon":"#e9967a", "darkseagreen":"#8fbc8f", "darkslateblue":"#483d8b", "darkslategray":"#2f4f4f", "darkturquoise":"#00ced1",  "darkviolet":"#9400d3", "deeppink":"#ff1493", "deepskyblue":"#00bfff", "dimgray":"#696969", "dodgerblue":"#1e90ff",  "firebrick":"#b22222", "floralwhite":"#fffaf0", "forestgreen":"#228b22", "fuchsia":"#ff00ff",  "gainsboro":"#dcdcdc", "ghostwhite":"#f8f8ff", "gold":"#ffd700", "goldenrod":"#daa520", "gray":"#808080", "green":"#008000", "greenyellow":"#adff2f", 
        "honeydew":"#f0fff0", "hotpink":"#ff69b4", "indianred ":"#cd5c5c", "indigo":"#4b0082", "ivory":"#fffff0", "khaki":"#f0e68c",  "lavender":"#e6e6fa", "lavenderblush":"#fff0f5", "lawngreen":"#7cfc00", "lemonchiffon":"#fffacd", "lightblue":"#add8e6", "lightcoral":"#f08080", "lightcyan":"#e0ffff", "lightgoldenrodyellow":"#fafad2",  "lightgrey":"#d3d3d3", "lightgreen":"#90ee90", "lightpink":"#ffb6c1", "lightsalmon":"#ffa07a", "lightseagreen":"#20b2aa", "lightskyblue":"#87cefa", "lightslategray":"#778899", "lightsteelblue":"#b0c4de",  "lightyellow":"#ffffe0", "lime":"#00ff00", "limegreen":"#32cd32", "linen":"#faf0e6",  "magenta":"#ff00ff", "maroon":"#800000", "mediumaquamarine":"#66cdaa", "mediumblue":"#0000cd", "mediumorchid":"#ba55d3", "mediumpurple":"#9370d8", "mediumseagreen":"#3cb371", "mediumslateblue":"#7b68ee",        "mediumspringgreen":"#00fa9a", "mediumturquoise":"#48d1cc", "mediumvioletred":"#c71585", "midnightblue":"#191970", "mintcream":"#f5fffa", "mistyrose":"#ffe4e1", "moccasin":"#ffe4b5", "navajowhite":"#ffdead", "navy":"#000080",  "oldlace":"#fdf5e6", "olive":"#808000", "olivedrab":"#6b8e23", "orange":"#ffa500", "orangered":"#ff4500", "orchid":"#da70d6",  "palegoldenrod":"#eee8aa", 
        "palegreen":"#98fb98", "paleturquoise":"#afeeee", "palevioletred":"#d87093", "papayawhip":"#ffefd5", "peachpuff":"#ffdab9", "peru":"#cd853f", "pink":"#ffc0cb", "plum":"#dda0dd", "powderblue":"#b0e0e6", "purple":"#800080",  "rebeccapurple":"#663399", "red":"#ff0000", "rosybrown":"#bc8f8f", "royalblue":"#4169e1",  "saddlebrown":"#8b4513", "salmon":"#fa8072", "sandybrown":"#f4a460", "seagreen":"#2e8b57", "seashell":"#fff5ee", "sienna":"#a0522d", "silver":"#c0c0c0", "skyblue":"#87ceeb", "slateblue":"#6a5acd", "slategray":"#708090", "snow":"#fffafa", "springgreen":"#00ff7f", "steelblue":"#4682b4",   "tan":"#d2b48c", "teal":"#008080", "thistle":"#d8bfd8", "tomato":"#ff6347", "turquoise":"#40e0d0", "violet":"#ee82ee",   "wheat":"#f5deb3", "white":"#ffffff", "whitesmoke":"#f5f5f5", "yellow":"#ffff00", "yellowgreen":"#9acd32" 
    };

    if (color == "") return colors["firebrick"];
          
    if (typeof colors[color.toLowerCase()] != 'undefined') return colors[color.toLowerCase()];
    else return rgb2hex(color);
    return false; 
}

//Function to convert rgb color to hex format
function rgb2hex(rgb) {
    rgb = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgb === null) { rgb = [0,0,0] } // rgb cas miss the match if the guide is set to transparent, which happens when the sideview is in mobile/slim mode
    return "#" + hex(rgb[1]) + hex(rgb[2]) + hex(rgb[3]);
}

function hex(x) {
    return isNaN(x) ? "00" : hexDigits[(x - x % 16) / 16] + hexDigits[x % 16];
}

function appendChildren(parent, children) {
    for (index in children) {
        parent.appendChild(children[index])
    }
}

// If the user browses to a different location, run it again
// I tried so many 'proper' ways to do this, including window.onlocationchange. Sometimes you have to screw the proper ways of doing things if they simply don't work or over-complicate things
// setInterval(function(){
//     if (currentURL != window.location.href) {
//         currentURL = window.location.href;
//         onPageUpdate();
//     }
// }, 100);

// waitForPageLoad();