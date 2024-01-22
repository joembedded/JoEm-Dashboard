    /* joemdash.js - Sidebar state machine 21.01.2024 (C) Joembedded */
    'use strict'
    let sidebarState = 0 /* Global, static: 0:Expanded 1:Shrinked 2:Hidden */
    function sidebar() {
        let pdst = "0px"
        const nb = document.querySelectorAll('.clnav');
        sidebarState = (sidebarState + 1) % 3
        if (sidebarState) {
            if (sidebarState == 1) pdst = getComputedStyle(document.documentElement).getPropertyValue('--lnavwidth_small')
            nb.forEach((e) => e.classList.add('collapse'))
        } else {
            pdst = getComputedStyle(document.documentElement).getPropertyValue('--lnavwidth_max')
            const ms = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--scrollms'))
            setTimeout(() => document.getElementById('main_content').style.overflow = "auto", ms)
            nb.forEach((e) => e.classList.remove('collapse'))
        }
        document.documentElement.style.setProperty('--lnavwidth_wrk', pdst)
    }

    function dashInit() {
        const scw = document.documentElement.clientWidth;
        const sbw = document.querySelector('.clnav').clientWidth;
        if (scw * 0.5 < sbw) {
            sidebar()   // initial Shrinked on small screens
            sidebarState++; // Next CLick: Open
        }
        document.getElementById("sidebar_menue").addEventListener("click", sidebar)
    }

    window.addEventListener("load",dashInit)

	/***/
	