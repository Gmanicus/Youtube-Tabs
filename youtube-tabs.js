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

            // Get the 'Show more' subscriptions button in the guide and click it, causing the subscriptions to load
            // Ignore if not found. User might not have enough subscriptions for this button to render
            let showMoreSubscriptions = guideSections[1].querySelector("#expander-item");
            if (showMoreSubscriptions) showMoreSubscriptions.click();
            clearInterval(waitForSections)

            new TabManager();
        }, 100)
    }, 100)
}

// If the page has already loaded before our extension, fire immediately
if (document.readyState === "complete") window.onload();

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
        // If there is data stored under old storage names, migrate it
        if (localStorage.getItem("subscription_links")) {
            let deprecatedBadgeData = JSON.parse(localStorage.getItem("subscription_links"));
            
            // If badge data is stored in an obsolete way, migrate it
            Object.keys(deprecatedBadgeData).forEach(badge => {
                if (typeof deprecatedBadgeData[badge] == "object") return;
                deprecatedBadgeData[badge] = { "tabID": deprecatedBadgeData[badge], "favorite": false }
            })
            localStorage.setItem("ytt-badges", JSON.stringify(deprecatedBadgeData));
            localStorage.removeItem("subscription_links");
        } if (localStorage.getItem("subscription_tabs")) {
            localStorage.setItem("ytt-tabs", localStorage.getItem("subscription_tabs"));
            localStorage.removeItem("subscription_tabs");
        }

        this.badgeData = JSON.parse(localStorage.getItem("ytt-badges")) || {};
        this.tabData = JSON.parse(localStorage.getItem("ytt-tabs")) || {};

        // Retrieve version stored in the manifest
        this.version = null;
        try { this.version = browser.runtime.getManifest().version; }
        catch (e) {
            try { this.version = chrome.runtime.getManifest().version; }
            catch (e) { this.logMessage("info", "Unable to get version from manifest") }
        }

        if (this.version) this.logMessage("info", `Running version ${this.version}`)

        // Elements
        this.sidePanel = document.getElementById("guide-content");
        this.sidePanelTrack = document.getElementById("guide-inner-content");
        this.badgeContainer = this.sidePanel.querySelectorAll("#guide-content #items")[1];
        this.badgeHeader = this.createAndConfigureElement("div", { className: "badge-header" });
        this.newTab = this.createAndConfigureElement("span", {
            className: "btn",
            title: "New Tab",
            style: { backgroundImage: "url('https://i.imgur.com/zggQshn.png')" },
            event: { name: "click", callback: this.createNewTab.bind(this, null) }
        });
        this.info = this.createAndConfigureElement("span", {
            className: "btn",
            title: "Help/Info",
            style: { backgroundImage: "url('https://i.imgur.com/J39co3K.png')" },
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
        this.addSubscribeWidget();

        if (this.isLightTheme()) {
            this.logMessage("info", "MY EYES! We're in light-theme! 😵")
            document.body.classList.add("ytt-light-theme");
        } else this.logMessage("info", "We're in dark-theme 😎")

        let previousUrl = '';
        let observer = new MutationObserver(() => {
            if (location.href !== previousUrl) {
                previousUrl = location.href;

                // Wait 0.5s for page to transition
                setTimeout(this.addSubscribeWidget.bind(this), 500);
            }
        });
        
        observer.observe(document.querySelector("body"), {
            childList: true,
            subtree: true
        });

        // Update the version stored in localStorage
        // Display the help menu if the version is new
        if (localStorage.getItem("ytt_version") != this.version) {
            localStorage.setItem("ytt_version", this.version);
            this.help();
        }

        // Listen for import/export requests
        document.addEventListener('ytt-import', this.importData.bind(this));
        document.addEventListener('ytt-export', this.exportData.bind(this));
        document.addEventListener('ytt-close-popup', () => { this.activePage?.close(); });
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
        // Will not exist if there is no 'Show more subscriptions' button
        if (this.badgeContainer.querySelector("#expandable-items")) {
            moveElementsTo(this.badgeContainer, ...this.badgeContainer.querySelector("#expandable-items").children);
            this.badgeContainer.getElementsByTagName("ytd-guide-collapsible-entry-renderer")[0].remove(); // Remove the 'expander item' element so that the badgeContainer only contains subscription badges
        }

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
        Object.nonFunctionKeys(this.tabData).sort((keyA, keyB)=>{return this.tabData[keyA].index - this.tabData[keyB].index}).forEach((id)=>{
            let tab = this.tabData[id];
            this.createTab(tab.name, id, tab.color, tab.hidden).moveToBottom();
        })

        // Insert tab at index
        // ...append tab
        this.tabData.insert = (tab, index) => {
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

            this.tabData.update(tab);

            // Update all indexes
            Object.nonFunctionKeys(this.tabData).forEach((id) => {
                this.tabData[id].index = this.tabIndex.findIndex((index_id) => index_id == id);
            })

            // Reorder tab elements
            Object.nonFunctionKeys(this.tabData).sort((keyA, keyB)=>{return this.tabData[keyA].index - this.tabData[keyB].index}).forEach((id)=>{
                this.tabs.find((tab) => tab.id == id)?.moveToBottom();
            })

            this.save();
        }

        // Update tabs in storage
        this.tabData.update = (tab) => {
            // If tab is already in the database list, update it
            if (Object.nonFunctionKeys(this.tabData).find((id) => id == tab.id)) {
                Object.assign(this.tabData[tab.id], {
                    name: tab.title,
                    color: tab.color,
                    hidden: tab.closed,
                    index: this.tabIndex.findIndex((id) => id == tab.id)
                })
            // If not, add it
            } else {
                this.tabData[tab.id] = {
                    name: tab.title,
                    color: tab.color,
                    hidden: tab.closed,
                    index: this.tabIndex.findIndex((id) => id == tab.id)
                }
            }

            this.save();
        }

        this.tabData.delete = (tab) => {
            delete this.tabData[tab.id];
            this.tabs.splice(this.tabs.findIndex((tabItem) => tabItem.id == tab.id), 1);
            this.tabIndex.splice(this.tabIndex.findIndex((idItem) => idItem == tab.id), 1);
                
            // Remove all badge tab associations to this tab
            for (const [key, value] of Object.entries(this.badgeData)) { if (value == tab.id) this.badgeData[key].tabID = -1; }
            this.save();
        }
    }

    initializeBadges() {
        this.badges = this.badgeContainer.querySelectorAll("ytd-guide-entry-renderer");
        this.badges.forEach((badge)=>{
            if (badge.classList.contains("badge")) return; // Return if we've already initialized this badge
            badge.id = this.getChannelIDFromBadge(badge);
            badge.icon = badge.querySelector("yt-img-shadow");
            badge.classList.add("badge")
            switch (badge.getAttribute("line-end-style")) {
                case "none": badge.status = 0; break;
                case "dot": badge.status = 1; break;
                case "badge": badge.status = 2; break;
            }

            // If this badge hasn't been stored yet
            // Create badge data for it
            // Else, set favorite style
            if (!this.badgeData[badge.id]) {
                this.badgeData[badge.id] = {
                    "tabID": -1,
                    "favorite": false
                }
            } else if (this.badgeData[badge.id].favorite) badge.classList.add("favorite");

            // Add badge menu button
            badge.appendChild(this.createAndConfigureElement("button", {className: "badge-retractor", event: { name: "click", callback: (e)=>{
                e.stopImmediatePropagation();
                this.badgeOptions(badge);
            }}}));

            // ◄ Add badge functions ►
            // • Favorite or unfavorite badge on click of the badge icon
            badge.toggleFavorite = (e) => {
                e.stopImmediatePropagation();
                e.preventDefault();
                this.badgeData[badge.id].favorite = badge.classList.toggle("favorite");
                this.logMessage("info", ((this.badgeData[badge.id].favorite) ? "Favorited" : "Unfavorited") + ` ${badge.id}`);
                
                this.save();
                this.sortBadges();
                this.arrangeBadges(badge);
                return this.badgeData[badge.id].favorite;
            }

            // • moveTo: move this badge to a specific tab and save it
            badge.moveTo = (tabID) => {
                let association = this.badgeData[badge.id].tabID;
                if (!tabID) { this.logMessage("error", "Badge.moveTo() tab ID doesn't exist!", badge.id, tabID); return; }
                else if (tabID != -1 && !document.getElementById(tabID)) { this.logMessage("error", "Badge.moveTo() tab not found!", tabID); return; }

                // Set badge tab association to target tab
                if (tabID == -1) this.logMessage("info", `Removing badge '${badge.id}' from tab ${association}`);
                else if (association) this.logMessage("info", `Badge '${badge.id}' moving from ${association} to ${tabID}`);
                else this.logMessage("info", `Badge '${badge.id}' moving to ${tabID}`);
                
                this.badgeData[badge.id].tabID = tabID;
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

            // ◄ Add badge events ►
            // • Add badge favorite event to icon
            badge.icon.addEventListener("click", badge.toggleFavorite);
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
                document.getElementsByClassName('ytt-subscribe-retractor')?.[0]?.remove();
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

            setTimeout(() => {
                // The subscribe button now resets on Youtube when the subscribe status is changed, so refresh our sub widget
                // Wait momentarily because refreshing immediately after sub change doesn't work
                this.addSubscribeWidget();
            }, 250)
        })
    }

    // ACTIONS

    sortBadges(badgeList) {
        let setMaster = false;
        if (badgeList == undefined || badgeList.length == 0) { badgeList = this.badges; setMaster = true; }
        badgeList = Array.from(badgeList).sort((badge1, badge2)=>{
            let badgeComparisonData = [
                {
                    "tabIndex": this.tabData[this.badgeData[badge1.id].tabID]?.index + 1 || Infinity,
                    "favorite": (this.badgeData[badge1.id].favorite) ? -1 : 0
                }, {
                    "tabIndex": this.tabData[this.badgeData[badge2.id].tabID]?.index + 1 || Infinity,
                    "favorite": (this.badgeData[badge2.id].favorite) ? -1 : 0
                }
            ]
            
            // Sort the widgets by
            // >>>> Favorited
            // >>>  Tab Index
            // >>   Status
            // >    Name
            if (badgeComparisonData[0].tabIndex != badgeComparisonData[1].tabIndex) return badgeComparisonData[0].tabIndex - badgeComparisonData[1].tabIndex;
            else if (badgeComparisonData[0].favorite != badgeComparisonData[1].favorite) return badgeComparisonData[0].favorite - badgeComparisonData[1].favorite;
            else if (badge1.status != badge2.status) return badge2.status - badge1.status;
            else return badge1.id.localeCompare(badge2.id);
        })
        
        if (setMaster) this.badges = badgeList;
        else return badgeList;
    }

    // In the currently sorted order, add badges to their respective tabs
    arrangeBadges(specificBadge) {
        if (specificBadge) {
            let tab = this.tabs.find((tab)=>{ return tab.id == this.badgeData[specificBadge.id].tabID })
            let specificBadgeIndex = this.badges.findIndex(badge => badge.id == specificBadge.id);
            let precedingBadge = (specificBadgeIndex > 0) ? this.badges[specificBadgeIndex - 1] : null;
            if (precedingBadge && this.badgeData[precedingBadge.id].tabID != this.badgeData[specificBadge.id].tabID) precedingBadge = null;

            // insert specific badge into sorted position
            if (tab) {
                if (precedingBadge) insertAfter(precedingBadge, specificBadge);
                else insertAfter(tab.children[0], specificBadge);
            } else {
                if (precedingBadge) insertAfter(precedingBadge, specificBadge);
                else insertAfter(this.tabs[this.tabs.length - 1], specificBadge);
            }
        } else {
            this.badges.forEach((badge)=>{
                let tab = this.tabs.find((tab)=>{ return tab.id == this.badgeData[badge.id].tabID }) // Get the tab element that this badge belongs in
                if (tab) tab.appendChild(badge); // If that tab exists, append the badge to the tab
                else this.badgeContainer.appendChild(badge); // If not, append the badge to the container
            })
        }
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
                this.tabData.delete(newTab);
                newTab.remove();
                this.sortBadges();
                this.arrangeBadges();
            }
        }

        newTab.toggle = () => {
            newTab.classList.toggle("closed");
            newTab.closed = newTab.classList.contains("closed")
            this.tabData.update(newTab);
        }

        // When user click & holds on the header of the tab to reorder
        newTab.grab = (event) => {
            if (!event.button == 0) return; // If the left-mouse button was not pressed
            this.grabbing = true;
            newTab.classList.add("grabbed");
            
            let oldPosition = newTab.getBoundingClientRect().top;
            let oldTrackPosition = parseInt(this.sidePanelTrack.style.marginTop); if (!oldTrackPosition) oldTrackPosition = 0;
            let oldTransition = this.sidePanelTrack.style.transition;

            // Stop grabbing on mouse up
            document.addEventListener("mouseup", () => { newTab.drop(oldTrackPosition); }, { once: true });
            
            // Set every tab to closed
            this.tabs.forEach((tab) => {
                tab.classList.add("closed");
                // Create grab & drop callback pointer (bind creates separate function references, so instead we can reference this one bind via a variable)
                tab.grabDropCallback = tab.swap.bind(null, newTab, this.badgeContainer);
                tab.addEventListener("mouseenter", tab.grabDropCallback);
            })

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
            newTab.classList.remove("grabbed");
            
            // Remove animation class once ended
            newTab.addEventListener("animationend", () => {
                newTab.classList.remove("movedup", "moveddown");
            }, {once: true})

            let oldTransition = this.sidePanelTrack.style.transition;
            // Make sidepanel scroll instantaneous
            this.sidePanelTrack.style.transition = "none";

            // Reset sidepanel position
            this.sidePanelTrack.style.marginTop = oldPosition + "px";
            this.sidePanelTrack.getBoundingClientRect(); // Trigger reflow
            this.sidePanelTrack.style.transition = oldTransition;

            this.tabs.forEach((tab) => {
                let closed = this.tabData[tab.id]?.hidden;
                if (!closed) tab.classList.remove("closed");
                tab.removeEventListener("mouseenter", tab.grabDropCallback);
                
                // Store new tab index
                if (this.tabData[tab.id]) {
                    this.tabData[tab.id].index = getChildIndex(tab);
                    this.save();
                }
            })
        }

        newTab.swap = function(targetTab, badgeContainer) {
            if (newTab == targetTab) return;
            targetTab.classList.remove("movedup", "moveddown");
            targetTab.getBoundingClientRect(); // Trigger reflow
            
            if (getChildIndex(newTab) > getChildIndex(targetTab)) {
                insertAfter(newTab, targetTab);
                targetTab.classList.add("moveddown");
            } else {
                badgeContainer.insertBefore(targetTab, newTab);
                targetTab.classList.add("movedup");
            }
        }

        // Configure tab elements
        newTab.header = this.createAndConfigureElement("div", {className: "tab-menu"});
        newTab.expand = this.createAndConfigureElement("button", {className: "tab-menu-btn expand-arrow", event: { name: "click", callback: newTab.toggle }});
        newTab.edit = this.createAndConfigureElement("button", {className: "tab-menu-btn edit-back", event: { name: "click", callback: this.tabOptions.bind(this, newTab) }});
        newTab.delete = this.createAndConfigureElement("button", {className: "tab-menu-btn delete-back", event: { name: "click", callback: newTab.delete }});
        newTab.grab = this.createAndConfigureElement("span", {className: "hover-zone", event: { name: "mousedown", callback: newTab.grab }});
        
        moveElementsTo(newTab.header, ...[newTab.expand, newTab.edit, newTab.delete, newTab.grab]);
        newTab.header.appendChild(this.createAndConfigureElement("h3", {innerHTML: title?.toUpperCase() || "", className: "tab-menu-name"}));
        newTab.appendChild(newTab.header);

        this.tabs.push(newTab);
        this.tabIndex.push(newTab.id);
        return newTab;
    }

    // ◙ ACTIONS ◙

    help() {
        if (this.modal) this.activeMenu.close();
        this.modal = true;

        let popUp = this.createAndConfigureElement("div", { className: "ytt-popup" });
        popUp.exit = this.createAndConfigureElement("btn", { className: "exit" });
        popUp.body = this.createAndConfigureElement("div", { className: "popup-body" });
        this.activePage = popUp;
        
        popUp.close = () => {
            popUp.remove();
            this.activeMenu?.close();
            this.modal = false;
        }

        // Get included help menu HTML
        let url = chrome.runtime.getURL("help.html");
        let xhr = new XMLHttpRequest();
        xhr.open("GET", url);
        xhr.onreadystatechange = function() {
            if (this.readyState!==4) return;
            popUp.body.innerHTML = this.responseText;
        };
        xhr.send();

        moveElementsTo(popUp, ...[popUp.exit, popUp.body]);
        document.body.appendChild(popUp);
    }

    createNewTab(badge) {
        let newTab = this.createTab("", new Date().getTime(), getRandomColor());
        this.tabData.insert(newTab, 0);
        if (badge) badge.moveTo(newTab.id);
        this.tabOptions(newTab);
    }

    /** Opens the subscription badge options menu
     * 
     * @param {*} badge - The target subscriber badge
     * @param {*} popupHost - The element to append this menu to. Defaults to the badge
     */
    badgeOptions(badge, popupHost) {
        if (!badge) return;
        if (this.modal) this.activeMenu?.close();
        this.modal = true;
        
        // Create and configure menu elements
        let menu = this.createAndConfigureElement("div", { className: "badge-menu", event: { name: "click", callback: (e)=>{e.stopPropagation()} } });
        menu.head = this.createAndConfigureElement("div", { className: "menu-head" });
        menu.body = this.createAndConfigureElement("div", { className: "menu-body" });
        menu.favorite = this.createAndConfigureElement("button", {className: "badge-menu-btn favorite" + " " + ((this.badgeData[badge.id].favorite) ? "filled" : ""), event: { name: "click", callback: (e)=>{
            let isFavorite = badge.toggleFavorite(e);
            if (isFavorite) menu.favorite.classList.add("filled");
            else menu.favorite.classList.remove("filled");
        }}});

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
        if (popupHost) {
            // append menu to the page so that it can be interactable above the modal overlay
            let page = document.getElementById("page-manager");
            page.appendChild(menu);
        }
        else badge.appendChild(menu);

        // Generate tab selection list and append to menu in the order that they appear in the side-panel
        Object.nonFunctionKeys(this.tabData).sort((tabA, tabB) => this.tabData[tabA].index - this.tabData[tabB].index).forEach(tabKey => {
            let tab = this.tabData[tabKey];
            let item = this.createAndConfigureElement("span", {
                className: "tab-selector",
                innerHTML: tab.name,
                event: { name: "click", callback: badge.moveTo.bind(this, tabKey) }
            });
            item.style.setProperty("--color", tab.color);
            menu.body.appendChild(item);
        })
        
        if (!popupHost) {
            // Set menu position to be right of the badge and centered vertically
            let viewportPosition = menu.getBoundingClientRect();
            let difference = {x:0, y:-menu.offsetHeight/2 + badge.offsetHeight/2};
            
            if (viewportPosition.top + difference.y < 60) difference.y = 60 - viewportPosition.top;
            if (viewportPosition.bottom + difference.y > window.innerHeight) difference.y = window.innerHeight - viewportPosition.bottom;

            menu.style.left = `${difference.x + badge.offsetWidth}px`;
            menu.style.top = `${difference.y}px`;
        } else {
            // Set menu position to be right of the host and centered vertically
            menu.style.position = "fixed";
            let viewportPosition = popupHost.getBoundingClientRect();
            menu.style.left = `${viewportPosition.x}px`;
            menu.style.top = `${viewportPosition.y}px`;
        }
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
            this.tabData.update(tab);
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
        menu.addEventListener('keypress', (e) => { if (e.key === 'Enter') menu.close() } )
        
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
        popUp.text = this.createAndConfigureElement("p", { className: "ytt-header", innerHTML: "Where would you like to put this subscription?" });
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

    // finds the '(un)subscribe' button on the page and adds the hover widget
    addSubscribeWidget(retry) {
        let subscribeBtn;

        if (window.location.href.includes("watch?")) { // If we are on a video page
            subscribeBtn = document.querySelector("#subscribe-button");
        } else if (
            window.location.href.includes("/channel/")
            || window.location.href.includes("/c/")
            || window.location.href.includes("/user/")
            || window.location.href.includes("/@")
        ) { // If we are on a channel page
            subscribeBtn = document.querySelector("#subscribe-button");
        }

        if (!retry && !subscribeBtn) { setTimeout(this.addSubscribeWidget.bind(this, true), 500); return; }
        else if (retry && !subscribeBtn) return;

        let targetChannel = this.getChannelIDFromPage();
        let tab = this.tabData[this.badgeData[targetChannel]?.tabID]
        let subscribed = subscribeBtn.querySelector(".yt-core-attributed-string")?.innerHTML.includes('Subscribed')

        if (!subscribed) return;

        // subscribeBtn.style.backgroundColor = `rgb(${Math.random()*255}, ${Math.random()*255}, ${Math.random()*255})`;
        if (subscribeBtn.retractor) subscribeBtn.retractor.remove();
        subscribeBtn.retractor = this.createAndConfigureElement("span", { className: "ytt-subscribe-retractor" });
        subscribeBtn.getBoundingClientRect(); // Trigger reflow
        if (tab) {
            subscribeBtn.style.setProperty("--tabName", `"${tab.name}"`);
            subscribeBtn.style.setProperty("--tabColor", tab.color);
        } else {
            subscribeBtn.style.setProperty("--tabName", `"No Tab"`);
            subscribeBtn.style.setProperty("--tabColor", "black");
        }

        if (subscribed) { subscribeBtn.classList.add("subscribed"); subscribeBtn.classList.remove("unsubscribed"); }
        else            { subscribeBtn.classList.remove("subscribed"); subscribeBtn.classList.add("unsubscribed"); }

        subscribeBtn.style.setProperty('position', 'relative');
        subscribeBtn.appendChild(subscribeBtn.retractor);
        subscribeBtn.retractor.addEventListener("click", (e) => {
            e.stopPropagation();
            this.badgeOptions(this.badges.find((b) => b.id == targetChannel), subscribeBtn);
        })

        // Color text to white or black depending on background color brightness
        if (lightOrDark(tab?.color || "black") == "light") subscribeBtn.style.setProperty("--textColor", "black");
        else subscribeBtn.style.setProperty("--textColor", "white");
    }

    // ▲ HELPER FUNCTIONS ▲

    getChannelIDFromPage() {
        // Some creators can have their id directly after Youtube.com. Detect that
        let alternative = window.location.href.match(/\.com(.*)/gm)[0]; alternative = alternative.substring(5);
        if (alternative.includes("/")) alternative = null;

        if (window.location.href.includes("watch?")) { // If we are on a video page
            let id = document.querySelector("#upload-info[class*='style-scope']").querySelector("a").innerHTML;
            return id;
        } else if (window.location.href.includes("https://www.youtube.com/channel/") || window.location.href.includes("https://www.youtube.com/c/") || alternative) { // If we are on a channel page
            let id = document.getElementById("inner-header-container").querySelector("#text").innerHTML;
            return id;
        }
    }

    getChannelIDFromBadge(badge) {
        let channel = badge.querySelector('#endpoint').title;
        return channel; // channel IDs are either custom channel names or auto-generated IDs. I.e, they are inconsistent and can no longer be used
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

    isLightTheme() {
        let style = window.getComputedStyle(document.querySelector("ytd-app"));
        let color = style.getPropertyValue("--yt-spec-base-background").replace(" ", "");

        return lightOrDark(color) == "light";
    }

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

    save() {
        localStorage.setItem("ytt-badges", JSON.stringify(this.badgeData));
        localStorage.setItem("ytt-tabs", JSON.stringify(this.tabData));
    }

    async exportData() {
        let exportContent = {
            version: this.version,
            badges: this.badgeData,
            tabs: this.tabData
        }

        let file = new Blob([JSON.stringify(exportContent)], {type: 'application/json'});
        let a = document.createElement("a");
        a.href = URL.createObjectURL(file);
        a.download = `ytt-backup ${new Date().toDateString()}`;
        a.click(); URL.revokeObjectURL(a.href);
    }

    async importData() {
        if (!document.getElementById('upload-file-picker').files[0]) return; // User hit cancel on select file prompt. End early
        let confirmation = confirm("Importing backup\n\nAre you sure you want to do this?\n\nTHIS WILL OVERWRITE ALL OF YOUR EXISTING TAB DATA.\nThis will also refresh the current page.")
        if (confirmation) {
            this.parseJsonFile(document.getElementById('upload-file-picker').files[0])
                .then((data) => {
                    if (!data.version || !data.badges || !data.tabs) {
                        alert("Unable to find all expected data within the data backup.\n\nThis may be the wrong file, or the data didn't save properly, or the file was corrupted/improperly modifed.\n\nImporting process has been aborted. Your data has not changed.")
                    } else {
                        this.badgeData = data.badges;
                        this.tabData = data.tabs;
                        this.save();
                        window.location.reload();
                    }
                })
                .catch((e) => alert("Could not import file. Error while parsing data. Maybe that was the wrong file?\n\nImporting process has been aborted. Your data has not changed."));
        }
    }

    // https://stackoverflow.com/a/66387148/10949443
    async parseJsonFile(file) {
        return new Promise((resolve, reject) => {
            const fileReader = new FileReader()
            fileReader.onload = event => {
                try {
                    resolve(JSON.parse(event.target.result));
                } catch {
                    reject(new Error('Unable to read file'));
                }
            }
            fileReader.onerror = error => reject(error);
            fileReader.readAsText(file);
        })
    }
}

// Get the index of this element relative to its parent
function getChildIndex(child) {
    return Array.from(child.parentNode.children).indexOf(child);
}

// Raw JS InsertAfter code from StackOverflow. StackOverflow FTW!
function insertAfter(referenceNode, newNode) {
    referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}

function moveElementsTo(newParent, ...children) { children.forEach((child)=>newParent.appendChild(child)); }

// https://awik.io/determine-color-bright-dark-using-javascript/
function lightOrDark(color) {

    // Variables for red, green, blue values
    var r, g, b, hsp;
    
    // Check the format of the color, HEX or RGB?
    if (color.match(/^rgb/)) {

        // If RGB --> store the red, green, blue values in separate variables
        color = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)$/);
        
        r = color[1];
        g = color[2];
        b = color[3];
    } 
    else {
        
        // If hex --> Convert it to RGB: http://gist.github.com/983661
        color = +("0x" + color.slice(1).replace( 
        color.length < 5 && /./g, '$&$&'));

        r = color >> 16;
        g = color >> 8 & 255;
        b = color & 255;
    }
    
    // HSP (Highly Sensitive Poo) equation from http://alienryderflex.com/hsp.html
    hsp = Math.sqrt(
        0.299 * (r * r) +
        0.587 * (g * g) +
        0.114 * (b * b)
    );

    // Using the HSP value, determine whether the color is light or dark
    if (hsp>127.5) return 'light';
    else return 'dark';
}

// https://stackoverflow.com/a/1484514/10949443
function getRandomColor() {
    var letters = '0123456789ABCDEF';
    var color = '#';
    for (var i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

function getRandomInt(max){
    let rand = Math.random() * max;
    rand = Math.floor(rand);
    return rand;
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