// Developed by Grant @ GeekOverdriveStudio
var hexDigits = new Array("0","1","2","3","4","5","6","7","8","9","a","b","c","d","e","f"); 
var currentURL = "";
var scrollDist = 0;
var darkModeEnabled = false;

var guide = document.getElementById("guide-content");
var innerGuide = document.getElementById("guide-inner-content");
var widgetContainer = null;
var pulledSub = null;
var pulledMenu = null;
var colorPicker = null;
var helpMenu = null;

var tabNodes = [];
var subLinkDict = {};
var subTabDict = {};

// Grab tab shared variables
var subProps = {};
var grabbedTab = null;


function waitForPageLoad() {
    check = setInterval(function(){
        if (document.getElementsByClassName("tab").length > 0) { return; }
        if (document.getElementById("sections")) {
            console.log("[Youtube Tabs] Got Sections...");
            
            // Sections > Subscription Renderer > Subscription List
            // Get "Show # More" button (<a> element)
            // Click it

            // 'sections' sometimes errors out here, saying it can't get childnodes of undefined.
            // Considering that this is inside an if block checking that that is NOT the case, I am not even going to try to fix this
            subList = document.getElementById("sections").childNodes[1].childNodes[3];
            expandBtn = subList.childNodes[subList.childNodes.length-1].childNodes[1].childNodes[1];
            expandBtn.click();
            
            clearInterval(check);
            setupSubs();
            
            let ver = chrome.runtime.getManifest().version;
            let storedVer = localStorage.getItem("youtube_tabs_version");
            if (storedVer != ver) {
                localStorage.setItem("youtube_tabs_version", ver);
                help();
            }
        }
    }, 100);
}

function setupSubs() {
    console.log("[Youtube Tabs] LOADED")

    // Allow overflow to make subs visible
    guide.style.overflow = "visible";
    innerGuide.style.overflow = "visible";
    innerGuide.style.transition = "all 0.05s ease-out";
    innerGuide.addEventListener("wheel", function(e) {
        if (pulledMenu) { return }
        scrollDist -= e.deltaY;
        scrollDist = Math.min(Math.max(scrollDist, -innerGuide.offsetHeight + window.innerHeight), 0);
        innerGuide.style.marginTop = scrollDist + "px";
    })
    // Get the sub widget container
    widgetContainer = document.querySelectorAll('[id=items]')[1];
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
    addSubSlides(widgets);
    addSubListeners(widgets);
    checkDarkMode();
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
        sub.id = getChannelID(nodes[index]);

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
        nodes[index].addEventListener('mouseover', pullSub)
        nodes[index].firstChild.addEventListener('mouseout', pushSub)
    }
}



function subMenu(e) {
    // Click +
    // List of subs & "Add a sub"
    if (pulledMenu) { return; }
    e.stopPropagation();
    pulledMenu = document.createElement("div"); pulledMenu.className = "sub-menu";
    e.currentTarget.appendChild(pulledMenu);
    setupSubMenu();

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
    colorPicker = new window.iro.ColorPicker("#color-picker", {
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
    if (pulledMenu) { return }
    if (pulledSub) {
        pulledSub.firstChild.style.left = "0px"
        pulledSub.lastChild.style.boxShadow = "3px 0 1px -3px white"
    }
    pulledSub = e.currentTarget.firstChild
    pulledSub.firstChild.style.left = "40px"
    pulledSub.lastChild.style.boxShadow = "3px 0 1px -3px gray"
    pulledSub.lastChild.style.backgroundColor = "#ededed"
    pulledSub.addEventListener('click', subMenu)
}

function pushSub(e) {
    e.stopPropagation()
    if (pulledSub) {
        pulledSub.firstChild.style.left = "0px"
        pulledSub.lastChild.style.boxShadow = "3px 0 1px -3px white"
        pulledSub.lastChild.style.backgroundColor = "white"
        pulledSub.removeEventListener('click', subMenu)
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

    if (tabId != -1) {
        tabNodes[ subTabDict[tabId].index ].appendChild(pulledSub.parentElement);
    } else {
        widgetContainer.appendChild(pulledSub.parentElement);
    }

    subLinkDict[pulledSub.id] = tabId;
    saveData();
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
        tab.style.maxHeight = "fit-content";
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
    tab.style.maxHeight = "fit-content";
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
    try { ver = chrome.runtime.getManifest().version; }
    catch (e) { console.log("[Youtube Tabs] Unable to get version from manifest"); }

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
        <h5>Created by Grant @ Geek Overdrive Studio</h5>
        <br>
        <h3>${ver} Update</h3>

        <br>
        <br>
        <p>- Added help menu</p>
        <p>- Added grab & move fuctionality</p>
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
            please give it a <a href="https://chrome.google.com/webstore/detail/youtube-tabs/jfdifkfmidcljpedkckpampdeffhlfhn" target="_blank">rating</a>
            or <a href="https://ko-fi.com/geek" target="_blank">support me</a> for the work that I put into this.</p>
        <br>
        <br>
        <br>
    </div>
    `

    darkContainer = document.createElement("div"); darkContainer.className = "darken"; darkContainer.innerHTML = poster;
    if (darkModeEnabled) { darkContainer.childNodes[1].classList.add("dark"); darkContainer.childNodes[1].classList.add("dark-menu-item"); }
    document.body.appendChild(darkContainer);
    
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
        tab.style.overflow = "hidden";
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
    console.log(tabs);
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
    guideOnDarkMode = rgb2hex( window.getComputedStyle(guide).getPropertyValue("background") ).includes("212121");
    if (darkModeEnabled != guideOnDarkMode) {
        darkModeEnabled = guideOnDarkMode;
        updateLightMode(getSubs(widgetContainer));
    }
}



function saveData() {
    localStorage.setItem("subscription_links", JSON.stringify(subLinkDict));
    localStorage.setItem("subscription_tabs", JSON.stringify(subTabDict));
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
            if (nodes[index].firstChild.className.includes("sub")) {
                continue
            }
        }
        newList.push(nodes[index]);
    }
    if (newList.length < 1) { return null; }
    return newList;
}

function getChannelID(node) {
    if (!(node.childNodes[1].href.includes("https://www.youtube.com/channel/"))) { return "" }
    return node.childNodes[1].href.replace("https://www.youtube.com/channel/", "")
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

    if (color == "") {
        return colors["firebrick"];
    }
          
    if (typeof colors[color.toLowerCase()] != 'undefined') 
        return colors[color.toLowerCase()];
    else {
        return rgb2hex(color);
    }
    return false; 
}

//Function to convert rgb color to hex format
function rgb2hex(rgb) {
    rgb = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
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

// Raw JS InsertAfter code from StackOverflow. StackOverflow FTW!
function insertAfter(referenceNode, newNode) {
    referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}


// If the user browses to a different location, run it again
// I tried so many 'proper' ways to do this, including window.onlocationchange. Sometimes you have to screw the proper ways of doing things if they simply don't work or over-complicate things
setInterval(function(){
    if (currentURL != window.location.href) {
        currentURL = window.location.href;
        waitForPageLoad();
    }
}, 100);