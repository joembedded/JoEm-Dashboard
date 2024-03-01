/* Minimalistische Internationalisierung, aehnlich i18n - (C) JoEmbedded.de

Es gibt 2 Moeglichkeiten Texte zu uebersetzen:
1.) Eintrag 'll' in div setzen, z.Bsp (XX = 'en' => "Language: English"):
  <span ll="lang">HierSprache</span>  => durch  translations.XX.lang ersetzt  ersetzt
  <label ll="set.fontsize" for="jd-fontsize">Fontsize</label> => durch translations.XX.set.fontsize 

2.) Per Funktion I18.ll(), z.B.  I18.ll('set.driverversions') 

Die Anzahl der extern verfuegbaren Sprachen in i18_availLang = [] eintraen
*/

  // Locale translations. Sucht alle Elemente mit Attribut ll='ident' mit "ident":"Inhalt" , auch in Bloecken
  export const version = 'V0.15 / 01.03.2024'
  // List of available Languages (CaseIndependent):
  export const i18_availLang = ['EN - English', 'DE - Deutsch', 'CN - Chinese/中文']   
  export const i18_defaultLang = 'en'   // Fallback/Default (Lowercase)
  export let i18_currentLang = 'en' // (Lowercase)

  export const translations = {
    // EN
    en: {
      "lang": "Language: English",
      "set": {
        "theme": "Theme Dark/White",
        "fontsize": "Fontsize",
        "lang": "Language",
        "server": "Remote Server",
        "accesstoken": "Access Token",
        "driverversions": "Driver Versions"
      },
    },

    // DE
    de: {
      "lang": "Sprache: Deutsch",
      "set": {
        "theme": "Thema Dunkel/Hell",
        "fontsize": "Schriftgröße",
        "lang": "Sprache",
        "server": "Server-Addresse",
        "accesstoken": "Zugriffs-Token",
        "driverversions":  "Treiber Versionen"
      },
    },

    // CN
    cn: {
      "lang": "语言：中文",
      "set": {
        "theme": "主题 深色/白色",
        "fontsize": "字体大小",
        "lang": "语言",
        "server": "远程服务器",
        "accesstoken": "访问令牌",
        "driverversions":  "驱动程序版本"
      },
    },

  }

/* Einzelnen String uebersetzen */
export function ll(txt){
  const json = translations[i18_currentLang] // Preset Texts
  const nc = txt.split('.').reduce((obj, i) => (obj ? obj[i] : null), json)
  if(nc !== undefined) return nc
  return `(??? ${i18_currentLang}:'${txt}')`
}

/* Uebersetzt datierte Text ggfs. nach obiger Tabelle, relevant nur erste 2 Buchstaben im lowercase */
 export function i18localize(newLang) {
  let pageLang
  const sul = newLang.substr(0,2).toLowerCase() // User-Selectavle UpperCase
  for(let i=0;i<i18_availLang.length;i++){
    const ilang = i18_availLang[i]
    if(ilang.substring(0,2).toLowerCase() == sul) pageLang = sul
  }
  if(pageLang === undefined){
    pageLang = i18_defaultLang
    console.warn(`i18n.js: New Language:'${newLang}' not found, Fallback:'${pageLang}'`)
  }

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

