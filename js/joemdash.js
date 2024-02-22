/* joemdash.js - Sidebar state machine 21.01.2024 (C) Joembedded */

let sidebarState = 0 /* Global, static: 0:Expanded 1:Shrinked 2:Hidden  (3:Exp, 4:Shrinked, 5:Hidden*)*/
function sidebar_hint() {
    // BLACK LEFT-/RIGHT POINTING POINTER
    //console.log("sidebar_hint" , sidebarState)
    const sbh = ['&ltrif;', '&ltrif;', '&rtrif;', '', '', '&rtrif;']
    document.getElementById('cheader-hint').innerHTML = sbh[sidebarState]
}
function sidebar() {
    let pdst = "0px"
    const nb = document.querySelectorAll('.clnav')
    sidebarState = (sidebarState + 1) % 3
    if (sidebarState) {
        if (sidebarState == 1) pdst = getComputedStyle(document.documentElement).getPropertyValue('--lnavwidth_small')
        nb.forEach((e) => e.classList.add('collapse'))
    } else {
        document.getElementById('main_content').style.overflow = "hidden"
        pdst = getComputedStyle(document.documentElement).getPropertyValue('--lnavwidth_max')
        const ms = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--scrollms'))
        setTimeout(() => document.getElementById('main_content').style.overflow = "auto", ms)
        nb.forEach((e) => e.classList.remove('collapse'))
    }
    document.documentElement.style.setProperty('--lnavwidth_wrk', pdst)
    sidebar_hint()
}

// Limit to x of viewport if expanded
export function sidebarMax(factor) {
    if (sidebarState) return
    const scw = document.documentElement.clientWidth;
    const sbw = document.querySelector('.clnav').clientWidth;

    if (sbw > scw * factor) {
        document.documentElement.style.setProperty('--lnavwidth_wrk', (scw * factor) + "px")
        sidebarState = 5
    }
    sidebar_hint()
}

// Font setzen - Wichtig dabei nochmal Grenzen checken
export function dashSetFont(nrel) {
    if (nrel < 0.5) nrel = 0.5
    else if (nrel > 2) nrel = 2
    document.documentElement.style.setProperty('--fontrel', nrel)
    const os = sidebarState
    if (os == 5) sidebarState = 0
    else sidebarState = (os + 2) % 3
    sidebar()
    if (os == 5) sidebarState = 5
    sidebar_hint()
}


// Themen invertieren hell-dunkel
export function dashToggleTheme() {
    const cvar = ['--white', '--black', '--whitegray', '--lightgray', '--infogray', '--hovergray', '--midgray', '--darkgray', '--txtwhite', '--txtblack']
    // const ignored = ['--dodgerblue'] // List for invarable colors
    cvar.forEach((e) => {
        const oval = parseInt(getComputedStyle(document.documentElement).getPropertyValue(e).substring(1), 16);
        const nval = '#' + (oval ^ 0xFFFFFF).toString(16).padStart(6, '0') // Invert
        document.documentElement.style.setProperty(e, nval)
    })
}

function dashInit() {
    const scw = document.documentElement.clientWidth;
    const sbw = document.querySelector('.clnav').clientWidth;
    //console.log("Viewpowrt-Width:",scw, " Max Nav-Width:",sbw)
    if (scw * 0.5 < sbw) {
        sidebar()   // initial Shrinked on small screens
        sidebarState = 5; // Next CLick: Shrink 
    }
    document.getElementById("sidebar_menue").addEventListener("click", sidebar)
}

console.log("JoEmDash")
window.addEventListener("load", dashInit)

/***/
