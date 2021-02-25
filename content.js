// Developed by Grant @ GeekOverdriveStudio
var currentURL = "";
var scrollDist = 0
var guide = document.getElementById("guide-content")
var innerGuide = document.getElementById("guide-inner-content")
var widgetContainer = null
var pulledSub = null
var pulledMenu = null
var tabNodes = []
var subLinkDict = {}
var subTabDict = {}


function waitForPageLoad() {
    check = setInterval(function(){
        if (document.getElementsByClassName("tab").length > 0) { return; }
        if (document.getElementById("sections")) {
            clearInterval(check);
            console.log("Got Sections...");
            // Sections > Subscription Renderer > Subscription List
            // Get "Show # More" button (<a> element)
            // Click it
            subList = document.getElementById("sections").childNodes[1].childNodes[3];
            expandBtn = subList.childNodes[subList.childNodes.length-1].childNodes[1].childNodes[1];
            expandBtn.click();

            setupSubs();
        }
    }, 100);
}

function setupSubs() {
    console.log("Youtube Sub Tabs")

    // Allow overflow to make subs visible
    guide.style.overflow = "visible"
    innerGuide.style.overflow = "visible"
    innerGuide.style.transition = "all 0.05s ease-out"
    innerGuide.addEventListener("wheel", function(e) {
        if (pulledMenu) { return }
        scrollDist -= e.deltaY
        scrollDist = Math.min(Math.max(scrollDist, -innerGuide.offsetHeight + window.innerHeight), 0)
        innerGuide.style.marginTop = scrollDist + "px";
    })
    // Get the sub widget container
    widgetContainer = document.querySelectorAll('[id=items]')[1]
    widgetContainer.style.position = "relative"
    // Get the "show more" widget, reposition the subs from within it to the container, and delete the expandable widget
    expandableWidget = widgetContainer.childNodes[widgetContainer.childNodes.length-1]
    appendChildren(widgetContainer, Array.from(expandableWidget.childNodes[3].childNodes[1].childNodes))
    expandableWidget.remove()

    // Get saved data
    subLinkDict = JSON.parse(localStorage.getItem("subscription_links"));
    if (!(subLinkDict)) { subLinkDict = {}; }
    console.log(subLinkDict);

    // Get the sub widgets and add our new functionality to them
    // Add tabs to the container
    setupTabs();
    widgets = getSubs(widgetContainer);
    addSubSlides(widgets);
    addSubListeners(widgets);
}

function addSubSlides(nodes) {
    for (index in nodes) {
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
        } else {
            tabNum = parseInt(subLinkDict[sub.id]);
            // Set sub as child of corresponding tab
            if (tabNum >= 0 && tabNodes[tabNum]) {
                tabNodes[tabNum].appendChild(nodes[index]);
            } else {
                subLinkDict[sub.id] = -1;
            }
        }
    }
    saveData();
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
    setupTabMenu();

    difference = {x:40, y:-pulledMenu.offsetHeight/2 + e.currentTarget.offsetHeight/2};
    pulledMenu.style.left = difference.x + e.currentTarget.offsetWidth + "px";
    pulledMenu.style.top = difference.y + "px";

    pulledMenu.addEventListener('mouseout', closeMenu);
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
    if (pulledMenu) { return }
    if (pulledSub) {
        pulledSub.firstChild.style.left = "0px"
        pulledSub.lastChild.style.boxShadow = "3px 0 1px -3px white"
        pulledSub.lastChild.style.backgroundColor = "white"
        pulledSub.removeEventListener('click', subMenu)
    }
}

function closeMenu(e) {
    if (e.relatedTarget.parentElement == pulledMenu || e.relatedTarget == pulledMenu) { return } // JS stupidity causes 'mouseout' to call when hovering over child elements OF THE MENU!!!
    pulledMenu.remove()
    pulledMenu = null;
    pushSub(e)
}

function createTab(e) {
    e.stopPropagation();
    value = prompt("Enter tab name:");
    if (!(value)) { return; }

    tab = document.createElement("div"); tab.className = "tab"; tab.title = value;
    widgetContainer.appendChild(tab);
    if (tabNodes.length>0) {
        insertAfter(tabNodes[tabNodes.length-1], tab);
    } else {
        widgetContainer.insertBefore(tab, widgetContainer.firstChild);
    }
    tab.appendChild(pulledSub.parentElement);
    subLinkDict[pulledSub.id] = parseInt(tabNodes.length); 

    tabNodes.push(tab)
    subTabDict[tabNodes.length-1] = tab.title;
    console.log(subTabDict);
    saveData();
}

function moveSubToTab(e) {
    e.stopPropagation();
    console.log(e.target.id);
    tabNodes[e.target.id].appendChild(pulledSub.parentElement);
    subLinkDict[pulledSub.id] = parseInt(e.target.id);
    saveData();
}




function setupTabMenu() {
    for (tab in tabNodes) {
        menuItem = document.createElement("div"); menuItem.className = "menu-link"; menuItem.innerHTML = tabNodes[tab].title.toUpperCase(); menuItem.id = tab;
        menuItem.addEventListener('click', moveSubToTab);
        pulledMenu.appendChild(menuItem);
    }
    
    line = document.createElement("hr"); line.style = "border-top: 1px solid lightgray; width: 90%; margin: auto; padding-bottom: 5px; margin-top: 5px;";
    menuItem = document.createElement("div"); menuItem.className = "menu-link"; menuItem.innerHTML = "ADD A SUB";
    menuItem.addEventListener('click', createTab);
    pulledMenu.appendChild(line); pulledMenu.appendChild(menuItem);
}

function setupTabs() {
    subTabDict = JSON.parse(localStorage.getItem("subscription_tabs"));
    if (!(subTabDict)) {
        subTabDict = {};
        return;
    }
    
    console.log(subTabDict);
    for (key in subTabDict) {
        tab = document.createElement("div"); tab.className = "tab"; tab.title = subTabDict[key];
        widgetContainer.appendChild(tab);
        widgetContainer.insertBefore(tab, widgetContainer.firstChild);
        tabNodes.push(tab)
    }
}



function saveData() {
    localStorage.setItem("subscription_links", JSON.stringify(subLinkDict));
    localStorage.setItem("subscription_tabs", JSON.stringify(subTabDict));
}

function getSubs(container) {
    let newList = [];
    let nodes = Array.from(container.childNodes);
    // nodes.length = 0 if the container is empty, but not actually........... What the frick.
    if (nodes.length < 1) { return null; }
    for (index in nodes) {
        // If this child is a tab, work through its children and skip the tab itself
        if (nodes[index].className == "tab") {
            add = getSubs(nodes[index]);
            if (add) { newList.push(add); }
            continue;
        }
        newList.push(nodes[index]);
    }
    console.log(newList);
    return newList;
}

function getChannelID(node) {
    if (!(node.childNodes[1].href.includes("https://www.youtube.com/channel/"))) { return "" }
    return node.childNodes[1].href.replace("https://www.youtube.com/channel/", "")
}

function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max));
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