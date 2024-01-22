/** Minimalistische Internationalisierung, aehnlich i18n **/
  // Locale translations.
  const i18_availLang = ['en', 'de']   // List of available locales
  const i18_defaultLang = 'en'   // Fallback/Default
  let i18_currentLang = '??'

  const translations = {
    // EN
    en: {
      "header": {
        "title": "English title",
        "stitle": "Sub Titel",

      },
      "p-1": "This is some dummy text in order to test the translation files. You can mostly ignore what this says, especially anything from this point forward. Ok thanks, bye",
      "p-2": "It also supports custom variable replacements. Examples;",
      "variables": "Current date: {date}<br>Unix timestamp: {time}<br>Or static text: {static}",
    },

    // DE
    de: {
      "header": {
        "title": "Deutscher Titel",
        "stitle": "Unter Titel",
      },
      "p-1": "Dies ist ein Dummy-Text, um die Übersetzungsdateien zu testen. Sie können größtenteils ignorieren, was dies sagt, insbesondere alles von diesem Punkt an. Ok danke, tschüss",
      "p-2": "Es unterstützt auch benutzerdefinierte Variablenersetzungen. Beispiele;",
      "variables": "Aktuelles Datum: {date}<br>Unix-Zeitstempel: {time}<br>Oder statischer Text: {static}",
    },

  }

/* Uebersetzt datierte Text ggfs. nach obiger Tabelle */
 function i18localize(newLang) {
  let pageLang = i18_defaultLang
  if (i18_availLang.includes(newLang))  pageLang = newLang
  else console.warn(`i18n.js: New Language:'${newLang}' not found, Fallback:'${pageLang}'`)

  const elements = document.querySelectorAll('[ll]')
  const json = translations[pageLang] // Preset Texts

  elements.forEach((element) => {
    const key = element.getAttribute('ll')
    const nc = key.split('.').reduce((obj, i) => (obj ? obj[i] : null), json)
    if(nc !== undefined) element.innerHTML = nc
    else console.warn(`i18n.js: Key:'${key}', Language:'${pageLang}' not found!`)
  })
  const htmlElement = document.querySelector('html').setAttribute('lang', pageLang)
  i18_currentLang = pageLang
}

function inilocalize(){
  i18localize(document.querySelector('html').getAttribute('lang'))
}

window.addEventListener("load", inilocalize)

/***/

