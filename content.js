// Developed by Grant @ GeekOverdriveStudio
var currentURL = "";
var guide = document.getElementById("guide-content")
var innerGuide = document.getElementById("guide-inner-content")
var scrollDist = 0
var pulledTab = null

function waitForPageLoad() {
    check = setInterval(function(){
        if (document.getElementById("sections")) {
            clearInterval(check);
            console.log("Got Sections...")
            // Sections > Subscription Renderer > Subscription List
            // Get "Show # More" button (<a> element)
            // Click it
            subList = document.getElementById("sections").childNodes[1].childNodes[3];
            expandBtn = subList.childNodes[subList.childNodes.length-1].childNodes[1].childNodes[1];
            expandBtn.click();
            setupTabs();
        }
    }, 100);
}

function setupTabs() {
    console.log("Youtube Sub Tabs")
    // Get Second id=items div
    // Set sub widgets to childnodes of that div
    // Append the 'expandable' childnodes to widgets node list
    // Remove 'expandable' div

    // Allow overflow to make tabs visible
    guide.style.overflow = "visible"
    innerGuide.style.overflow = "visible"
    innerGuide.style.transition = "all 0.05s ease"
    innerGuide.addEventListener("wheel", function(e) {
        scrollDist -= e.deltaY
        scrollDist = Math.min(Math.max(scrollDist, -innerGuide.offsetHeight + window.innerHeight), 0)
        innerGuide.style.marginTop = scrollDist + "px";
    })

    widgetContainer = document.querySelectorAll('[id=items]')[1]
    widgets = widgetContainer.childNodes
    expandableWidget = widgets[widgets.length-1]
    appendChildren(widgetContainer, Array.from(expandableWidget.childNodes[3].childNodes[1].childNodes))

    expandableWidget.remove()
    addTabs(widgets)
    addTabListeners(widgets)
}

function appendChildren(parent, children) {
    for (index in children) {
        parent.appendChild(children[index])
    }
}

function addTabs(nodes) {
    for (index in Array.from(nodes)) {
        tab = document.createElement("span"); tab.className = "tab"
        tabSlide = document.createElement("div"); tabSlide.className = "tab-slide"
        tabIcon = document.createElement("div"); tabIcon.className = "tab-icon"
        tabCover = document.createElement("div"); tabCover.className = "tab-cover"
        tabSlide.appendChild(tabIcon);
        tab.appendChild(tabSlide);
        tab.appendChild(tabCover);
        nodes[index].style = "z-index: 1; overflow: visible;"
        nodes[index].appendChild(tab);
        nodes[index].insertBefore(tab, nodes[index].firstChild)
    }
}

function addTabListeners(nodes) {
    nodes[0].parentElement.addEventListener('mouseout', pushTab)
    for (index in Array.from(nodes)) {
        nodes[index].addEventListener('mouseover', pullTab)
        nodes[index].firstChild.addEventListener('mouseout', pushTab)
    }
}

function pullTab(e) {
    if (pulledTab) {
        pulledTab.firstChild.style.left = "0px"
        pulledTab.lastChild.style.boxShadow = "3px 0 1px -3px white"
    }
    pulledTab = e.currentTarget.firstChild
    pulledTab.firstChild.style.left = "40px"
    pulledTab.lastChild.style.boxShadow = "3px 0 1px -3px gray"
}

function pushTab(e) {
    if (pulledTab) {
        pulledTab.firstChild.style.left = "0px"
        pulledTab.lastChild.style.boxShadow = "3px 0 1px -3px white"
    }
}

// If the user browses to a different location, run it again
// I tried so many 'proper' ways to do this, including window.onlocationchange. Sometimes you have to screw the proper ways of doing things if they simply don't work or over-complicate things
setInterval(function(){
    if (currentURL != window.location.href) {
        currentURL = window.location.href;
        waitForPageLoad();
    }
}, 100);