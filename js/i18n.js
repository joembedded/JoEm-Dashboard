/** Minimalistische Internationalisierung, aehnlich i18n **/
  // Locale translations. Sucht alle Elemente mit Attribut ll='ident' mit "ident":"Inhalt" , auch in Bloecken
  export const i18_availLang = ['en', 'de']   // List of available locales
  export const i18_defaultLang = 'en'   // Fallback/Default
  export let i18_currentLang = 'en'

  export const translations = {
    // EN
    en: {
      "lang": "Language:English",
      "set": {
        "theme": "Theme Dark/White",
        "fontsize": "Fontsize",
        "lang": "Language",
        "server": "Remote Server",
        "accesstoken": "Access Token",
      },
    },

    // DE
    de: {
      "lang": "Sprache:Deutsch",
      "set": {
        "theme": "Thema Dunkel/Hell",
        "fontsize": "Schriftgröße",
        "lang": "Sprache",
        "server": "Server-Addresse",
        "accesstoken": "Zugriffs-Token",
      },
    },

  }

/* Uebersetzt datierte Text ggfs. nach obiger Tabelle, relevant nur erste 2 Buchstaben */
 export function i18localize(newLang) {
  let pageLang = i18_defaultLang
  const sul = newLang.substr(0,2).toLowerCase()
  if (i18_availLang.includes(sul))  pageLang = sul
  else console.warn(`i18n.js: New Language:'${newLang}' not found, Fallback:'${pageLang}'`)

  const elements = document.querySelectorAll('[ll]')
  const json = translations[pageLang] // Preset Texts

  elements.forEach((element) => {
    const key = element.getAttribute('ll')
    const nc = key.split('.').reduce((obj, i) => (obj ? obj[i] : null), json)
    // console.log(key,nc) // Dbg
    if(nc !== undefined) element.innerHTML = nc
    else console.warn(`i18n.js: Key:'${key}', Language:'${pageLang}' not found!`)
  })
  const htmlElement = document.querySelector('html')
  htmlElement.setAttribute('lang', pageLang)
  i18_currentLang = pageLang
}

/* Optional Default Localizer
function inilocalize(){
  i18localize(document.querySelector('html').getAttribute('lang'))
}
window.addEventListener("load", inilocalize)
*/

/***/

