// *** blxDash.js  - Dashboard Funktionalitaet- Muss NACH load aufgerufen werden

import * as JD from './joemdash.js'
import * as QRS from './qrscanner.js'
import './jsQR.min.js' // Polyfill for Desktop
import * as I18 from './i18n.js'
import './blx.js' // *todo* './js/blx.min.js'
import './blStore.min.js' 

//--------- globals ------ 
const VERSION = 'V0.10 / 08.02.2024'
const COPYRIGHT = '(C)JoEmbedded.de'
const HELP = 'This is a "living product". Questions and requests are always welcome.'

let connectionLevel = 0
let advertisingName
let blxDevice

var urlpar = {} // Aufruf-Parameter, z.B. urlpar.test = abc fuer ?test=abc

// ----- UI-Elemente -------------
let blxStateText =  document.getElementById("blxStateText")
let blxStateSpinner =  document.getElementById("blxStateSpinner")
let blxInfoLine =  document.getElementById("blxInfoLine")
let blxCmdRes =  document.getElementById("blxCmdRes")

//================ TESTSACHEN ANFANG ============
//================ TESTSACHEN ENDE ============

// BLE Callback Callback currently to Console only  m:Message, v:Value, xinfo:Text
function bleCallback(m, v, xinfo) {
    console.log("BLX: ", m, v, xinfo)
}
    // Called all sec
    function _blxBusyMonitor() {
    }

    //-------- subsystem for BLX ------------
    // Pattern:
    // await _blxCmdSend(CMD)
    // if(_blxCmdResult) handle error: throw or alert ..

    let _blxCmdResult // Report Result here (OK: 0, else String)
    let _blxCmdBusyFlag = false
    let _blxCmdFreeCnt = 0

    // --- Kommando an Logger --
    async function _blxCmdSend(cmd, cmdtimeout) {
        blxStateText.textContent = "Busy"
        _blxCmdResult = 0
        _blxCmdBusyFlag = true
        _blxCmdFreeCnt = 0
        try {
            await blx.userSendCmd(cmd, cmdtimeout);
            console.log("CMD->", cmd)
            _blxCmdBusyFlag = false
            _blxCmdFreeCnt = 0
            blxStateText.textContent = "Ready"
        } catch (error) {
            _blxCmdBusyFlag = false
            _blxCmdFreeCnt = 0
            blxStateText.textContent = "ERROR: " + error
            _blxCmdResult = error
        }
    }


    //---------- the buttons ----------------
    // Buton COnnect/Disconnect gedrueckt
    async function blxConnect() {
        blxCmdRes.textContent = '-'
//x   disabler(true)
        try {
            if (connectionLevel >= 3) await _blxCmdSend(".d") // disconnect
            else {
                await _blxCmdSend(".c") // connect
//x					await show_details()
            }
        } catch (error) {
            blxCmdRes.textContent = error
        }
//x			disabler(false)
    }

 //---------------- setup ------------
function setup() {
    // Isolate URL Parameters
    const qs = location.search.substr(1).split('&')
    var urlpar = {}
    for (let x = 0; x < qs.length; x++) {
        let kv = qs[x].split('=')
        if (kv[1] === undefined) kv[1] = ''
        urlpar[kv[0]] = kv[1]
    }

    blx.setTerminal('blxTerminal', bleCallback) // Initially Show Terminal in div 'blxTerminal'
    //blx.setTerminal(undefined, bleCallback) // Initially Hide Terminal in div 'blxTerminal'
    setInterval(_blxBusyMonitor, 1000)

    document.getElementById('button0-link').addEventListener('click', blxConnect)

    // Scanner Output via Terminal
    QRS.setQrLogPrint(blx.terminalPrint)

}

setup()

//***