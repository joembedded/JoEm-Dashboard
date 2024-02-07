/** Minimalistische Internationalisierung, aehnlich i18n **/
  // Locale translations.
  export const i18_availLang = ['en', 'de']   // List of available locales
  export const i18_defaultLang = 'en'   // Fallback/Default
  export let i18_currentLang = '??'

  export const translations = {
    // EN
    en: {
      "block": {
        "title": "English title - Sprache EN",
        "subtitle": "Sub Titel",

      },
      "p-1": "English Dummy Text",
      "p-2": "this is Line 2",
    },

    // DE
    de: {
      "block": {
        "title": "Deutscher Titel  - Sprache DE",
        "subtitle": "Unter Titel",
      },
      "p-1": "Deutscher Dummy Text",
      "p-2": "mit zweiter Zeile",
    },

  }

/* Uebersetzt datierte Text ggfs. nach obiger Tabelle */
 export function i18localize(newLang) {
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

