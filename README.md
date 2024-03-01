# Dashboard-Fragment #
**Fragment**

Fragment for a Desktop/Mobile Dashboard (as PWA)

Features:
- Responsive
- Skalierbare Fonts
- Internationalisierung
- Interner QR-Code-Scanner
- ...

Live-Demo: https://joembedded.github.io/JoEm-Dashboard/

Note: Chrome-Entwickleroption: 
- Aktiviere Entwicklermodus, indem Einstellungen > Über das Telefon und dann 7 Mal auf die Build-Nummer tippen.
- Aktivieren USB-Debugging in den Entwickleroptionen.
- chrome://inspect/#devices
---

## Service Worker (PWA)
Service Worker besteht aus 4 Dateien: sw.js / workbox_xx.jsm beide mit .map
Der Service Worker caached die APP-Daten, so dass sie Offline verfügbar ist.
Fuer die Entwicklung allerdings eher hinderlich... Daher deinstallierbar.
- Entwicklung: ServiceWorker-Dateien evtl. loeschen. <br>
    Gegebenenfalls laufenden Servicewerker manuell per Konsole löschen: removeServiceWorker() (global in 'index.html')<br>
    und 'window.jdDebug' auf > 0 setzen

- Deploy: ServiceWorker-Dateien erzeugen 'workbox generateSW workbox-config.js' im Root des Projekts<br>
    SW-Registrierung automatisch wenn 'window.jdDebug = 0' setzen


## 3.rd Party Software ##
- FontAwesome https://fontawesome.com/license/free License: MIT, SIL-OFL, CC-BY-4.0
- FileSaver https://github.com/eligrey/FileSaver.js/blob/master/LICENSE.md License: MIT
- QR-Code Scanner Polyfill: https://github.com/cozmo/jsQR License: Apache 2.0

---

## Changelog ##
- V0.11 05.02.2024 First Fragment
