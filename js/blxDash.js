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
const blxFW = document.getElementById("blxFW")

const navDevicelist = document.getElementById('nav-devicelist')


// BLE Buttons
const blxPinEnter = document.getElementById("blxPinEnter")
const blxBadgeButton = document.getElementById("blxBadgeButton")
const blxSyncButton = document.getElementById("blxSyncButton")
const blxMeasureButton = document.getElementById("blxMeasureButton")
const blxUploadButton = document.getElementById("blxUploadButton")
const blxInfoButton = document.getElementById("blxInfoButton")
const blxClearButton = document.getElementById("blxClearButton")
const blxParametersButton = document.getElementById("blxParametersButton")
const blxSysParButton = document.getElementById("blxSysParButton")
const blxSyncButtonSpan = document.getElementById("blxSyncButtonSpan")
const blxUploadButtonSpan = document.getElementById("blxUploadButtonSpan")
const blxInfoButtonSpan = document.getElementById("blxInfoButtonSpan")
const blxClearButtonSpan = document.getElementById("blxClearButtonSpan")
const blxParametersSpan = document.getElementById("blxParametersSpan")
const blxSetPinButton = document.getElementById("blxSetPinButton")
const blxParameterEdit = document.getElementById("blxParameterEdit")
// Menue Buttons
const button0Link = document.getElementById("button0-link")
const button1Terminal = document.getElementById("button1-terminal")
const button2MainMenu = document.getElementById("button2-maincontent")
const button3Setup = document.getElementById("button3-setup")
const button4ServerSync = document.getElementById("button4-sync")

// Dialoge
//const qrscannerDialog = document.getElementById("qrscanner-dialog") - via openSelectedCamera()
const spinnerDLG = document.getElementById("spinner")
const okDialogDOM = document.getElementById("ok-dialog")
const editParamDLG = document.getElementById("edit-params")
const setupDLG = document.getElementById("setup-dialog")

// UI Elemente
const jdFooteronline = document.getElementById("jd-footeronline")
const jdFooteroffline = document.getElementById("jd-footeroffline")
const jdServertest = document.getElementById("jd-servertest")

//================ TESTSACHEN ANFANG ============
//================ TESTSACHEN ENDE ============
function disabler(disf) { // Dis-/En-abler for clickable Elements
    const pinOk = blx.getPinOK()
    button0Link.disabled = disf

    let dss = "none"
    if (pinOk !== true && disf === false && connectionLevel >= 3) dss = "block"
    blxPinEnter.style.display = dss
    blxBadgeButton.disabled = disf // Only for Factory Setup, see urlpar.badge

    if (connectionLevel == 0 || pinOk !== true) disf = true // Only disable if FULL Disconnected or PIN Error
    blxSyncButton.disabled = disf
    blxMeasureButton.disabled = disf

    blxUploadButton.disabled = disf
    blxInfoButton.disabled = disf
    blxClearButton.disabled = disf
    blxParametersButton.disabled = disf
    blxSysParButton.disabled = disf

    // Don't show Logger Buttons for "only" Sensors
    if (blxDevice !== undefined && blxDevice.deviceType >= 1000) dss = "block"
    else dss = "none"

    blxSyncButtonSpan.style.display = dss
    blxUploadButtonSpan.style.display = dss
    blxInfoButtonSpan.style.display = dss
    blxClearButtonSpan.style.display = dss
    blxParametersSpan.style.display = dss
}


// Callback currently to Console only  m:Message, v:Value, xinfo:Text
function bleCallback(m, v, xinfo) {
    switch (m) {
        case 'CON':
            connectionLevel = v
            switch (v) {
                case 0: // norm. never sent
                case 1:
                    blxConnectButtonText.textContent = "Connect" // (Re-)Connect
                    blxInfoLine.textContent = `Disconnect...`
                    blxMemory.textContent = '-'
                    blxSync.textContent = '-'
                    blxSignal.hidden = true
                    blxMeasureData.innerHTML = '-'
                    button0Link.querySelector('i').classList.remove('fa-beat')
                    disabler(false)
                    break
                case 2: // only advertsing Name known, no MAC etc..
                    advertisingName = blx.getDevice().advertisingName
                    blxDeviceName.textContent = advertisingName
                    blxMAC.textContent = '-'
                    blxType.textContent = '-'
                    blxFW.textContent = '-'
                    button0Link.querySelector('i').classList.add('fa-beat')
                    blxSignal.textContent = '- dBm'
                    blxSignal.style.backgroundColor = 'gray'
                    blxConnectButtonText.textContent = blxInfoLine.textContent = `Connecting '${advertisingName}'...`
                    blxGraph.innerHTML = "" // During Advertising no Link...
                    break
                case 3: // 
                    blxInfoLine.textContent = "Reading IDs..."
                    blxConnectButtonText.textContent = `'${advertisingName}'` // Disconnect

                    break
                case 4: // Full Connected
                    blxSignal.hidden = false
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
            let bars = (v * 0.273) + 28; // Farben wie Blueshell
            var nc = 'limegreen'
            if (bars >= 0) {
                if (bars < 4) nc = 'gray'
                else if (bars < 8) nc = 'orange'  // (Sig. < -70 dBm) Weak
                else if (bars > 15) bars = 15;
            }
            blxSignal.textContent = `${v} dBm`
            blxSignal.style.backgroundColor = nc

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
let lastOnlineState 
function _blxBusyMonitor() {
    blxStateSpinner.textContent = _blxCmdFreeCnt++
    const ns =  navigator.onLine
    if(lastOnlineState !== ns){
        jdFooteronline.hidden = !ns
        jdFooteroffline.hidden = ns
        jdServertest.disabled = !ns
        lastOnlineState = ns    
    }
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
        if (connectionLevel <= 2) bleCallback('CON', 0) // Reset Connection
    }
}

async function calculateMemory(gflag) { // get flag (= with new) if true: disabler() by caller
    let memstr = "???"
    try {
        if (gflag) {
            await _blxCmdSend(".m") // calculate memory
        }
        let m = blx.getMemory()
        let mperc
        if (m.max > 0) mperc = (m.total * 100 / m.max).toFixed(2)
        else mperc = 'Unknown'

        let mmode = "???"
        switch (m.mode) {
            case 2:
            case 0:
                mmode = "Rec.OFF";
                break
            case 1:
                mmode = "LINEAR";
                break;
            case 3:
                mmode = "RING"
        }
        memstr = "[Total:" + m.total + "(" + mperc + "%," + mmode + ")"
        if (gflag) memstr += " New:" + m.incnew
        memstr += "] Bytes"
    } catch (error) {
        blxCmdRes.textContent = error
    }
    blxMemory.textContent = memstr
}

async function showLink() { // Check if (old) Graf Data is already in Store
    let link = "(No Data)"
    try {
        await blStore.get(blxDevice.deviceMAC + '_xtract.edt')
        const KeyVal = blStore.result() // undefined opt.
        if (KeyVal !== undefined) {
            link = "<a target='_blank' href='../gdraw.html?st=" + blxDevice.deviceMAC + "_xtract.edt&sn=" +
                advertisingName + "'>Show Graph</a> (" + KeyVal.v.akt_len + " Bytes, " + KeyVal.v.ctime
                    .toLocaleString() + ")"
        }
    } catch (error) {
        blxCmdRes.textContent = error
    }
    blxGraph.innerHTML = link
}

async function show_details() {
    if (connectionLevel >= 3) {
        blxDevice = blx.getDevice()
        blxMAC.textContent = blxDevice.deviceMAC
        blxType.textContent = blxDevice.deviceType
        blxFW.textContent = blxDevice.firmwareVersion
        if (connectionLevel == 4 && blxDevice.deviceType >= 1000) { // Only for Loggers
            await calculateMemory(true)
            await showLink()
        }
        const secs = blxDevice.deltaToApp
        let delta = secs + " sec"
        if (secs > 86400) delta = (secs / 86400).toFixed(3) + " d"
        blxSync.textContent = delta
        blxInfoLine.textContent = "Connected"
        blxMeasureData.innerHTML = '-'
        blxParameterEdit.innerHTML = ""
    }
}



//---------- the buttons ----------------
// Buton COnnect/Disconnect gedrueckt
async function blxConnect() {
    blxCmdRes.textContent = '-'
    disabler(true)
    spinnerShow()
    try {
        if (connectionLevel >= 3) await _blxCmdSend(".d") // disconnect
        else {
            await _blxCmdSend(".c") // connect
            await show_details()
        }
    } catch (error) {
        blxCmdRes.textContent = error
    }
    spinnerClose()
    disabler(false)
    JD.sidebarMax(0.5)
}

// Print a Badge (if Labeprinter is enabled) Factory Function!
function blxPrintBadge() {
    let uflag = false
    if (blxDevice === undefined) {
        blxDevice = blx.getDevice()
        uflag = true
    }
    let urlpar = "mac=" + blxDevice.deviceMAC +
        "&type=" + blxDevice.deviceType +
        "&fw=" + blxDevice.firmwareVersion +
        "&advname=" + blxDevice.advertisingName

    window.open("../labels/badge.html?" + encodeURI(urlpar), "_blank")
    if (uflag === true) blxDevice = undefined
}

async function blxSetPin() { // CMD used to enable PIN
    blxCmdRes.textContent = '-'
    const pin = blxPIN.value
    disabler(true)
    spinnerShow()
    try {
        if (pin.length < 1) throw "ERROR: PIN EMPTY"
        await _blxCmdSend(".i " + pin)
        blxPIN.value = ''
        await show_details()
    } catch (error) {
        blxCmdRes.textContent = error
    }
    spinnerClose()
    disabler(false)
}

async function blxSyncTime() {
    disabler(true)
    spinnerShow()
    try {
        await _blxCmdSend(".t set")
        blxSync.textContent = 0
    } catch (error) {
        blxCmdRes = error
    }
    spinnerClose()
    disabler(false)
}

async function blxUpload() {
    disabler(true)
    spinnerShow()
    try {
        await _blxCmdSend(".u") // Upload
        await calculateMemory(false) // no 'New'
        await _blxCmdSend(".x") // Extract to 'MAC_xtract.edt'
        await showLink()
    } catch (error) {
        blxCmdRes.textContent = error
    }
    spinnerClose()
    disabler(false)
}

let measureData = "???"
// *todo* Measure might take longer than standard Timeout 5 sec, 
// add separate '.m' command in API
async function blxMeasure() {
    disabler(true)
    spinnerShow()
    blxMeasureData.innerHTML = "Wait..."
    try {
        await _blxCmdSend("e 1") // With HK
    } catch (error) {
        blxCmdRes.textContent = error
    }
    spinnerClose()
    disabler(false)
}


//*********** Parameter-Edit START ******************
// Description and Index of Parameters, see 'legacy/edit_lxp.php'
// In strings '@' is not allowed at Pos 0 (replaced by '?')
// '#' is treated as Remark-Separator (replaced by '?')
// '$' for Len of strings (e.g. $11: 11 chars)
const p100_beschr = [
    "*@100_System",
    "*DEVICE_TYP",
    "*MAX_CHANNELS",
    "*HK_FLAGS",
    "*NewCookie [Parameter 10-digit Timestamp.32]",
    "Device_Name[BLE:$11/total:$41]",
    "Period_sec[10..86400]",
    "Period_Offset_sec[0..(Period_sec-1)]",
    "Period_Alarm_sec[0..Period_sec]",
    "Period_Internet_sec[0..604799]",
    "Period_Internet_Alarm_sec[0..Period_Internet_sec]",
    "UTC_Offset_sec[-43200..43200]",
    "Flags (B0:Rec B1:Ring) (0: RecOff) B2:Compress",
    "HK_flags (B0:Bat B1:Temp B2.Hum B3.Perc B4.Baro)",
    "HK_reload[0..255]",
    "Net_Mode (0:Off 1:OnOff 2:On_5min 3:Online)",
    "ErrorPolicy (O:None 1:RetriesForAlarms, 2:RetriesForAll)",
    "MinTemp_oC[-40..10]",
    "Config0_U31 (B0:OffPer.Inet:On/Off B1,2:BLE:On/Mo/Li/MoLi B3:EnDS B4:CE:Off/On B5:Live:Off/On)",
    "Configuration_Command[$79]",
]
const pkan_beschr = [
    "*@ChanNo",
    "Action[0..65535] (B0:Meas B1:Cache B2:Alarms)",
    "Physkan_no[0..65535]",
    "Kan_caps_str[$8]",
    "Src_index[0..255]",
    "Unit[$8]",
    "Mem_format[0..255]",
    "DB_id[0..2e31]",
    "Offset[float]",
    "Factor[float]",
    "Alarm_hi[float]",
    "Alarm_lo[float]",
    "Messbits[0..65535]",
    "Xbytes[$32]"
]
const p200_beschr = [ // sys_param.lxp
    "*@200_Sys_Param",
    "APN[$41]",
    "Server/VPN[$41]",
    "Script/Id[$41]",
    "API Key[$41]",
    "ConFlags[0..255] (B0:Verbose B1:RoamAllow B4:LOG_FILE (B5:LOG_UART) B7:Debug)",
    "SIM Pin[0..65535] (opt)",
    "APN User[$41]",
    "APN Password[$41]",
    "Max_creg[10..255]",
    "Port[1..65535]",
    "Server_timeout_0[1000..65535]",
    "Server_timeout_run[1000..65535]",
    "Modem Check Reload[60..3600]",
    "Bat. Capacity (mAh)[0..100000]",
    "Bat. Volts 0%[float]",
    "Bat. Volts 100%[float]",
    "Max Ringsize (Bytes)[1000..2e31]",
    "mAmsec/Measure[0..1e9]",
    "Mobile Protocol[0..255] B0:0/1:HTTP/HTTPS B1:PRESET B2,3:TCP/UDPSetup"
]

let original_par // backup of original Parameters

// Get Values of all visible Parameters inputs, each array entry has 1 input
// Important: NO user input with '@' allowed!
// Characters after '#' are treated as comments
function blxEditedParamGet(typ) {
    // Scan List of HTML elements with name '_pidxNN'
    const plen = typ ? blxDevice.sys_param.length : blxDevice.iparam.length
    for (let i = 0; i < plen; i++) {
        let pinp = document.getElementById("_pidx" + i)
        let nval = pinp.value.toString()
        if (pinp.disabled === false) { // User Edit
            // Checks...
            // Replace first @ by '?'
            if (nval.charAt(0) === '@') nval = '?' + nval.substr(1);
            // Replace '#' by '?'
            nval.replace("#", "?")
        }
        if (!typ) blxDevice.iparam[i] = nval
        else blxDevice.sys_param[i] = nval
    }
}

// Send Edited List, Check first if changed
// Changed if synthesized CRC and/length is different
//
// If Parameter Transfer fails, Risk of not complete iparam.lxp on Device
// Then retry! In any case: Last known Parameters are stored as '..#BAK#_iparam.lxp'
async function blxParSend(typ) {
    let result
    spinnerShow()
    if (!typ) { // iparam
        try {
            blxEditedParamGet(0)
            blx.CompactIparam(blxDevice.iparam)
            blxParameters(false, 0) // Show Compacted Parameters

            let cres = blx.IparamValidate(blxDevice.iparam)
            if (cres) throw "ERROR: Iparam-Check(3):\n" + cres

            const enc = new TextEncoder()
            let filebuf = enc.encode(blxDevice.iparam.join('\n') + '\n')
            let crc32 = blx.getCrc32(filebuf)

            await blStore.get(blxDevice.deviceMAC + '_iparam.lxp')
            let store_iparam = blStore.result() // undefined opt.
            if (store_iparam !== undefined &&
                crc32 === store_iparam.v.crc32 &&
                filebuf.length === store_iparam.v.akt_len &&
                blxDevice.iparam_dirtyflag === false) {
                // No Changes found
                blxCmdRes.textContent = "No Changes"
                spinnerClose()
                return result
            } else if (store_iparam === undefined) {
                store_iparam = {
                    v: {}
                } // Need Obj
            }

            // Changes! Set new Cookie and write back
            blxEditedParamGet(0)
            blxDevice.iparam[4] = (Date.now() / 1000).toFixed(0)
            blxDevice.iparam_dirtyflag = true

            const enc2 = new TextEncoder()
            store_iparam.v.bytebuf = enc2.encode(blxDevice.iparam.join('\n') + '\n')
            store_iparam.v.crc32 = blx.getCrc32(store_iparam.v.bytebuf)
            store_iparam.v.total_len = store_iparam.v.bytebuf.length
            store_iparam.v.akt_len = store_iparam.v.total_len
            store_iparam.v.ctime = new Date(blxDevice.iparam[4] * 1000)
            store_iparam.v.esync_flag = true // Not set by Server->Device!

            await blStore.set(blxDevice.deviceMAC + '_iparam.lxp', store_iparam.v) // First Store
            await _blxCmdSend(".fput " + blxDevice.deviceMAC + '_iparam.lxp') // Then Upload 
            if (_blxCmdResult) {
                throw _blxCmdResult
            }
            await _blxCmdSend("X") // Check iparam
            if (_blxCmdResult) {
                throw _blxCmdResult
            }
            // If all OK: Remove edited Params and store Backup
            blxParameterEdit.innerHTML = ""
            blxDevice.iparam_dirtyflag = false
            await blStore.set(blxDevice.deviceMAC + '_#BAK_iparam.lxp', store_iparam.v)
        } catch (err) {
            await okDialogDo(`<b>Parameter Check 'iparam'</b><br><br><br>${err}<br>`)
            blxCmdRes.textContent = err
            result = err
        }
    } else { // SysParam
        try {
            blxEditedParamGet(1)
            blxParameters(false, 1) // Show Compacted Parameters

            let cres = blx.SysParamValidate(blxDevice.sys_param)
            if (cres) throw "ERROR: SysParam-Check(3):\n" + cres

            const enc = new TextEncoder()
            let filebuf = enc.encode(blxDevice.sys_param.join('\n') + '\n')
            let crc32 = blx.getCrc32(filebuf)

            await blStore.get(blxDevice.deviceMAC + '_sys_param.lxp')
            let store_sysParam = blStore.result() // undefined opt.
            if (store_sysParam !== undefined &&
                crc32 === store_sysParam.v.crc32 &&
                filebuf.length === store_sysParam.v.akt_len &&
                blxDevice.sys_param_dirtyflag === false) {
                // No Changes found
                blxParameterEdit.innerHTML = ""
                blxCmdRes.textContent = "No Changes"
                spinnerClose()
                return result
            } else if (store_sysParam === undefined) {
                store_sysParam = {
                    v: {}
                } // Need Obj
            }

            blxDevice.sys_param_dirtyflag = true

            const enc2 = new TextEncoder()
            store_sysParam.v.bytebuf = enc2.encode(blxDevice.sys_param.join('\n') + '\n')
            store_sysParam.v.crc32 = blx.getCrc32(store_sysParam.v.bytebuf)
            store_sysParam.v.total_len = store_sysParam.v.bytebuf.length
            store_sysParam.v.akt_len = store_sysParam.v.total_len
            store_sysParam.v.ctime = new Date(blxDevice.sys_param[4] * 1000)
            store_sysParam.v.esync_flag = true // Not set by Server->Device!

            await blStore.set(blxDevice.deviceMAC + '_sys_param.lxp', store_sysParam.v) // First Store
            await _blxCmdSend(".fput " + blxDevice.deviceMAC + '_sys_param.lxp') // Then Upload 
            if (_blxCmdResult) {
                throw _blxCmdResult
            }
            await _blxCmdSend("Y") // Check SysParam
            if (_blxCmdResult) {
                throw _blxCmdResult
            }

            // If all OK: Remove edited Params and store Backup
            blxParameterEdit.innerHTML = ""
            blxDevice.sys_param_dirtyflag = false
            await blStore.set(blxDevice.deviceMAC + '_#BAK_sys_param.lxp', store_sysParam.v)
        } catch (err) {
            await okDialogDo(`<b>Parameter Check 'sys_param'</b><br><br><br>${err}<br>`)
            blxCmdRes.textContent = err
            result = err
        }
    }
    spinnerClose()
    return result
} // blxParSend

// Kaskadierbar
var spinnerSHowLevel = 0
function spinnerShow() {
    if (!spinnerSHowLevel) spinnerDLG.showModal()
    spinnerSHowLevel++
}
function spinnerClose() {
    spinnerSHowLevel--
    if (!spinnerSHowLevel) spinnerDLG.close()
}

function blxParCancel(typ) {
    if (!typ) blxDevice.iparam = original_par
    else blxDevice.sys_param = original_par
    blxParameterEdit.innerHTML = ""
    blxCmdRes.textContent = "Edit Parameters Cancelled"
}

function blxIparamAddChannel() { // Only for iparam
    try {
        blxEditedParamGet() // Get changes first
        blx.IparamAddChannel(blxDevice.iparam, true)
        blxParameterEdit.innerHTML = ""
        blxParameters(false, 0)
    } catch (error) {
        blxCmdRes.textContent = error
    }
}

// Edit Parameters typ: 0:iparam, 1:sys_param
function blxParameters(orig_copy, typ) {
    const parray = typ ? blxDevice.sys_param : blxDevice.iparam
    if (orig_copy === true) {
        // Make Deep Copy from Original if called from GUI
        original_par = []
        if (parray === undefined) {
            alert("ERROR: Iparam-Check(1):\nNo Parameters found!")
            return
        }
        for (let i = 0; i < parray.length; i++) original_par[i] = parray[i]
        let cres = blx.IparamValidate(blxDevice.iparam)
        if (cres) {
            alert("ERROR: Iparam-Check(2):\n" + cres)
            return
        }
    }

    let beschr
    let bidx = 0
    let rel = 0
    let phtml = "<b>Parameter Edit ('" + (typ ? "sys_param" : "iparam") + "')</b><br><br><br>"
    let lparam = '???'
    let section = -1
    for (let i = 0; i < parray.length; i++) {
        lparam = parray[i]
        if (lparam.charAt(0) === '@') {
            section = parseInt(lparam.substring(1))
            if (section === 100) {
                beschr = p100_beschr
                beschr[0] = "*=== System ==="
            } else if (section === 200) {
                beschr = p200_beschr
                beschr[0] = "*=== Sys_Param ==="
            } else {
                beschr = pkan_beschr
                beschr[0] = "*=== Channel #" + section + " ==="
            }
            bidx = 0
            rel = 0
            phtml += "<hr>"
        } else {
            rel++
        }
        // Build 1 line and name Elements '_pidxNN'
        phtml += '[' + i + '(+' + rel + ')]' + '<input type="text" id="_pidx' + i + '"  value="' + lparam + '"'
        if (beschr[rel] !== undefined && beschr[rel].charAt(0) === '*') phtml += " disabled"
        phtml += "> '" + beschr[rel] + "'<br>"
    }
    blxParameterEdit.innerHTML = phtml

}
async function blxEditIparam() {
    blxParameters(true, 0)
    for (; ;) {
        const res = await editParamDialogDo(0)
        if (res === 's') {
            const sres = await blxParSend(0)
            if (!sres) break // Alles OK
        } else {
            blxParCancel(0)
            break;
        }
    }
}
async function blxEditSysparam() {
    blxParameters(true, 1)
    for (; ;) {
        const res = await editParamDialogDo(1)
        if (res === 's') {
            const sres = await blxParSend(1)
            if (!sres) break // Alles OK
        } else {
            blxParCancel(1)
            break;
        }
    }
}

//*********** Parameter-Edit END ******************

async function blxMemoryInfo() {
    disabler(true)
    spinnerShow()
    try {
        await _blxCmdSend("v") // Scan vdir first
        await calculateMemory(true)
    } catch (error) {
        blxCmdRes.textContent = error
    }
    spinnerClose()
    disabler(false)
}
async function blxClearDevice() {
    disabler(true)
    if (await okDialogDo('<b>Clear Device</b><br><br><br>OK to clear Device Memory?', true)) {
        spinnerShow()
        try {
            if (blxDevice.diskCheckOK !== undefined && blxDevice.diskCheckOK == true) {
                document.getElementById("blxInfoLine").textContent = "Start new Measure, Clear all Data"
                await _blxCmdSend("n")
            } else {
                document.getElementById("blxInfoLine").textContent =
                    "Start new Measure, Clear all Data (Clean FlashDisk, may need up to 240 sec)"
                await _blxCmdSend("n1", 240000) // Possible slow!
            }
            document.getElementById("blxMemory").textContent = '-'
            await blStore.remove(blxDevice.deviceMAC + '_xtract.edt') // Also remove from Store
            await showLink()

        } catch (error) {
            document.getElementById("blxCmdRes").textContent = error
        }
        spinnerClose()
    }
    disabler(false)
}

async function blxServerDataSync() {
    console.log("ServerSync")
}

async function updateDeviceList() {
    let devs = []
    await blStore.count()
    let lenTotal = 0
    await blStore.iterate(function (value) {
        const storemac = value.k.substr(0, 16)
        // Search only MACs
        if (storemac.length === 16 && value.k.charAt(16) === '_') {
            // Find entry for with MAC
            // console.log("STORE:",value)        
            let idx
            // Find if MAC already exists
            for (let i = 0; i < devs.length; i++) {
                if (devs[i].mac === storemac) {
                    idx = i
                    break
                }
            }
            // Optionally add to array of MACs
            if (idx === undefined) {
                idx = devs.length
                devs.push({
                    mac: storemac, // 16 Digits
                    files: [], // List of Files
                    advname: '(unknown)', // Advertising Name
                    pin: 0
                })
            }
            // Spezielle Files filtern
            const fname = value.k.substr(17)
            // console.log(storemac,fname)
            if (value.k === storemac + '_#BlxIDs') { // others: mac_#xxx: internal
                devs[idx].advname = value.v.advertisingName
            } else if (value.k === storemac + '_#PIN') { // others: mac_#xxx: internal
                devs[idx].pin = value.v
            } else if (value.k.charAt(17) !== '#') { // ignore local Backupfiles
                if (value.v.akt_len !== undefined) {
                    lenTotal += value.v.akt_len
                }
                let sflag = false
                if (fname === 'data.edt') sflag = true // **** TEST ***
                devs[idx].files.push({
                    fname: fname,
                    aktlen: value.v.akt_len,
                    syncflag: sflag
                })
            }
        }
    })
    // Iterate End

    devs.sort(
        function(a, b){
            return a.advname.localeCompare(b.advname)
        }
    );


    /* Show Test Data in navDevicelist */
    console.log("Devs:", devs.length, " Total kB:", lenTotal / 1024)
    let ndl = '';
    for (let i = 0; i < devs.length; i++) { // For each known Device
        const dev = devs[i]
        const tel = `<button class="navitem"><i class="fa-solid fa-fw fa-file-waveform"></i><span class="navitem-txt">${dev.advname}`
        if(xx)
        tel += `</span></button>`
        ndl += tel

        const vf = devs[i].files
        for (let ii = 0; ii < vf.length; ii++) {
            if (vf[ii].syncflag) console.log("Sync: ", devs[i].advname, vf[ii].fname, vf[ii].aktlen)

        }
    }
    navDevicelist.innerHTML = ndl

}


//---- helpers----
async function dashSleepMs(ms = 1) { // use: await qrSleepMs()
    let np = new Promise(resolve => setTimeout(resolve, ms))
    return np
}
// ---------- okDialog -------------
let okDialoginit = false
let okDialogOpenFlag
let okDialogResult
async function okDialogDo(question, xconfirm = false) {
    blx.frq_ping(880, 0.3, 0.3)
    // addEventListener only one instance added
    okDialogDOM.querySelector('#ok-content').innerHTML = question
    const okbut = okDialogDOM.querySelector('#dlgBtnOK')
    const okchk = okDialogDOM.querySelector('#dlgBtnChk')
    if (!okDialoginit) {
        okbut.addEventListener('click', () => {
            okDialogResult = true
            okDialogOpenFlag = false
        })
        okDialogDOM.querySelector('#dlgBtnClose').addEventListener('click', () => {
            okDialogOpenFlag = false
        })
        okchk.addEventListener('click', () => {
            okbut.disabled = !okchk.checked
        })
        okDialoginit = true
        okDialogResult = false
    }
    if (!xconfirm) {  // Extra Confirm required
        okbut.disabled = false
        okchk.hidden = true
    } else {
        okbut.disabled = true
        okchk.hidden = false
    }

    okDialogOpenFlag = true
    okDialogDOM.showModal()
    for (; ;) {
        await dashSleepMs(50)
        if (!okDialogOpenFlag) break
    }
    okDialogDOM.close()
    return okDialogResult

}

// ------------- editParameterDialog ------------
let editParamDialogInit = false
let editParamDialogOpenFlag
let editParamDialogResult
async function editParamDialogDo(typ) {
    const achan = editParamDLG.querySelector('#editBtnAddChannel')
    if (!editParamDialogInit) {
        editParamDLG.querySelector('#editBtnClose').addEventListener('click', () => {
            editParamDialogResult = 'x' // Simple Close
            editParamDialogOpenFlag = false
        })
        achan.addEventListener('click', blxIparamAddChannel)
        editParamDLG.querySelector('#editBtnSend').addEventListener('click', () => {
            editParamDialogResult = 's' // SEND
            editParamDialogOpenFlag = false
        })
        editParamDialogInit = true
    }

    if (!typ) {
        achan.hidden = false
    } else {
        achan.hidden = true
    }
    editParamDialogOpenFlag = true
    editParamDialogResult = '?' // Unknown
    editParamDLG.showModal()
    for (; ;) {
        await dashSleepMs(50)
        if (!editParamDialogOpenFlag) break
    }
    editParamDLG.close()
    return editParamDialogResult
}

//---------- SetupDialog ---------
let setupDialogInit = false
let setupDialogResult
let setupDialogOpenFlag
let setupOptions = { dtheme: false, font: 100, lang: 'EN', server: './sync/blxremote.php', accesstoken: '123456' } // in 2 Gross-Buchstaben
async function blxSetup() {
    setupDialogResult = undefined
    if (!setupDialogInit) {
        // Close und OK erstmal identisch! - Handler fuer 'Sofort'-Felder:
        setupDLG.querySelector('#setupBtnClose').addEventListener('click', () => {
            setupDialogOpenFlag = false
        })
        setupDLG.querySelector('#setupBtnOK').addEventListener('click', () => {
            setupDialogResult = 'ok'
            setupDialogOpenFlag = false
        })
        setupDLG.querySelector('#jd-theme').addEventListener('click', (e) => {
            JD.dashToggleTheme()
            setupOptions.dtheme = !setupOptions.dtheme
        })
        setupDLG.querySelector('#jd-fontsize').addEventListener('change', (e) => {
            const fs = setupDLG.querySelector('#jd-fontsize').value
            setupOptions.font = parseInt(fs)
            JD.dashSetFont(setupOptions.font / 100)
        })
        setupDLG.querySelector('#jd-lang').addEventListener('change', (e) => {
            const lng = setupDLG.querySelector('#jd-lang').value
            setupOptions.lang = lng
            I18.i18localize(lng)
        })
        setupDLG.querySelector('#jd-servertest').addEventListener('click', (e) => {
            window.open(setupDLG.querySelector('#jd-server').value);
        })


        setupDialogInit = true
    }

    setupDLG.querySelector('#jd-theme').checked = setupOptions.dtheme
    setupDLG.querySelector('#jd-fontsize').value = setupOptions.font + '%'
    setupDLG.querySelector('#jd-lang').value = setupOptions.lang

    // Statische Daten
    setupDLG.querySelector('#jd-server').value = setupOptions.server
    setupDLG.querySelector('#jd-accesstoken').value = setupOptions.accesstoken


    setupDialogOpenFlag = true
    setupDLG.showModal()
    for (; ;) {
        await dashSleepMs(50)
        if (!setupDialogOpenFlag) break
    }
    setupDLG.close()
    if(setupDialogResult === 'ok'){
        setupOptions.server = setupDLG.querySelector('#jd-server').value
        setupOptions.accesstoken = setupDLG.querySelector('#jd-accesstoken').value
    }


    await blStore.set('#blxDash_#SETUP', setupOptions)
}

//---------------- setup ------------
async function setup() {
    // Isolate URL Parameters
    const qs = location.search.substr(1).split('&')
    var urlpar = {}
    for (let x = 0; x < qs.length; x++) {
        let kv = qs[x].split('=')
        if (kv[1] === undefined) kv[1] = ''
        urlpar[kv[0]] = kv[1]
    }

    if (urlpar.badge !== undefined) { // Show Print Badge
        blxBadge.style.display = "block"
    }

    blx.setTerminal('blxTerminal', bleCallback) // Initially Show Terminal in div 'blxTerminal'
    //blx.setTerminal(undefined, bleCallback) // Initially Hide Terminal in div 'blxTerminal'
    setInterval(_blxBusyMonitor, 1000)

    button0Link.addEventListener('click', blxConnect)
    button1Terminal.addEventListener('click', () => {
        location.href = '#section_terminal'
        JD.sidebarMax(0.5)
    })
    button2MainMenu.addEventListener('click', () => {
        location.href = '#section_main'
        JD.sidebarMax(0.5)
    })

    blxBadgeButton.addEventListener('click', blxPrintBadge)
    blxSetPinButton.addEventListener('click', blxSetPin)
    blxInfoButton.addEventListener('click', blxMemoryInfo)
    blxSyncButton.addEventListener('click', blxSyncTime)
    blxUploadButton.addEventListener('click', blxUpload)
    blxMeasureButton.addEventListener('click', blxMeasure)
    blxClearButton.addEventListener('click', blxClearDevice)

    blxParametersButton.addEventListener('click', blxEditIparam)
    blxSysParButton.addEventListener('click', blxEditSysparam)
    button3Setup.addEventListener('click', blxSetup)
    button4ServerSync.addEventListener('click', blxServerDataSync)


    // Scanner-printf via Terminal-printf
    QRS.setQrLogPrint(blx.terminalPrint)

    await blStore.get('#blxDash_#SETUP')
    const so = blStore.result()
    if (so !== undefined) {
        setupOptions = so.v
        if (setupOptions.dtheme) JD.dashToggleTheme()
        if (setupOptions.font) JD.dashSetFont(setupOptions.font / 100)
        if (setupOptions.lang) I18.i18localize(setupOptions.lang)
    }

    await updateDeviceList()
}

// -- Debugging --
async function Talk2Server(remurl, scmd, accessToken, mac, filename, data) { // ATTENTION: Fetch only via HTTPS/localhos possible
    try {
        const v = {
            mac: mac,
            filename: filename,
            data: data,
        } 
        const response = await fetch(remurl+"?k="+accessToken+"&cmd="+scmd, {
                method: "POST",
                mode: "cors",
                //credentials: "include", // nur wenn kein Mit Wildcard Access 
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(v)
            })

            if (response.status === 200) {
                let result
                try {
                    result = await response.json()
                } catch (ierr) {
                    result = {status: `ERROR: Server replies '${ierr}'`}
                }
                const ts = result.timestamp
                if(ts !== undefined) result.date = new Date(ts * 1000)
    console.log("ServerReply: ",result)
                return result;
            } else throw "'" + response.status + ": " + response.statusText+"'"
    } catch (err) { // Catch e.g. CORS Errors
        console.log("ERROR:", err)
        return "ERROR: " + err // 'ERROR: Magic first word
    }
}


async function dbg_action() {
    //await editParamDialogDo(1, "<b>Edit Parameter</b>")
    //await okDialogDo('<b>Test</b><br><br><br>Dialog Template', false)
    //await updateDeviceList()


    //const remurl = './sync/blxremote.php'
    //const remurl = 'https://joembedded.de/wrk/fetch/blxremote.php'
    const remurl = setupOptions.server
    const accessToken = setupOptions.accesstoken

    const mac = '0011223344556677'
    const filename = 'testfile.dat'
    const scmd = 'upsync'
    const data = {
        name: 'Jürgen & Ute Wickenhäuser',
/*        alter: 59,
        kids: ['Laura', 'Jan'] */
    }
    await Talk2Server(remurl, scmd, accessToken, mac, filename, data)

}
document.getElementById('dbg-action').addEventListener('click', dbg_action)

setup()
//***