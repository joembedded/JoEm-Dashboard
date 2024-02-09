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
const blxStateText = document.getElementById("blxStateText")
const blxStateSpinner = document.getElementById("blxStateSpinner")
const blxInfoLine = document.getElementById("blxInfoLine")
const blxGraph = document.getElementById("blxGraph")
const blxCmdRes = document.getElementById("blxCmdRes")
const blxConnectButtonText = document.getElementById("blxConnectButtonText")

const blxMemory = document.getElementById("blxMemory")
const blxSync = document.getElementById("blxSync")
const blxSignal = document.getElementById("blxSignal")
const blxMeasureData = document.getElementById("blxMeasureData")

const blxDeviceName = document.getElementById("blxDeviceName")
const blxMAC = document.getElementById("blxMAC")
const blxType = document.getElementById("blxType")
const blxFW =document.getElementById("blxFW")

//================ TESTSACHEN ANFANG ============
//================ TESTSACHEN ENDE ============


// Callback currently to Console only  m:Message, v:Value, xinfo:Text
function bleCallback(m, v, xinfo) {
    switch (m) {
        case 'CON':
            connectionLevel = v
            switch (v) {
                case 0: // norm. never sent
                case 1:
                    blxConnectButtonText.textContent = "Connect" // (Re-)Connect
                    blxInfoLine.textContent = "Disconnected"

                    blxMemory.textContent = '-'
                    blxSync.textContent = '-'
                    blxSignal.textContent = '-'
                    blxMeasureData.innerHTML = '-'

                    disabler(false)
                    break
                case 2: // only advertsing Name known, no MAC etc..
                    advertisingName = blx.getDevice().advertisingName
                    blxDeviceName.textContent = advertisingName
                    blxMAC.textContent = '-'
                    blxType.textContent = '-'
                    blxFW.textContent = '-'

                    blxInfoLine.textContent = "Connecting..."
                    blxGraph.innerHTML = "" // During Advertising no Link...
                    break
                case 3: // 
                    blxInfoLine.textContent = "Reading IDs..."
                    blxConnectButtonText.textContent = "Disconnect"
                    break
                case 4: // Full Connected
                    break
            }
            break
        case 'PROG': // *todo* 2 passes possible due to data.edt / data.edt.old
            blxInfoLine.textContent = v + "%"
            break
        case 'GET_OK':
            blxInfoLine.textContent = "OK (" + v + " " + xinfo + ")"
            break
        case 'RSSI':
            blxSignal.textContent = v
            m = undefined // DontShow
            break
        case 'VSENS': // Special Sensor data, e.g. Acceleration, see Docu
            blxInfoLine.textContent = "VSENS " + xinfo + ": " + v
            m = undefined // DontShow
            break
        case 'INFO': // no v
            blxInfoLine.textContent = xinfo
            break

        case 'MSG':
            blxInfoLine.textContent = "MSG " + v + ":" + xinfo
            break
        case 'WARN':
            blxCmdRes.textContent = "WARNING " + v + ":" + xinfo
            break

        case 'ERR':
            blxCmdRes.textContent = "ERROR " + v + ":" + xinfo
            break
        case 'BZY':
            // Busy/Action notification - *todo* see BLX.JS 'Z'
            break

        // Measure Header
        case 'MEAS_CH':
            if (v > 0) measureData = "\nChannels:" + v
            else measureData = "\nMeasure..."
            break
        case 'MEAS_T':
            if (v > 0) measureData += " (Wait Max:" + v / 1000 + " sec)"
            blxMeasureData.innerHTML = measureData + "<br>..."
            break
        // Measure Values (later)
        case 'MEAS_V':
            if (xinfo[0] == '*') {
                xinfo = '(ALARM) ' + xinfo.substring(1)
            }
            if (v == 90 && blxDevice.sys_param !== undefined && blxDevice.sys_param[16] !== undefined) {
                const ulow = parseFloat(blxDevice.sys_param[15])
                const uhigh = parseFloat(blxDevice.sys_param[16])
                if (uhigh > ulow) {
                    let bperc = ((parseFloat(xinfo) - ulow) / (uhigh - ulow) * 100).toFixed(2)
                    if (bperc > 100) bperc = 100
                    xinfo += '(' + bperc + '%)'
                }
            } else if (v == 93 && blxDevice.sys_param !== undefined && blxDevice.sys_param[14] !==
                undefined) { // Energy
                const bcap = parseFloat(blxDevice.sys_param[14])
                if (!isNaN(bcap) && bcap > 0) {
                    const bperc = (parseFloat(xinfo) * 100 / bcap).toFixed(2)
                    xinfo += '(' + bperc + '%)'
                }
            }
            measureData += "<br>(" + v + ") " + xinfo
            blxMeasureData.innerHTML = measureData
            break
    }
    if (m !== undefined) console.log("BLX: ", m, v, xinfo)
}



// Called all sec
function _blxBusyMonitor() {
    blxStateSpinner.textContent = _blxCmdFreeCnt++
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
    document.getElementById('button1-terminal').addEventListener('click', () => location.href = '#section_terminal')

    // Scanner Output via Terminal
    QRS.setQrLogPrint(blx.terminalPrint)

}

setup()

//***