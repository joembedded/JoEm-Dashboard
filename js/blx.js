// BLX Bluetooth API (C) joembedded.de
// uses FileSaver.js
// uses blStore.js
// Distribute:   uglifyjs --warn blx.js -m -c -o blx.min.js
// (Version: uglify-es 3.3.9 )
/* eslint-disable no-undef */
/* eslint-disable camelcase */

/* blxUserCB Callback:
Messages (Large XINFO add. Par.)
  CON 0  - Disconnected, not reconnectable
  CON 1  - Disconnected, but reconnectable
  CON 2  - Connecting, reading IDs (ONLY advertisingName already available via blx.getDevice())
  CON 3  - Connected
  CON 4  - Full connected (also called after Reconnecting, blx.getDevice() complete)
  PROG perc - Progress in %
  UPLOAD total  - FULL/INC Upload Data Bytes
  GET len  - FNAME Upload from file
  GET_OK speed  - Upload OK Bytes/Sec
  RSSI   signal -  Signal in dBm, < -199 invalid
  VSENS  (only for special sensors) data, e.g: x y z  - Acceleration
  MSG type -  Message (in XINFO) 0: more irgendwas, 1: BLX.JS
  WARN type - Warning XINFO Text (1: Disconnect, 2:LOWSPEED, 3:NoFile, 4:FileError, 5:Retry)
  ERR - type - Message (in XINFO) (add.Par not used)
  MEAS_CH chans - Channels
  MEAS_T  time - Time in msec
  MEAS_V - chan - Text in XINFO
  BZY code param - BuZy Code (see 'Z')
*/

const blx = (() => { // Import as 'Revealing Module Pattern'
  'use strict'
  // private 'globals'
  const VERSION = 'V1.16 / 08.02.2024'
  const COPYRIGHT = '(C)JoEmbedded.de'
  const HELP = 'BLX.JS and BlueShell are "living products". Questions and requests are always welcome.'

  // ======SETUP and helpers=======
  async function sleepMs(ms = 1) { // use: await sleepMs()
    var np = new Promise(resolve => setTimeout(resolve, ms))
    return np;
  }

  function deltaToTimeString(delta) { // Helper Func msec to time
    var h
    var lstxt = ''
    delta /= 1000
    if (delta >= 86400) {
      h = Math.floor(delta / 86400)
      delta -= 86400 * h
      lstxt += h + 'd'
    }
    h = Math.floor(delta / 3600)
    delta -= 3600 * h
    if (h < 10) lstxt += '0'
    lstxt += h + 'h'
    h = Math.floor(delta / 60)
    delta -= 60 * h
    if (h < 10) lstxt += '0'
    lstxt += h + 'm'
    if (delta < 10) lstxt += '0'
    lstxt += Math.floor(delta) + 's'
    return lstxt
  }

  // Berechnet die CRC32 ueber einen Uint8Array-Buffer
  const POLY32 = 0xEDB88320

  function crc32Calc(buf) {
    let crcRun = 0xFFFFFFFF
    for (let idx = 0; idx < buf.length; idx++) {
      crcRun ^= buf[idx]
      crcRun >>>= 0 // Required to keep unsigned (known fact)
      for (let j = 0; j < 8; j++) {
        if (crcRun & 1) crcRun = (crcRun >>> 1) ^ POLY32
        else crcRun = crcRun >>> 1
      }
    }
    return crcRun >>> 0
  }

  function blxSetup() {
    // ------------- Check -----------
    // possible to start as file or download (for tests)
    if (location.protocol !== 'https:' && location.protocol !== 'file:' && location.protocol !== 'content:' && location.hostname !== 'localhost') {
      const sechost = 'https://' + location.hostname + location.pathname
      alert("BLX-API: HTTPS required. Jump to '" + sechost + "'")
      window.location.assign(sechost)
      return
    }

    if (navigator.bluetooth === undefined) {
      alert('BLX-API: Browser does not support Bluetooth!')
      return
    }
  }


  // Internal Data, blxIDs:
  // deviceMAC: String, wenn gueltig: exakt 16 Digts, sonst undefined
  // advertisingName: Advertising Name
  // .disk..
  //  .files..
  let blxIDs = {} // []
  let blxID_dirtyflag = false // Store on END if true

  let blxUserCB // user Callback  blxUserCB(message,value,xinfo)

  // BLE-CMDs - BLE JoWi's I/O -----
  const NUS_SERVICE_UUID = '5c170001-b5a3-f393-e0a9-a37f42997c22'
  const NUS_DATA_CHARA_WRITE = '5c170002-b5a3-f393-e0a9-a37f42997c22'
  const NUS_DATA_CHARA_READ_NOTI = '5c170003-b5a3-f393-e0a9-a37f42997c22' // fuer Notifications

  let NUS_device
  let NUS_data_chara_write
  let NUS_data_chara_read_noti
  let full_connected_flag = false // It true: ALL OK
  let identify_ok_flag = false // if false: Not identified

  let blx_pin_val = '' // Used PIN (can be String or Number )
  let blx_pin_ok = false
  let blx_challenge

  let blxModemTerm = false // wenn TRUE im Terminal Modus ohne Busy
  let blxCmdBusy = false // set to true by "End"
  let blxErrMsg = 0 // 0 or Text
  let blxCmdBusy_t0 // t0 of blxCmdBusy = true
  let blxCmdLast = '?' // Last Command (For Debug)
  let blxDataMem = {
    total: 0,
    incnew: 0,
    max: -1,
    mode: 0
  } // data.edt/bak
  let blxPutReady = false // Flag for blxSendBinblock and Msg '~P' "File Ready"/ '~I' "Memory Ready"
  let blxGlTimeout = 0 // Global Timeout
  const CONN_TRIES = 3 // Retries

  // --- LTX BLE PROTOCOL--
  const BB_BLE_CMD = 0x10 // Terminal Kommando
  const BB_BLE_BINBLK_IN = 0x11 // BinBlk am BLE ankommend
  // eslint-disable-next-line no-unused-vars
  // UNUSED const BB_BLE_PLING = 0x12 // Pling am BLE ankommend
  // eslint-disable-next-line no-unused-vars
  // UNUSED const BB_BLE_USERCMD = 0x13 // Usercommand

  const BB_BLE_INFO = 0x20 // Info-Block z.B. RSSI, wird nicht-blockierend geschickt
  const BB_BLE_REPLY_END = 0x21 // Ende einer Antwort
  const BB_BLE_BINBLK_OUT = 0x22 // BinBlk am BLE ausgehend
  const BB_BLE_REPLY_INTERM = 0x23 // Intermediate Part of Reply

  const DEV_TIMEOUT_MS = 10000 // Default Timeout to CMDs (>5000 because of EPA)

  // Local vars
  // Fuer File Upload GET
  let infile_name = 'unknown.dat' // Name der GET Datei
  let infile_file_len // Was 'N' sagt (die wahre max. Filelaenge)
  let infile_file_ctime // von N: creation time
  let infile_file_crc32 // aus v
  let infile_file_ucl_flag // aus v
  let infile_file_esync_flag // aus v
  let infile_file_pos0 // aus g
  let infile_exp_len // Erwartete laenge (was wirklich geholt wird, sollte gleich sein wi in IDs)
  let infile_bytebuf // Hierher die Bytes lesen, nach Export an Store: undefined

  let infile_read_len // gelesene laenge  (Ende: == exp_len)
  let infile_t0 // Date.now
  let infile_infot // Info-Time Update Info alle Sekunde max.

  let infile_laststore_name // Name of last File from 'get' or undefined

  const MAX_MTU_BLE_40 = 23 - 3 // initial blocklen max MTU BLE 4.0
  const MIN_MTU_REC = 40 // Recommende MINIMUM
  let max_ble_blocklen

  let last_rssi // Val: -199..-1 dbm, or 0, undefined if used
  let show_rssi = false // Show in Terminal

  let keep_conn = false // Keep Connection

  let con_fast_speed = '3' // String!, "F":Auto or "3"(fast).."30"(slow)
  let con_memfast_speed = '15' // Memory Download Speed (internal CPU Flash is Slow)
  let con_act_speed // Current Speed of Connection as reported by Device

  // Functions
  function onBlxDisconnected() {
    // NUS_device = undefined; - Keep Device data
    NUS_data_chara_write = undefined
    NUS_data_chara_read_noti = undefined
    full_connected_flag = false
    blxID_dirtyflag = false
    identify_ok_flag = false
    blx_pin_ok = false
    blx_challenge = undefined
    blxModemTerm = false
    if (blxCmdBusy === true && blxCmdLast !== 'R') { // Reset Command is OK
      terminalPrint("Disconnected while Busy('" + blxCmdLast + "')")
      blxErrMsg = "ERROR: Disconnected ('" + blxCmdLast + "')"
    } else {
      terminalPrint('Disconnected')
    }
    blxCmdBusy = false
    if (blxUserCB) {
      if (NUS_device !== undefined) blxUserCB('CON', 1, 'Reconnectable')
      else blxUserCB('CON', 0, 'Disconnected')
    }
  }

  function onBlxConnected() {
    terminalPrint('Connected') // Still Data pending
    full_connected_flag = true
    if (blxUserCB) blxUserCB('CON', 3, 'Connected, Identify...') // 2 Connected, waiting for IDs
  }

  function onBlxNUSData(event) {
    const data = new Uint8Array(event.target.value.buffer) // Array Buffer
    const dlenbuf = data.length
    if (dlenbuf < 2) {
      terminalPrint('ERROR(Data): NUS RX blocklen: ' + dlenbuf)
      console.log(data)
      return // ignore
    }
    const dlen = data[0]
    if (dlen + 2 !== dlenbuf) {
      terminalPrint('ERROR(Data): NUS RX blocklen/dlen(0): ' + dlenbuf + '/' + dlen)
      console.log(data)
      return // ignore
    }
    const dcmd = data[1]
    const datablock = data.subarray(2) // Content for Block "dcmd"[dlen]
    let txt_block
    let h, h2, h3

    switch (dcmd) {
      case BB_BLE_REPLY_INTERM: // Untermediate Part of Reply
        zirpsound()
        txt_block = new TextDecoder().decode(datablock) // opt.: TextDecoder('cp-152')

        // Abfangen, was geparst werden kann
        if (txt_block.charAt(0) === '~' && txt_block.length > 1) { // '~' Invisible (data[2]==126), followed by X:data
          switch (txt_block.charAt(1)) {
            case 'G': // Get: Expecting File
              h = parseInt(txt_block.substring(3)) // Len
              h2 = parseInt(txt_block.substring(txt_block.indexOf(' ')))
              if (h2) {
                terminalPrint('Get ' + h + ' Bytes from Position ' + h2) // Pos0
              } else {
                terminalPrint('Get ' + h + ' Bytes')
              }
              infile_exp_len = h
              infile_read_len = 0
              infile_bytebuf = new Uint8Array(h)
              infile_t0 = Date.now()
              infile_infot = infile_t0 - 1000 // Erste Info sofort
              break

            case 'A': // CR-Auth Challenge
              blx_challenge = txt_block.substring(3)
              //console.log("Challenge: " + blx_challenge)
              break

            case 'D':
              h = parseInt(txt_block.substring(txt_block.indexOf('DS:') + 3))
              h2 = parseInt(txt_block.substring(txt_block.indexOf('DA:') + 3))

              h3 = new Date(parseInt(txt_block.substring(txt_block.indexOf('DF:') + 3)) * 1000)

              terminalPrint('Disksize: ' + (h / 1024).toFixed(0) + ' kB / Available: ' + (h2 / 1024).toFixed(0) + ' kB Formated: [' +
                h3.toLocaleDateString() + ' ' + h3.toLocaleTimeString() + ']')
              blxIDs.disk = {} // []
              blxIDs.disk.diskSize = h // Sizes in Bytes
              blxIDs.disk.available = h2
              blxIDs.disk.formated = h3 // Date
              blxIDs.disk.files = []
              blxID_dirtyflag = true
              break

            case '"': {
              h = txt_block.lastIndexOf('"')
              const fname = txt_block.substring(2, h) // P P
              const fdata = txt_block.substring(h) // The Rest
              h = parseInt(fdata.substring(fdata.indexOf('L:') + 2)) // LEN
              h2 = parseInt(fdata.substring(fdata.indexOf('CR:') + 3), 16) // CRC (only if available) as HEX
              h3 = new Date(parseInt(fdata.substring(fdata.indexOf('T:') + 2)) * 1000)
              const ucl_flag = fdata.indexOf('UC ')
              const esync_flag = fdata.indexOf('ES ')
              let fxtra = ''
              if (ucl_flag > 0) fxtra = ' (Unclosed)'
              if (!isNaN(h2)) fxtra += ' CRC: ' + h2.toString(16).toUpperCase()
              if (esync_flag > 0) fxtra += ' ExtSync'
              terminalPrint(' - "' + fname + '" Len: ' + h + ' Bytes' + fxtra + ' [' + h3.toLocaleDateString() + ' ' + h3.toLocaleTimeString() + ']')
              const fileEntry = []
              fileEntry.fname = fname
              fileEntry.len = h
              fileEntry.crc32 = h2
              fileEntry.date = h3
              fileEntry.ucl_flag = Boolean(ucl_flag > 0)
              fileEntry.esync_flag = Boolean(esync_flag > 0)
              blxIDs.disk.files.push(fileEntry)
              blxID_dirtyflag = true
            }
              break

            case 'X':
              if (keep_conn) {
                terminalPrint('Keep Connection Ping...')
                blxDeviceCmd('')
              } else {
                terminalPrint('WARNING: Connection Auto-Disconnect soon')
                if (blxUserCB) blxUserCB('WARN', 1, 'Connection Auto-Disconnect soon') // Warning 1
              }
              break

            // Messwerte
            case 'e': {
              // kan msec (Opt: Modem-State)
              h = parseInt(txt_block.substring(3))
              const hstr = txt_block.substring(txt_block.indexOf(' ') + 1)
              h2 = parseInt(hstr)
              if (h > 0 && h2 > 0) {
                if (hstr.indexOf(' ') > 0) {
                  h3 = parseInt(hstr.substring(hstr.indexOf(' ') + 1))
                  terminalPrint('Measure (' + h + ' Channels in ' + h2 + ' msec) Modemstate: ' + h3)
                } else {
                  terminalPrint('Measure (' + h + ' Channels in ' + h2 + ' msec)')
                }
              } else {
                terminalPrint('Measure...')
              }
              if (blxUserCB) {
                blxUserCB('MEAS_CH', h, 'Channels')
                blxUserCB('MEAS_T', h2, 'msec')
              }

            }
              break
            case 'H': // HKs - Hc:TXT VALUE, chan >=90
            case '#': // Channel - #CHAN: VALUE
              {
                const chan = parseInt(txt_block.substring(2))
                const h = txt_block.substring(txt_block.indexOf(' ') + 1).trim()
                if (isNaN(chan)) { // H + Text: Info, meist Warnung erstmal
                  terminalPrint('Warning: ' + h)
                  if (blxUserCB) blxUserCB('MEAS_V', "Warning", h)
                } else {
                  var txtchan = chan
                  if (chan >= 90) txtchan = 'H' + chan
                  terminalPrint('(' + txtchan + ')' + h)
                  if (blxUserCB) blxUserCB('MEAS_V', txtchan, h)
                }
              }
              break
            case 'h':
              h = parseInt(txt_block.substring(3))
              terminalPrint('Alarmbits: ' + h)
              // if(blxUserCB)  *todo*
              break
            case '@': // Timeout for (Modem-)CMDs
              h = parseInt(txt_block.substring(2))
              blxGlTimeout = h // Overwrite
              terminalPrint('Wait max. ' + (h / 1000).toFixed(0) + ' secs')
              // if(blxUserCB)  *todo*
              break
            case '!': // Message
              h = txt_block.substring(2)
              terminalPrint('Info: ' + h)
              if (blxUserCB) blxUserCB('INFO', 0, h)
              break

            case 'M': // Move (Accelerometer detetced Move)
              {
                h = parseInt(txt_block.substring(2))
                const hstr = txt_block.substring(txt_block.indexOf(' ') + 1)
                h2 = parseInt(hstr)
                terminalPrint('Motion(' + h + ' Cnt), Measure in ' + h2 + ' secs')
                movesound()
                // if(blxUserCB)  *todo*
              }
              break
            case 'Z': // Buzy Reason [param]
              {
                h = parseInt(txt_block.substring(2))
                h3 = txt_block.indexOf(' ')
                h2 = 0
                if (h3 > 0) {
                  const hstr = txt_block.substring(h3 + 1)
                  h2 = parseInt(hstr)
                }
                switch (h) {
                  case 1:
                    if (h2 > 2) terminalPrint("Info: Measure (max. " + h2 + " sec)")
                    else terminalPrint("Info: Measure")
                    break;
                  case 9:
                    terminalPrint("Info: Internet in " + h2 + " sec")
                    break;
                  case 10:
                    terminalPrint("Info: Internet Transfer...")
                    break;
                  case 11:
                    if (h2) terminalPrint("Info: Internet Transfer Error:" + h2)
                    else terminalPrint("Info: Internet Transfer OK")
                    break;
                  // Unknown Z-Codes ignored
                }
                if (blxUserCB) blxUserCB('BZY', h, h2) // BuzyCode
              }
              break


            default: // Kein Fehler melden, koennte Erweiterung sein
              terminalPrint("ERROR: '" + txt_block + "' ???")
          }
        } else {
          const h = txt_block.trim()
          if (blxUserCB) blxUserCB('MSG', 0, h) // MSG Type 0
          if (blxCmdBusy) terminalPrint("Reply: '" + h + "'")
          else if (blxModemTerm) terminalPrint("Modem: '" + h + "'")
          else terminalPrint("Info: '" + h + "'")
        }
        break

      case BB_BLE_REPLY_END: // Text Out - Reply to requested Block
        zirpsound()
        txt_block = new TextDecoder().decode(datablock)
        // Abfangen, was geparst werden kann
        if (txt_block.charAt(0) === '~' && txt_block.length > 1) { // '~' Invisible (data[2]==126), followed by X:data
          switch (txt_block.charAt(1)) {
            case 'B': // BLE Blocksize wird interpretiert
              blxID_dirtyflag = true
              blxIDs.deviceMAC = '(UNKNOWN)'
              h3 = txt_block.indexOf(' ')
              if (h3 > 0) {
                h2 = txt_block.substring(h3 + 1)
                if (h2.length === 16) {
                  terminalPrint('Device MAC:' + h2)
                  blxIDs.deviceMAC = h2 // merken
                } else {
                  blxErrMsg = 'ERROR: Invalid MAC'
                }
              } else {
                blxErrMsg = 'ERROR: No MAC'
              }
              h = parseInt(txt_block.substring(3))
              if (h >= MAX_MTU_BLE_40 && h < 250) {
                max_ble_blocklen = h
                terminalPrint('BLE Blocksize: ' + max_ble_blocklen + ' Bytes')
                if (h < MIN_MTU_REC) {
                  terminalPrint('WARNING: Small BLE Blocksize!')
                  if (blxUserCB) blxUserCB('WARN', 2, 'Small BLE Blocksize!') // Warning 2
                }
              } else {
                blxErrMsg = 'ERROR: BLE Blocksize: ' + h
              }
              break

            case 'C': // Connection Speed (~C:speed errcode)
              h = parseInt(txt_block.substring(3))
              con_act_speed = h
              h3 = txt_block.indexOf(' ')
              if (h3 > 0) {
                h2 = parseInt(txt_block.substring(h3 + 1))
                if (h2 > 1) { // 1: OK for Check only
                  blxErrMsg = 'ERROR: Connection Speed: (' + h + '): ' + h2
                } else {
                  terminalPrint('Connection Speed: ' + ((h > 50) ? 'Standard (' : 'Fast (') + h + ')')
                }
              } else {
                blxErrMsg = 'ERROR: Connection Speed'
              }
              break

            case 'T': // Time and Runtime
              {
                h = parseInt(txt_block.substring(3))
                const d = new Date(h * 1000)
                let tdelta = (((Date.now()) / 1000) - h).toFixed(0)
                let tdinfo
                const hstr = txt_block.substring(txt_block.indexOf(' ') + 1)
                h2 = parseInt(hstr)
                if (tdelta > 864000 || tdelta < -864000) {
                  tdinfo = ' (Warning: DeviceTime Lost!)'
                } else {
                  if (tdelta <= 1 && tdelta >= -1) tdelta = 0 // Cosmetics
                  tdinfo = ' (Delta to App: ' + tdelta + ' sec)'
                }
                if (h2) tdinfo += '(Run: ' + (h2 / 86400).toFixed(1) + ' d)'
                blxIDs.deltaToApp = tdelta
                terminalPrint('Time: [' + d.toLocaleDateString() + ' ' + d.toLocaleTimeString() + '] ' + tdinfo)
              }
              break

            case 'V': // ~V:DEVICE_TYP DEVICE_FW_VERSION Bootloader_Cookie CPU Inet
              {
                const harr = txt_block.split(' ');
                h = parseInt(txt_block.substring(3))
                h2 = parseInt(harr[1])
                h3 = new Date(parseInt(harr[2]) * 1000)

                blxIDs.deviceType = h
                blxIDs.firmwareVersion = (h2 / 10).toFixed(1)
                blxIDs.firmwareBuilt = h3.toUTCString()

                blxIDs.cpu = -1 // Unknown
                if (harr.length > 3) blxIDs.cpu = parseInt(harr[3])
                blxIDs.deviceHasInternet = 0;
                if (harr.length > 4) blxIDs.deviceHasInternet = parseInt(harr[4])
                terminalPrint('DeviceType: ' + h + ' V' + blxIDs.firmwareVersion + ' (Built: ' + blxIDs.firmwareBuilt + ') CPU:' + blxIDs.cpu)
                if (blxIDs.deviceHasInternet) terminalPrint('Device has Internet');
                blx_pin_ok = true
              }
              break

            case 'E': // Pin ERROR! Alternativantwort auf /
              blx_pin_ok = false // eh false, nur fuer Tests nochmal
              blxErrMsg = 'PIN ERROR'
              terminalPrint('ERROR: PIN ERROR')
              errorsound()
              break

            case 'N': // File-NAME, LEN, CTIME
              h = parseInt(txt_block.substring(3))
              h2 = new Date(parseInt(txt_block.substring(txt_block.indexOf(' ') + 1)) * 1000)
              terminalPrint('Filesize: ' + h + ' Bytes')
              infile_file_len = h
              infile_file_ctime = h2
              break

            case 'L': // Received
              h = parseInt(txt_block.substring(3))
              terminalPrint(h + ' Bytes transferred')
              break

            case 'P': // File Ready for PUT
              terminalPrint('File Ready')
              blxPutReady = true;
              break

            case 'I': // Memory Ready
              terminalPrint('Memory Ready')
              blxPutReady = true;
              break

            case 'K': // Cleared
              // terminalPrint('Memory cleared') // zuviel Blabla...
              break

            default: // Kein Fehler melden, koennte Erweiterung sein
              terminalPrint("ERROR: '" + txt_block + "' ???")
              blxErrMsg = txt_block;
          }
        } else {
          // if(blxUserCB)  *todo*
          terminalPrint("End: '" + txt_block + "' (Runtime: " + (Date.now() - blxCmdBusy_t0).toFixed(0) + ' msec)')
          if (txt_block.startsWith('ERR')) blxErrMsg = txt_block;
        }
        blxCmdBusy = false // Ready for new commands
        blxModemTerm = false // END ends modem
        break

      case BB_BLE_INFO: // Unsolicited CMDs (Radio signal strength, MSGs, ..)
        txt_block = new TextDecoder().decode(datablock)
        switch (txt_block.charAt(0)) {
          case 'R': // R: RSSI
            h = parseInt(txt_block.substring(2))
            if (h < -199 && h >= 0) {
              last_rssi = '[NoSignal]'
              h = -200
            } else last_rssi = h
            if (show_rssi) terminalPrint('Signal (dBm):' + last_rssi)
            if (audio_rssi) rssi_ping(-h)
            if (blxUserCB) blxUserCB('RSSI', h, ' dBm')
            break
          case 'V': // e.g. VA:0 0 1000 (A: Acceleration X,Y,Z).
            h = txt_block.substring(3)
            if (blxUserCB) blxUserCB('VSENS', h, txt_block.charAt(1))
            break;
          default:
            terminalPrint("Info: '" + txt_block + "'")
        }
        break

      case BB_BLE_BINBLK_OUT: // BinaryData ankommend
        // terminalPrint("BIN-Data: '"+datablock.length+"' Bytes");
        {
          h = infile_exp_len - infile_read_len
          if (datablock.length > h) {
            blxErrMsg = 'ERROR: Too many data'
            break
          }

          // terminalPrint("Pos: "+infile_read_len+" Len: "+datablock.length+" Fehlt:"+h);
          // Aufgabe datablock[] an infile_bytebuf[infile_read_len] kopieren
          infile_bytebuf.set(datablock, infile_read_len)
          infile_read_len += dlen

          const tw_new = Date.now()
          if (tw_new - infile_infot > 1000) { // Alle Sekunde Fortschritt
            h = ((infile_read_len / infile_exp_len) * 100).toFixed(0)
            if (blxUserCB) blxUserCB('PROG', h, '%') // % of Total
            terminalPrint('Get: ' + h + '% / ' + infile_read_len + ' Bytes')
            infile_infot = tw_new
          }

          h = infile_exp_len - infile_read_len
          if (h === 0) { // Alles gelesen
            let dtime = Date.now() - infile_t0
            if (!dtime) dtime++
            const speed = ((infile_read_len / dtime * 1000).toFixed(0))
            terminalPrint('Get OK (' + dtime / 1000 + ' sec, ' + speed + ' Bytes/sec)')
            if (blxUserCB) blxUserCB('GET_OK', speed, 'Bytes/sec')
          }
        }
        break

      default:
        terminalPrint("ERROR(Data): '" + txt_block + "'")
    }
  }

  // Connetiert NUS_device mode 1: Full-, 0: Re-connect,
  // *** *todo* Nicht besonder schoen programmiert, gibt manchmal noch DOM exeptions...
  async function blxConnectNus(mode, read_id, anz_tries = CONN_TRIES) {
    if (NUS_device === undefined) {
      blxErrMsg = 'ERROR(Connect): Undefined Device'
      return
    }
    if (NUS_device.name === null) {
      blxErrMsg = 'ERROR(Connect): Unknown Device Name'
      return
    }

    if (mode) {
      blxIDs = {} // []
      blxIDs.advertisingName = NUS_device.name
      blxID_dirtyflag = true
    }

    if (blxUserCB) blxUserCB('CON', 2, 'Connecting...') // 2 Connected, waiting for IDs
    let cnt_tries = 0
    for (; ;) {
      //---------for------
      try {
        if (mode) {
          terminalPrint("Connect to '" + NUS_device.name + "'...")
        } else {
          terminalPrint("Reconnect to '" + NUS_device.name + "'...")
        }
        cnt_tries++

        //terminalPrint("GID **1**") // Fehler beim Connecten V0.78
        const server = await NUS_device.gatt.connect()
        //terminalPrint("GID **2**")
        const nus_service = await server.getPrimaryService(NUS_SERVICE_UUID)
        //terminalPrint("GID **3**")
        NUS_data_chara_write = await nus_service.getCharacteristic(NUS_DATA_CHARA_WRITE)
        //terminalPrint("GID **4**")
        NUS_data_chara_read_noti = await nus_service.getCharacteristic(NUS_DATA_CHARA_READ_NOTI)
        //terminalPrint("GID **5**")
        await NUS_data_chara_read_noti.startNotifications()
        //terminalPrint("GID **6**")
        NUS_data_chara_read_noti.addEventListener('characteristicvaluechanged', onBlxNUSData)
        //terminalPrint("GID **7**")
        onBlxConnected()
        //terminalPrint("GID **8**")
        cnt_tries = anz_tries
        blxErrMsg = 0
      } catch (error) {
        terminalPrint("RETRY(Connect(" + cnt_tries + "), Reason: '" + error.message.substring(0, 40) + "...')");
        blxErrMsg = "ERROR(Connect(" + cnt_tries + ")): '" + error.message + "'"
      }
      if (cnt_tries >= anz_tries) break

      const msg = 'Failed, Retry to connect (' + (anz_tries - cnt_tries + 1) + ' left)...'
      if (blxUserCB) blxUserCB('WARN', 5, msg) // Warning 5
      terminalPrint(msg)
      //---------for------
    }
    if (full_connected_flag) {
      //terminalPrint("GID **9**")
      if (read_id /* true or 1 */) {
        //terminalPrint("GID **10**")
        await blxDeviceIdentify(false) // Set Lowspeed later
      }
      //terminalPrint("GID **11**")
      await blxConnectionSlow();
      //terminalPrint("GID **12**")
      if (blx_pin_ok === true) chordsound(500) // OK
    }
  }

  // BLE Selector Box
  async function blxSelect() {
    terminalPrint('Connect: Discover Devices')
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{
          services: [NUS_SERVICE_UUID]
        }]
      })
      NUS_device = device
      NUS_device.addEventListener('gattserverdisconnected', onBlxDisconnected)
    } catch (error) {
      blxErrMsg = 'ERROR(Discover): ' + error
    }
  }

  async function bleSendData(data, tcmd = BB_BLE_CMD) {
    const blen = data.length
    const bdata = new Uint8Array(blen + 2)
    const datablock = bdata.subarray(2) // Content for Block "dcmd"[dlen]
    bdata[0] = blen
    bdata[1] = tcmd // meistens BB_BLE_CMD; - Text CMD
    // eslint-disable-next-line no-unused-vars
    const dummy = new TextEncoder().encodeInto(data, datablock) // Into
    if (dummy === undefined) return // Just or the uglifier
    try {
      NUS_data_chara_write.writeValue(bdata.buffer)
    } catch (err) {
      let errl
      if (full_connected_flag === false) errl = 'Connection lost'
      else errl = err
      blxErrMsg = 'ERROR(DeviceSend): ' + errl
    }
  }

  // =====Commands=====
  async function wait_blx(timeout_ms) {
    blxGlTimeout = timeout_ms
    for (; ;) { // Poll reply in 10 ms steps
      if (blxCmdBusy !== true) break
      await sleepMs(10)
      blxGlTimeout -= 10
      if (blxGlTimeout < 0) {
        blxErrMsg = "ERROR(DeviceCmd): Timeout ('" + blxCmdLast + "')"
        break
      }
    }
  }

  async function blxCheckIDs() {
    if (blxID_dirtyflag) { // Optionally save new Data to Store
      blxID_dirtyflag = false
      const storeKey = blxIDs.deviceMAC + '_#BlxIDs'
      try {
        await blStore.set(storeKey, blxIDs)
      } catch (err) {
        blxErrMsg = 'ERROR(CheckIDs): ' + err
      }
    }
  }

  // -----Device Commands: Single commands with reply directly from the device------
  // Each Transfer starts with blxDeviceCmd: check connection here
  async function blxDeviceCmd(cmd, timeout_ms = DEV_TIMEOUT_MS) { // case dep.
    if (blxCmdBusy === true) {
      console.warn('*** BLX BUSY (Since ' + (Date.now() - blxCmdBusy_t0).toFixed(0) + ' msec) ***')
      return
    }

    if (full_connected_flag !== true) {
      if (NUS_device === undefined) {
        blxErrMsg = 'ERROR(DeviceCmd): Not Connected!'
        return
      } else {
        await blxConnectNus(0, 1) // Reconnect with SCAN
        if (blxErrMsg) return
      }
    }

    if (cmd.startsWith('#')) blxModemTerm = true // Start Modem-Mode
    if (blxModemTerm === false) blxCmdBusy = true
    blxCmdLast = cmd
    blxCmdBusy_t0 = Date.now()
    await bleSendData(cmd)
    if (blxModemTerm === false) {
      await wait_blx(timeout_ms)
      blxCmdBusy = false
    }
  }

  // get index for file in (global) blxIDs
  function findFileInDir(fname) {
    let fidx = -1
    for (let i = 0; i < blxIDs.disk.files.length; i++) {
      if (blxIDs.disk.files[i].fname === fname) {
        fidx = i
        break
      }
    }
    if (fidx < 0) {
      blxErrMsg = 'ERROR(Cmd): File not in Directory' // run 'v'
      return -1
    }
    return fidx
  }

  // getfile(cmd_array)
  async function getfile(cmd_array, autospeed = true) {
    let fname

    fname = cmd_array[1]
    if (fname === undefined || fname.length < 1 || fname.length > 21) {
      blxErrMsg = 'ERROR(Cmd): Filename'
      return
    }

    if (blxIDs.disk === undefined || blxIDs.disk.files === undefined) {
      blxErrMsg = 'ERROR(Cmd): No Disk Info'
      return
    }

    let fidx = findFileInDir(fname)
    if (fidx < 0) return

    infile_file_len = -1 // Nix
    infile_name = fname
    infile_laststore_name = undefined

    await blxDeviceCmd('N:' + fname)
    if (blxErrMsg) return // Error or no reply

    if (infile_file_len < 0) {
      blxErrMsg = 'ERROR(SysCmd): No File'
      return // Error oder nix zu holen
    }

    terminalPrint('Get File "' + fname + '": Total Len: ' + infile_file_len + ' Bytes')

    if (infile_file_len !== blxIDs.disk.files[fidx].len) {
      blxErrMsg = 'ERROR(SysCmd): File Size changed'
      return // Error oder nix zu holen
    }
    if (blxIDs.disk.files[fidx].date.getTime() !== infile_file_ctime.getTime()) {
      blxErrMsg = 'ERROR(SysCmd): File Date changed'
      return // Error oder nix zu holen
    }
    // Get missing infos from v
    infile_file_crc32 = blxIDs.disk.files[fidx].crc32
    infile_file_ucl_flag = blxIDs.disk.files[fidx].ucl_flag
    infile_file_esync_flag = blxIDs.disk.files[fidx].esync_flag

    let fglen = infile_file_len
    let pos0 = 0
    if (cmd_array[2]) { // Pos 0
      pos0 = parseInt(cmd_array[2])
      if (cmd_array[3]) {
        fglen = parseInt(cmd_array[3])
      } else {
        fglen = infile_file_len - pos0
      }
    }
    if (pos0 < 0 || fglen < 1 || pos0 + fglen > infile_file_len) {
      blxErrMsg = 'ERROR(SysCmd): Out of range of File'
      return
    }

    infile_file_pos0 = pos0

    if (blxUserCB) blxUserCB('GET', fglen, fname)
    await blxGetfile(pos0, fglen, autospeed)

    if (!blxErrMsg) blxInfileStore() // SAVE to Store if OK
  }

  async function getSubFile(vfname, pos0, fglen) {
    infile_file_len = -1 // Nix
    infile_name = undefined
    infile_laststore_name = undefined

    await blxDeviceCmd('N:' + vfname) // as reply: infile_file_len
    if (blxErrMsg) return
    if (infile_file_len < 0) {
      blxErrMsg = "ERROR(SysCmd): No File '" + vfname + "'"
      return // Error oder nix zu holen
    }
    // Set missing infos as guess and get (partly) file
    infile_file_crc32 = 0
    infile_file_ucl_flag = true
    infile_file_esync_flag = false
    infile_file_pos0 = pos0
    infile_file_len = fglen
    await blxGetfile(pos0, fglen, false)
  }

  // Update existing or not exiisting file   data.edt or data.edt.old
  async function updateFile(fname, fullflag) {
    let data_idx
    let KeyVal
    let missing
    let hbuf
    // Get data.edt ALLES oder TEIL
    data_idx = findFileInDir(fname)
    if (data_idx >= 0) {
      //console.log("Upload 'data.edt'")
      await blStore.get(blxIDs.deviceMAC + '_' + fname)
      KeyVal = blStore.result() // undefined opt.
      if (KeyVal === undefined || fullflag === true) { // Nix da oder explizit: ALLES holen
        await getfile([0, fname], false)
        if (blxErrMsg) return
      } else {
        missing = blxIDs.disk.files[data_idx].len - KeyVal.v.akt_len
        if (missing > 0) {
          // console.log("Gibt es tw. schon: " +  KeyVal.v.akt_len + " Fehlt: " + missing)
          if (blxUserCB) blxUserCB('GET', missing, fname)

          terminalPrint('Get File (Missing Part) "' + fname + '": Len: ' + missing + ' Bytes')
          await getSubFile(fname, KeyVal.v.akt_len, missing) // File, Pos, Ende
          if (blxErrMsg) return
          if (infile_bytebuf.length !== missing) {
            blxErrMsg = 'ERROR(upload): Read Len'
            return
          }
          // console.log("OK" , infile_bytebuf, infile_file_len, infile_bytebuf.length)
          hbuf = new Uint8Array(KeyVal.v.bytebuf.length + missing)
          hbuf.set(KeyVal.v.bytebuf)
          hbuf.set(infile_bytebuf, KeyVal.v.bytebuf.length)
          KeyVal.v.bytebuf = hbuf
          KeyVal.v.total_len += missing
          KeyVal.v.akt_len += missing
          // Write Back to Store
          //console.log("NewL: ", KeyVal.v.bytebuf.length)
          try {
            await blStore.set(KeyVal.k, KeyVal.v)
          } catch (err) {
            blxErrMsg = 'ERROR(upload): ' + err
          }
        }
      }
    } else blxErrMsg = '' // set by findFileInDir
  }

  // Set Connection to Slow - Kann sein, dass da Spezial-Timeout noetig ist
  async function blxConnectionSlow() {
    //console.log("Set SLOW ")
    for (let i = 0; i < 3; i++) {
      await sleepMs(1000)
      con_act_speed = -1;
      if (NUS_data_chara_write === undefined) blxErrMsg = "Disconnected"
      else await blxDeviceCmd('CS', 32000)
      if (blxErrMsg) break
      if (con_act_speed > 0) break
    }
    //console.log("SLOW OK:" + con_act_speed)
    //if (blxErrMsg) console.log("Slow ERR:"+blxErrMsg)
  }

  // Try fastest speed with 3 * Autospeed - Kann sein, dass da Spezial-Timeout noetig ist
  async function blxConnectionFast() {
    for (let i = 0; i < 4; i++) {
      //console.log("Set FAST:" + con_fast_speed)
      await sleepMs(1000)
      con_act_speed = -1;
      await blxDeviceCmd('C' + con_fast_speed, 32000) // Anscheinend Timeout ca. 30 sec
      //console.log("FAST OK:" + con_act_speed)
      if (blxErrMsg) break;
      if (con_act_speed <= 50) break;
      let ns = parseInt(con_fast_speed)
      if (isNaN(ns)) break
      if (i > 0) con_fast_speed = (++ns).toString() // retry slower
    }
    //if (blxErrMsg) console.log("Fast ERR:"+blxErrMsg)
  }

  // --- upload - sync data.edt / data.edt.old
  async function upload(cmd_array, fastspeed = true) {
    let fullflag = false

    if (cmd_array.length > 1) {
      fullflag = Boolean(parseInt(cmd_array[1]))
    }

    if (fastspeed) {
      await blxConnectionFast()
      if (blxErrMsg) return
    }

    for (; ;) { // Unlock Device (locked in FAST mode)
      await blxDeviceCmd('v', 5000) // Get virtual Disk Dir
      if (blxErrMsg) break

      if (fullflag === true) { // After 1.st true BLE cmd bec. of deviceMAC
        await blStore.remove(blxIDs.deviceMAC + '_data.edt')
        await blStore.remove(blxIDs.deviceMAC + '_data.edt.old')
      }

      await calcMem(true) // With adjust
      if (blxErrMsg) break

      terminalPrint('Available Data (Bytes): Total: ' + blxDataMem.total + ', New: ' + blxDataMem.incnew)

      if (blxUserCB) {
        if (fullflag) blxUserCB('UPLOAD', blxDataMem.total, 'FULL')
        else blxUserCB('UPLOAD', blxDataMem.incnew, 'INC')
      }

      await updateFile('data.edt', fullflag)
      if (blxErrMsg) break

      await updateFile('data.edt.old', fullflag)
      //if(blxErrMsg) break // not needed

      break
    } // for

    if (fastspeed) { // With NO data, direct CF->CS might raise GATT ERROR
      await blxConnectionSlow()
    }
  }

  // Sync a file (blxIDs against Store). Only for CLOSED Files with len >0
  // Store a _'#BAK_fname copy in Store
  async function syncDeviceFile(fname, autospeed = true) {
    const fidx = findFileInDir(fname)
    await blStore.get(blxIDs.deviceMAC + '_' + fname)
    const KeyVal = blStore.result()
    if (fidx < 0) { // file not in current dir
      if (KeyVal !== undefined) { // but maybe as old version in Store?
        await blStore.remove(KeyVal.k)
      }
      blxErrMsg = "ERROR(identify): No File '" + fname + "' on Device"
      if (blxUserCB) blxUserCB('WARN', 3, "No File '" + fname + "' on Device") // Warning 3
      return
    }

    if (blxIDs.disk.files[fidx].len <= 0 || blxIDs.disk.files[fidx].ucl_flag === true) {
      blxErrMsg = "ERROR(identify): File corrupt '" + fname + "' on Device"
      if (blxUserCB) blxUserCB('WARN', 4, "File corrupt '" + fname + "' on Device") // Warning 4
      return
    }

    if (KeyVal !== undefined) {
      // check if uptodate
      if (blxIDs.disk.files[fidx].len === KeyVal.v.akt_len && // includes pos0-test
        blxIDs.disk.files[fidx].crc32 === KeyVal.v.crc32 &&
        blxIDs.disk.files[fidx].date.getTime() === KeyVal.v.ctime.getTime()) {
        return // Nothing to do, Up To Date
      }
    }
    // requires update
    await getfile([0, fname], autospeed)

    // If everything is 100% OK, Store Backup Copy
    if (!blxErrMsg) {
      await blStore.get(blxIDs.deviceMAC + '_' + fname)
      const KeyValBak = blStore.result()
      if (KeyValBak !== undefined) {
        if (blxIDs.disk.files[fidx].len === KeyValBak.v.akt_len && // includes pos0-test
          blxIDs.disk.files[fidx].crc32 === KeyValBak.v.crc32 &&
          blxIDs.disk.files[fidx].date.getTime() === KeyValBak.v.ctime.getTime()) {

          await blStore.set(blxIDs.deviceMAC + '_#BAK_' + fname, KeyValBak.v)
        }
      }
    }
  }

  // ----- calcMem(): Berechnet die mgl. neuen Daten (ben. vorher v)
  async function calcMem(saveflag = false) {

    blxDataMem = {
      total: 0,
      incnew: 0,
      max: -1,
      mode: -1
    }

    let v_data_idx = findFileInDir('data.edt') // might set blxErrMsg
    let v_data_old_idx = findFileInDir('data.edt.old') // might set blxErrMsg
    await blStore.get(blxIDs.deviceMAC + '_data.edt.old')
    let KeyVal_data_old = blStore.result() // undefined opt.
    await blStore.get(blxIDs.deviceMAC + '_data.edt')
    let KeyVal_data = blStore.result() // undefined opt.

    if (blxIDs.iparam !== undefined) { // Par. [12] iparam.flags 0: Record OFF, Bit 1:Measure, Bit 2: Ring
      blxDataMem.mode = parseInt(blxIDs.iparam[12]) // flags is at [12]
      if (blxDataMem.mode & 2) { // Ring Mode
        if (blxIDs.sys_param != undefined) {
          blxDataMem.max = parseInt(blxIDs.sys_param[17]) * 2 // maxmem is at [17]
        }
      } else { // Linear Mode
        blxDataMem.max = blxIDs.disk.diskSize - 102400 // 25 Sect. for System
      }
    }

    // Wenn v.data.edt.old == DB.data.edt dann shiften
    if (v_data_old_idx >= 0) { // Auf Device gibt es data.edt.old
      if (KeyVal_data != undefined) { // und im Store data.edt
        if (blxIDs.disk.files[v_data_old_idx].date.getTime() === KeyVal_data.v.ctime.getTime()) {
          // Zeiten sind gleich, also shiften, mgl. fehlt ein Teil von old, neu in jedem Fall dann ganz
          KeyVal_data_old = KeyVal_data
          KeyVal_data_old.k = blxIDs.deviceMAC + '_data.edt.old'
          KeyVal_data = undefined
          console.log("Shift 'data.edt'->'data.edt.old'")
          if (saveflag === true) { // Merken der geshifteten Werte in DB
            try {
              await blStore.remove(blxIDs.deviceMAC + '_data.edt')
              await blStore.set(KeyVal_data_old.k, KeyVal_data_old.v)
            } catch (err) {
              blxErrMsg = 'ERROR(Store): ' + err
              return
            }
          }
        }
      }
    }

    // Es gibt eine OLD im DB, aber keine oder keine passende OLD im V
    if ((KeyVal_data_old != undefined) && ((v_data_old_idx < 0) || (blxIDs.disk.files[v_data_old_idx].date.getTime() !== KeyVal_data_old.v.ctime.getTime()))) {
      v_data_old_idx = -1
      KeyVal_data_old = undefined
      if (saveflag === true) {
        try {
          await blStore.remove(blxIDs.deviceMAC + '_data.edt.old')
        } catch (err) {
          blxErrMsg = 'ERROR(Store): ' + err
          return
        }
      }
    }
    // Dto fuer neu
    if ((KeyVal_data != undefined) && ((v_data_idx < 0) || (blxIDs.disk.files[v_data_idx].date.getTime() !== KeyVal_data.v.ctime.getTime()))) {
      KeyVal_data = undefined
      if (saveflag === true) {
        try {
          await blStore.remove(blxIDs.deviceMAC + '_data.edt')
        } catch (err) {
          blxErrMsg = 'ERROR(Store): ' + err
          return
        }
      }
    }

    if (v_data_idx >= 0) {
      blxDataMem.total += blxIDs.disk.files[v_data_idx].len
    }
    if (v_data_old_idx >= 0) {
      blxDataMem.total += blxIDs.disk.files[v_data_old_idx].len
    }
    blxDataMem.incnew = blxDataMem.total
    // Nun noch testen was vorhanden ist
    if (KeyVal_data != undefined) {
      blxDataMem.incnew -= KeyVal_data.v.akt_len
    }
    if (KeyVal_data_old != undefined) {
      blxDataMem.incnew -= KeyVal_data_old.v.akt_len
    }

    blxErrMsg = 0
  }

  // xtract MAC to MAC_x.edt at least data.edt must be present
  async function xtract(xmac) {
    await blStore.get(xmac + '_data.edt')
    let KeyVal_data = blStore.result()
    if (KeyVal_data == undefined) {
      blxErrMsg = 'ERROR(xtract): No Data';
      return
    }
    // Optionaly add old data befor new
    await blStore.get(xmac + '_data.edt.old')
    const KeyVal_data_old = blStore.result()
    if (KeyVal_data_old !== undefined) {
      let hbuf = new Uint8Array(KeyVal_data.v.bytebuf.length + KeyVal_data_old.v.bytebuf.length)
      hbuf.set(KeyVal_data_old.v.bytebuf)
      hbuf.set(KeyVal_data.v.bytebuf, KeyVal_data_old.v.bytebuf.length)
      KeyVal_data.v.bytebuf = hbuf
      KeyVal_data.v.total_len = hbuf.length
      KeyVal_data.v.akt_len = hbuf.length
    }
    KeyVal_data.v.crc32 = 0
    KeyVal_data.v.ctime = new Date()

    try {
      await blStore.set(xmac + '_xtract.edt', KeyVal_data.v)
    } catch (err) {
      blxErrMsg = 'ERROR(xtract): ' + err
      return
    }

  }

  // Challenge-Response Authentifizierung LTX via WebCrypto. Leider kein AES-128-ECB, daher Umweg via AES-128-CBC/IV=000
  // Device Pin als Zahl, challence als 8-Zeichen UPPER Hex-String, Result als Hex-String
  async function ChallengeResponseCalc(devicePin, challengeString) {
    let pinstr = devicePin.toString(16).toUpperCase().padStart(8, '0')
    // console.log("Pin: '"+pinstr+"'")
    // console.log("Challenge: '"+challengeString+"'")
    const rawkey = new Uint8Array(16)
    new TextEncoder().encodeInto(pinstr, rawkey)
    const challenge = new Uint8Array(16)
    new TextEncoder().encodeInto(challengeString, challenge)
    const keyobj = await window.crypto.subtle.importKey("raw", rawkey, {
      name: "AES-CBC",
      length: 128
    }, false, ["encrypt", "decrypt"])
    const iv0 = new Uint8Array(16); // IV-0 OK for CR-Auth
    const cresult = await crypto.subtle.encrypt({
      name: "AES-CBC",
      iv: iv0
    }, keyobj, challenge).then(function (encrypted) {
      let uint8bytes = new Uint8Array(encrypted) // Dataview regards sign!
      let dataview = new DataView(uint8bytes.buffer)
      let exp_res = dataview.getUint32(0) // second parameter absent or falsey == want big endian
      return exp_res
    })
    // console.log("Exp_res:"+cresult.toString(16))
    return cresult.toString(16)
  }


  // -----System Commands: Non-device commands or complex commands to device------
  async function blxSysCmd(cmd) {
    const cmd_array = cmd.split(' ')
    let val
    let fname
    const cmd0 = cmd_array[0].toLowerCase();

    if (blxModemTerm === true) {
      blxErrMsg = 'ERROR(Modem): Exit Modem Terminal ("~")!'
      return
    }

    switch (cmd0) { // case independant
      case 'q':
      case 'quit': // Hide Termional
        setTerminal()
        break
      case 'cls': // Clear Termional
        terminalContent = []
        if (terminalParent !== undefined) document.getElementById('blxTerminalOut').innerText = "(cleared)"
        break

      case 's':
      case 'store': // IndexedDB store debugger
        try {
          if (cmd_array.length <= 1) { // 's' List objects
            await blStore.count()
            let lenTotal = 0
            const now = Date.now()
            terminalPrint('Store: ' + blStore.result() + ' Items')
            await blStore.iterate(function (value) {
              const age = deltaToTimeString(now - value.ts)

              if (value.v.akt_len !== undefined) {
                const alen = value.v.akt_len
                lenTotal += alen
                terminalPrint('\'' + value.k + '\' (' + age + ')\': ' + alen + ' Bytes')
              } else {
                terminalPrint('\'' + value.k + '\' (' + age + ')\'')
              }
            })
            terminalPrint('Total Data: ' + (lenTotal / 1024).toFixed(0) + ' kB')
          } else {
            switch (cmd_array[1]) {
              case 'c':
              case 'clear':
                await blStore.clearStore()
                terminalPrint('Store cleared')
                break
              case 'r':
              case 'remove': {
                let key
                if (cmd_array.length < 3) key = infile_laststore_name
                else key = cmd_array[2]
                await blStore.remove(key)
                terminalPrint("Removed '" + key + "' from Store")
              }
                break
              case 'l':
              case 'list':
                try {
                  let key
                  if (cmd_array.length < 3) key = infile_laststore_name
                  else key = cmd_array[2]
                  if (key === undefined) {
                    blxErrMsg = 'ERROR(Store): No Key'
                    break
                  }
                  await blStore.get(key)
                  const KeyVal = blStore.result()
                  if (KeyVal === undefined) {
                    blxErrMsg = 'ERROR(Store): No Value for this Key'
                    break
                  }
                  const txt_val = new TextDecoder().decode(KeyVal.v.bytebuf)
                  // console.log(KeyVal)
                  // Split into array of lines
                  // Attention: TextDecoder() includes '\r' (LTX can deal with '\r\n' and '\n'), adds 1 empty line!
                  let txt_lines = txt_val.replace(/\r/g, '').split(/\n/)
                  txt_lines.pop()
                  const old_terminal_lines = terminal_lines
                  if (terminal_lines < txt_val.length + 10) {
                    terminal_lines = txt_val.length + 10 // Resize Terminal if required
                  }
                  terminalPrint("List Key '" + KeyVal.k + "' Len: " + txt_val.length + ' Bytes => ' + txt_lines.length + ' Lines')
                  let i = 0
                  for (const line of txt_lines) {
                    terminalPrint(i + ': ' + (line.length ? line : '(empty)'))
                    i++
                  }
                  terminal_lines = old_terminal_lines
                } catch (err) {
                  blxErrMsg = 'ERROR(Store): ' + err
                }
                break

              case 'm':
              case 'modify':
                try {
                  let key
                  const idx = cmd_array[2]
                  if (idx === undefined) {
                    blxErrMsg = 'ERROR(Store): No Index'
                    break
                  }
                  const nline = cmd_array[3] // No spaces allowed
                  if (cmd_array.length < 5) key = infile_laststore_name
                  else key = cmd_array[4]
                  if (key === undefined) {
                    blxErrMsg = 'ERROR(Store): No Key'
                    break
                  }
                  await blStore.get(key)
                  const KeyVal = blStore.result()
                  if (KeyVal === undefined) {
                    blxErrMsg = 'ERROR(Store): No Value for this Key'
                    break
                  }
                  const txt_val = new TextDecoder().decode(KeyVal.v.bytebuf)
                  // Split into array of lines
                  // Attention: TextDecoder() includes '\r' (LTX can deal with '\r\n' and '\n'), adds 1 empty line!
                  let txt_lines = txt_val.replace(/\r/g, '').split(/\n/)
                  txt_lines.pop()

                  if (idx < 0 || idx > txt_lines.length) {
                    blxErrMsg = 'ERROR(Store): Index Range'
                    break
                  }
                  let line = txt_lines[idx]
                  terminalPrint('Old: ' + idx + ': ' + (line.length ? line : '(empty)'))
                  txt_lines[idx] = nline
                  line = txt_lines[idx]
                  terminalPrint('New: ' + idx + ': ' + (line.length ? line : '(empty)'))
                  const enc = new TextEncoder()
                  KeyVal.v.bytebuf = enc.encode(txt_lines.join('\n') + '\n')
                  // Set Metadata to to sth
                  const nlen = KeyVal.v.bytebuf.length
                  KeyVal.v.akt_len = nlen
                  KeyVal.v.crc32 = crc32Calc(KeyVal.v.bytebuf) // Just as Info
                  KeyVal.v.ctime = new Date()
                  KeyVal.v.pos0 = 0
                  KeyVal.v.total_len = nlen
                  KeyVal.v.ucl_flag = false
                  // Noch Modification Date etc...
                  await blStore.set(key, KeyVal.v)
                } catch (err) {
                  blxErrMsg = 'ERROR(Store): ' + err
                }
                break
              default:
                blxErrMsg = 'ERROR(Store): Unknown Cmd'
            }
          }
        } catch (err) {
          blxErrMsg = 'ERROR(Store): ' + err // Printed on return
        }
        break

      case 'e':
      case 'export':
        try {
          let key
          if (cmd_array.length < 2) key = infile_laststore_name
          else key = cmd_array[1]

          await blStore.get(key)
          const KeyVal = blStore.result()
          if (KeyVal === undefined) {
            blxErrMsg = 'ERROR(StoreExport): Key not found'
            break
          }
          blxExportKeyVal(KeyVal)
        } catch (err) {
          blxErrMsg = 'ERROR(StoreExport): ' + err // Printed on return
        }
        break

      case 'a':
      case 'audio':
        if (cmd_array.length > 1) {
          val = parseInt(cmd_array[1])
          audio_rssi = Boolean(val)
        }
        if (cmd_array.length > 2) {
          val = parseInt(cmd_array[2])
          audio_term = Boolean(val)
        }
        terminalPrint('Audio: RSSI: ' + (audio_rssi ? 'ON' : 'OFF') + ', Term: ' + (audio_term ? 'ON' : 'OFF'))
        break

      case 'f': {
        let frq = 440
        let dur, vol
        if (cmd_array.length > 1) frq = parseInt(cmd_array[1])
        if (cmd_array.length > 2) dur = parseInt(cmd_array[2])
        if (cmd_array.length > 3) vol = parseInt(cmd_array[3])
        frq_ping(frq, dur, vol)
        terminalPrint('Audio-Ping Frq:' + frq + ' Hz, (Dur: ' + dur + ' Vol: ' + vol + ')')
      }
        break

      case 'k':
      case 'keep':
        if (cmd_array.length > 1) {
          val = parseInt(cmd_array[1])
          keep_conn = Boolean(val)
        }
        terminalPrint('Keep Connection: ' + (keep_conn ? 'ON' : 'OFF'))
        break

      case 'rs':
      case 'rssi': // Rssi
        if (cmd_array.length > 1) {
          val = parseInt(cmd_array[1])
          show_rssi = Boolean(val)
        }
        terminalPrint('RSSI: ' + (show_rssi ? 'ON' : 'OFF'))
        break

      case 'cf':
      case 'connectionfast':
        if (cmd_array.length > 1) {
          if (cmd_array[1].charAt(0).toLowerCase() === 'f') con_fast_speed = 'F'
          else {
            val = parseInt(cmd_array[1])
            if (val < 3) val = 3
            else if (val > 30) val = 30
            con_fast_speed = val.toString()
          }
          if (cmd_array.length > 2) {
            val = parseInt(cmd_array[1])
            if (val < 3) val = 3 // Only Number allowed
            else if (val > 30) val = 30
            con_memfast_speed = val.toString()
          }
        } {
          let cas
          if (con_act_speed !== undefined) cas = con_act_speed
          else cas = '(Unknown)'
          terminalPrint("Fast Connection Speed: " + con_fast_speed + ", Current: " + cas)
          terminalPrint("Fast Memory Download Speed: " + con_memfast_speed)
        }
        break

      case 'l':
      case 'lines': // No. of lines
        if (cmd_array.length > 1) terminal_lines = parseInt(cmd_array[1])
        terminalPrint('Lines: ' + terminal_lines)
        break

      case 'sl': // 's' in use..
      case 'sleep': // Sleep x msec - Test function
        if (cmd_array.length > 1) val = parseInt(cmd_array[1])
        terminalPrint('Sleep: ' + val + ' msec...')
        await sleepMs(val)
        terminalPrint('...OK')
        break

      case 'd':
      case 'disconnect':
        if (full_connected_flag === true) {
          NUS_device.gatt.disconnect() // Works always
        } else {
          blxErrMsg = 'ERROR(Cmd): Not connected!'
        }
        break

      case 'c':
      case 'connect':
        if (full_connected_flag === true) {
          NUS_device.gatt.disconnect() // Optionally disconnect first, Works always
        }
        // opt. Take PIN
        if (cmd_array.length > 1) blx_pin_val = cmd_array[1]
        await blxSelect()
        if (!blxErrMsg) await blxConnectNus(1, 1) // Connect, With SCAN
        break

      case 'r':
      case 'reconnect':
        // opt. Take PIN
        if (cmd_array.length > 1) blx_pin_val = cmd_array[1]
        if (full_connected_flag === true) {
          blxErrMsg = 'ERROR(Cmd): Already connected!'
        } else if (NUS_device === undefined) {
          blxErrMsg = 'ERROR(Cmd): Nothing to Reconnect!'
        } else {
          await blxConnectNus(0, 1) // Reconnect, With SCAN
        }
        break

      case 'i':
      case 'identify':
        // opt. Take PIN
        if (cmd_array.length > 1) blx_pin_val = cmd_array[1]
        await blxConnectionFast()
        await blxDeviceIdentify()
        if (identify_ok_flag === false) {
          blxErrMsg = 'ERROR(Cmd): identify failed!'
        }
        if (blx_pin_ok === true) chordsound(500) // OK
        break

      // ** File cmds **
      case 'm':
      case 'memory':
        await calcMem()
        if (!blxErrMsg) {
          let mperc
          if (blxDataMem.max > 0) mperc = (blxDataMem.total * 100 / blxDataMem.max).toFixed(2)
          else mperc = 'Unknown'

          let mmode = "???"
          switch (blxDataMem.mode) {
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
          terminalPrint('Data(Bytes): Total:' + blxDataMem.total + '(' + mperc + '%, ' + mmode + '), New:' + blxDataMem.incnew)
        }
        break

      case 'u':
      case 'upload':
        // u Upload data.edt/data.edt.old to store, fastspeed true by default
        await upload(cmd_array)
        break

      case 'x':
      case 'xtract':
        // extract data for MAC
        {
          let xmac
          if (cmd_array.length <= 1) xmac = blxIDs.deviceMAC
          else xmac = cmd_array[1]

          if (xmac == undefined || xmac.length != 16) {
            blxErrMsg = 'ERROR(xtract): MAC Error'
            break
          }
          terminalPrint("Extract Data for MAC:'" + xmac + "' to Store")
          await xtract(xmac)
          if (!blxErrMsg) terminalPrint("Extracted")
        }
        break

      case 'g':
      case 'get':
        // g FNAME - Alles  (oder get)
        // g FNAME pos0 - ab pos0 (Mitte bis Ende)
        // g FNAME pos0 anz - anz Bytes ab pos0 (Nur den Anfang)
        await getfile(cmd_array) // autospeed true
        break

      case 'p':
      case 'put': {
        let syncflag = cmd_array[1]
        if (syncflag === undefined) syncflag = 0;
        terminalPrint('Put File (Syncflag: ' + syncflag + ')')
        await blxSelectAndPutFile(syncflag)
      }
        break

      case 'firmware': // Firmwareupdate
        terminalPrint('Firmware Update')
        if (blxDevice.deviceType >= 1000 || (blxDevice.disk !== undefined && blxDevice.disk.diskSize > 0)) { // Nur fuer Logger 
          await blxSelectAndPutFile(0, '.sec') // Danach sofort return
          break;
        }
      // falls through 

      case 'memput': {
        let mem_addr
        let mem_size
        if (blxIDs.cpu == 32) {
          mem_addr = 0x48000
          mem_size = (160 * 1024)
        } else if (blxIDs.cpu == 40) {
          mem_addr = 0x99000
          mem_size = (348 * 1024)
        } else {
          blxErrMsg = 'ERROR(memput): Unknown CPU'
          break
        }
        let reset_flag = (cmd0 == 'firmware')
        await blxSelectAndMemPutFile(mem_addr, mem_size, reset_flag)
      }
        break

      case 'fput': {
        const sname = cmd_array[1]
        if (sname === undefined) {
          blxErrMsg = 'ERROR(fput): No Filename'
          break
        }
        const storemac = sname.substring(0, 17)
        const fname = sname.substring(17)
        if (storemac.length !== 17 || storemac.charAt(16) !== '_' || fname.charAt(0) === '#' || fname.length < 1 || fname.length > 21) {
          blxErrMsg = 'ERROR(fput): Filename Error'
          break
        }
        try {
          await blStore.get(sname)
          const KeyVal = blStore.result()
          if (KeyVal === undefined) {
            blxErrMsg = 'ERROR(fput): No Value for this Key'
            break
          }
          const nlen = KeyVal.v.akt_len
          const syncflag = KeyVal.v.esync_flag
          if (!nlen) {
            blxErrMsg = 'ERROR(fput): Empty File'
            break
          }
          terminalPrint("Put File ('" + storemac + "...') '" + fname + "' from Store")
          terminalPrint('(Len: ' + nlen + ' Bytes, Syncflag: ' + syncflag + ')')
          await blxSendBinblock(KeyVal.v.bytebuf, fname, syncflag) // Send as binary Block
        } catch (err) {
          blxErrMsg = 'ERROR(fput): ' + err
        }
      }
        break

      case 'del': // del FNAME , keine Kurzform
        fname = cmd_array[1]
        if (fname === undefined || fname.length < 1 || fname.length > 21) {
          blxErrMsg = 'ERROR: Filename'
          break
        }
        await blxDeviceCmd('D:' + fname, 10000)
        break

      case 'format': // Flash Formatieren
        {
          const fval = parseInt(cmd_array[1])
          if (fval > 0 && fval <= 2) {
            terminalPrint('Wait... (up to 240 secs)')
            await blxDeviceCmd('F' + fval, 250000) // Kann 4 Min dauern
          } else {
            blxErrMsg = "ERROR: 'format 1'(Chip Erase) or 'format 2'(Soft)"
          }
        }
        break

      case 'reset': // Geraet Resetten
        terminalPrint('Reset Device')
        await blxDeviceCmd('')
        if (blxErrMsg) break
        await blxDeviceCmd('R', 2000) // Will Timeout!
        await sleepMs(1000)
        blxErrMsg = 0
        break

      case 't':
      case 'time': // time abfrage oder setzen
        {
          let tstr = 'T'
          if (cmd_array[1] === 'set') tstr += +(Date.now() / 1000).toFixed(0) // APP TIME
          await blxDeviceCmd(tstr, 5000)
        }
        break

      default:
        blxErrMsg = 'ERROR(SysCmd): Command unknown'
    }
  }

  // After Connect Device normally FAST, if not: set to fast manually
  async function blxDeviceIdentify(setlowspeed = true) {
    let i = CONN_TRIES
    let getPin = true
    let KeyVal
    blx_pin_ok = false

    while (i--) {
      await blxDeviceCmd('~', 5000) // HELLO, get ~B: NUS_Size and MAC
      if (blxErrMsg) continue
      if (getPin === true) {
        await blStore.get(blxIDs.deviceMAC + '_#PIN')
        KeyVal = blStore.result()
        if (KeyVal !== undefined && KeyVal.v.length) blx_pin_val = KeyVal.v
        getPin = false
      }

      let blx_pin_resp = blx_pin_val
      if (blx_challenge !== undefined) {
        let pin_val = parseInt(blx_pin_val)
        if (isNaN(pin_val)) {
          blxErrMsg = "PIN required"
          terminalPrint("ERROR: " + blxErrMsg)
          errorsound()
          return
        }
        blx_pin_resp = await ChallengeResponseCalc(pin_val, blx_challenge)
      }

      await blxDeviceCmd('/' + blx_pin_resp, 5000) // get Version and Devicetype ~V, SEND PIN: benoetigt MAC
      if (blx_pin_ok !== true) {
        await blStore.remove(blxIDs.deviceMAC + '_#PIN') // evtl. remove old/wrong PIN from store
        if (setlowspeed) await blxConnectionSlow()
        return
      }
      if (blxErrMsg) continue
      await blxDeviceCmd('T', 5000) // Get Time
      if (blxErrMsg) continue
      if (blxIDs.deviceType >= 200 && blxIDs.deviceType < 1000) { // OSX Sensors without Flash Memory
        if (blxUserCB) blxUserCB('MSG', 1, 'Sensor, No Disk') // 3 Connected, waiting for IDs
      } else {
        await blxDeviceCmd('v', 10000) // Get virtual Disk Dir
        if (blxErrMsg) continue

        // synchronise device files, sys_param.lxp is less important than iparam.lxp
        await blxDeviceCmd('Y') // Check virtual Disk // Check/Repair sys_param
        if (blxErrMsg) {
          terminalPrint(blxErrMsg)
          blxErrMsg = 0
        }
        await syncDeviceFile('sys_param.lxp', false) // (already?) fast no explicit autospeed
        if (blxErrMsg) {
          terminalPrint(blxErrMsg)
          blxErrMsg = 0
        }

        await blxDeviceCmd('X') // Check virtual Disk // Check/Repair iparam
        if (blxErrMsg) {
          terminalPrint(blxErrMsg)
          blxErrMsg = 0
        }
        await syncDeviceFile('iparam.lxp', false)
        if (blxErrMsg) {
          terminalPrint(blxErrMsg)
          blxErrMsg = 0
        }

        blxIDs.diskCheckOK = true
        await blxDeviceCmd('V', 10000) // Check virtual Disk
        if (blxErrMsg) {
          terminalPrint(blxErrMsg)
          blxErrMsg = 0
          blxIDs.diskCheckOK = false
        }
      }

      if (setlowspeed) await blxConnectionSlow()

      if (!blxErrMsg) {
        identify_ok_flag = true
        if (blxUserCB) blxUserCB('CON', 4, 'Full Connected') // 3 Connected, waiting for IDs
        blxIDs.lastSeen = new Date()
        // Store only number-PINs
        if (blx_pin_ok === true && blx_pin_val.length && !isNaN(Number(blx_pin_val))) {
          await blStore.set(blxIDs.deviceMAC + '_#PIN', blx_pin_val)
        }
        await addParamFiles2Blx()
        break
      }
    }
  }

  // Add Parameter Files to blxIDs
  async function addParamFiles2Blx() {
    let ipdf = false // Dirtyflags
    let spdf = false
    await blStore.get(blxIDs.deviceMAC + '_iparam.lxp')
    let iparam = blStore.result() // undefined opt.

    if (iparam === undefined) { // Nothing found, try to restore from Bakcup!
      await blStore.get(blxIDs.deviceMAC + '_#BAK_iparam.lxp')
      iparam = blStore.result()
      if (iparam !== undefined) {
        terminalPrint("INFO: 'iparam.lxp' restored")
        ipdf = true
      }
    }

    await blStore.get(blxIDs.deviceMAC + '_sys_param.lxp')
    let server = blStore.result() // undefined opt.

    if (server === undefined) { // Nothing found, try to restore from Bakcup!
      await blStore.get(blxIDs.deviceMAC + '_#BAK_sys_param.lxp')
      server = blStore.result()
      if (server !== undefined) {
        terminalPrint("INFO: 'sys_param.lxp' restored")
        spdf = true
      }
    }
    let txt_val
    let txt_lines
    if (iparam !== undefined) { // Par. [12] iparam.flags 0: Record OFF, Bit 1:Measure, Bit 2: Ring
      txt_val = new TextDecoder().decode(iparam.v.bytebuf)
      // Split into array of lines
      // Attention: TextDecoder() includes '\r' (LTX can deal with '\r\n' and '\n'), adds 1 empty line!
      txt_lines = txt_val.replace(/\r/g, '').split(/\n/)
      txt_lines.pop()
      if (txt_lines.length > 19) { // Minimum 20 Entries
        blxIDs.iparam = txt_lines
        blxIDs.iparam_dirtyflag = ipdf
      }
    }
    if (server != undefined) {
      txt_val = new TextDecoder().decode(server.v.bytebuf)
      txt_lines = txt_val.replace(/\r/g, '').split(/\n/)
      txt_lines.pop()
      if (txt_lines.length >= 18) {
        blxIDs.sys_param = txt_lines
        blxIDs.sys_param_dirtyflag = spdf // No Force Transfer
      }
    }
  }


  // Function blxGetfile(): Hilt sich ein File, was vorher via N angefragt worden ist/Name gesetzt
  // infile_ tw. schon initialisiert
  async function blxGetfile(pos0, len, autospeed = true) {
    if (autospeed && len > 1000) {
      await blxConnectionFast()
      if (blxErrMsg) return
      // console.log("Fast OK");
    }

    await blxDeviceCmd('G ' + len + ' ' + pos0, 600000) // 5 min

    if (autospeed && len > 1000) { // Mehr als 1k Daten: -> Wieder SLOW
      await blxConnectionSlow()
    }
  }

  // Send a block of data in Junks of max_ble_blocklen, Send 0-Block is OK
  // data is Uint8Array Define either fname (= Cmd:'P') or mem_addr (= CMD:'I')
  // !!! Download Speed muss langsam sein fuer Memory Write
  // Download verwendet ausser (blxCmdBusy in CMDs) und xxx nix externes
  async function blxSendBinblock(data, fname, syncflag, mem_addr) {
    let txlen_total = data.length
    let tx_pos = 0
    const time0 = Date.now() - 1000
    let tw_old = time0
    let tw_new // Working Time fuer Fortschritt
    let sblk_len = (max_ble_blocklen - 2) & 0xFFFC // Initial MAX Size Block, but Multi of 4

    if (data.length > 1000) { // Mehr als 1k Daten UND File: -> FAST

      if (fname === undefined) {
        // Might bee too fast for Download to CPU Memory, set to slow with .cf 15 or greater!!!
        if (con_memfast_speed < 15)
          terminalPrint("*** WARNING: Memory Connection Speed: " + con_memfast_speed)
        const os = con_fast_speed // temporaer mit MEMORY Speed
        con_fast_speed = con_memfast_speed
        await blxConnectionFast()
        con_fast_speed = os
      } else {
        await blxConnectionFast()
      }
      if (blxErrMsg) return
      // console.log("Fast OK");
    }
    // Decide: Filesystem / Internal

    blxPutReady = false;
    if (fname !== undefined) await blxDeviceCmd('P' + (syncflag ? '!' : '') + ':' + fname, 5000) // P wie PUT
    else {
      {
        let wadr = mem_addr
        let wsize = txlen_total
        const sector_size = 4096 // Fix fuer nrF52
        // Sektoren in einzeln Loeschen, da langsam
        while (wsize > 0) {
          await blxDeviceCmd('K:' + wadr + ' ' + 1, 5000)
          if (blxErrMsg) return
          wadr += sector_size
          wsize -= sector_size
        }
      }
      await blxDeviceCmd('I:' + mem_addr, 5000) // I wie Internal
    }
    if (blxErrMsg) return

    if (blxPutReady !== true) {
      blxErrMsg = 'ERROR: File Send Error'
      return
    }

    try {
      for (; ;) { // Device ignores unwanted Blocks
        let blen = txlen_total // Blocklen
        if (blen > sblk_len) blen = sblk_len
        const bdata = new Uint8Array(blen + 2)
        bdata[0] = blen
        bdata[1] = BB_BLE_BINBLK_IN // Binary Data
        // Aufgabe: data[tx_pos] an bdata[2] kopieren
        const datablock = data.subarray(tx_pos, tx_pos + blen)
        bdata.set(datablock, 2) // Copies datablock into bdata

        await NUS_data_chara_write.writeValue(bdata.buffer)
        // console.log(bdata);
        txlen_total -= blen
        tx_pos += blen
        if (!txlen_total) {
          const dtime = Date.now() - time0
          terminalPrint('Transfer OK (' + dtime / 1000 + ' sec, ' + ((data.length / dtime * 1000).toFixed(0)) + ' Bytes/sec)')
          break
        }
        tw_new = Date.now()
        if (tw_new - tw_old > 1000) { // Alle Sekunde Fortschritt
          tw_old = tw_new
          terminalPrint(((tx_pos * 100) / data.length).toFixed(0) + '% / ' + tx_pos + ' Bytes')
        }
      }
    } catch (error) {
      if (full_connected_flag === false) blxErrMsg = 'ERROR: Connection lost'
      else blxErrMsg = 'ERROR: Transfer ' + error
      return
    }

    await blxDeviceCmd('L', 5000) // Close

    if (blxErrMsg) return
    if (data.length > 1000) { // Mehr als 1k Daten: -> Wieder SLOW
      await blxConnectionSlow()
    }
  }

  // Gelesene Daten aus variable LocalStore exportieren. ACHTUNG: LocalStore nur STRINGS
  async function blxInfileStore() {
    if (infile_read_len === undefined || !infile_read_len) {
      blxErrMsg = 'ERROR(Store): No Data to store'
      return
    }
    if (infile_bytebuf === undefined || infile_bytebuf.length !== infile_exp_len) {
      blxErrMsg = 'ERROR(Store): Inconsistent Data'
      return
    }
    const storeKey = blxIDs.deviceMAC + '_' + infile_name // NAME here
    const storeValue = []

    storeValue.total_len = infile_file_len
    storeValue.pos0 = infile_file_pos0
    storeValue.akt_len = infile_exp_len

    storeValue.ctime = infile_file_ctime
    storeValue.crc32 = infile_file_crc32
    storeValue.ucl_flag = infile_file_ucl_flag
    storeValue.esync_flag = infile_file_esync_flag
    storeValue.bytebuf = infile_bytebuf

    try {
      await blStore.set(storeKey, storeValue)
    } catch (err) {
      blxErrMsg = 'ERROR(Store): ' + err
      return
    }

    terminalPrint("Save to Store '" + storeKey + "'")
    infile_bytebuf = undefined // Save Memory
    infile_laststore_name = storeKey // keep Name
  }

  // Daten aus variable nach File exportieren,
  function blxExportKeyVal(KeyVal) {
    try {
      if (KeyVal.v === undefined || KeyVal.v.total_len === undefined || !KeyVal.v.total_len) {
        blxErrMsg = 'ERROR(Export): No Length or Empty!'
        return
      }

      const ppos = KeyVal.k.lastIndexOf('.')
      let atype = 'application/octet-binary'
      if (ppos > 1) {
        switch (KeyVal.k.substring(ppos).toLowerCase()) {
          // src:  https://www.sitepoint.com/mime-types-complete-list/
          case '.jpg':
            atype = 'image/jpeg'
            break
          case '.csv':
            atype = 'application/csv;charset=utf-8'
            break
          case '.pdf':
            atype = 'application/pdf'
            break
          case '.txt':
          case '.log':
            atype = 'text/plain;charset=utf-8'
            break
          // etc...
        }
      }

      const blob = new Blob([KeyVal.v.bytebuf], {
        type: atype
      }) // BlobType: MDN-File API
      const export_fname = KeyVal.k
      saveAs(blob, export_fname)
      terminalPrint("Export '" + export_fname + "'")
      /* optional */
      // terminalPrint('Calculated CRC32: ' + crc32Calc(KeyVal.v.bytebuf).toString(16))
    } catch (e) {
      blxErrMsg = 'ERROR(Export): Export failed'
    }
  }

  async function blxSelectAndPutFile(syncflag, filetype) {
    const fs_input = document.createElement('input')
    fs_input.type = 'file'
    if (filetype !== undefined) fs_input.accept = filetype

    fs_input.onchange = e => { // only called if File selected
      // getting a hold of the file reference
      const file = e.target.files[0]
      // setting up the reader
      terminalPrint('Selected File:"' + file.name + '" Size:' + file.size + ' LastModified: [' + file.lastModifiedDate.toLocaleDateString() + ' ' + file.lastModifiedDate.toLocaleTimeString() + ']')
      // Test Firmware namee for Compatibility
      if (filetype !== undefined && filetype == '.sec') {
        let vglstr = 'firmware_typ' + blxIDs.deviceType + '_'
        if (!file.name.startsWith(vglstr) && !file.name == '_firmware.sec') {
          blxErrMsg = 'ERROR: No Firmware File for this Device'
          terminalPrint(blxErrMsg)
          return
        }
      }

      const reader = new FileReader()
      reader.onload = async function () {
        const binbuf = new Uint8Array(reader.result)

        if (!binbuf.length) {
          blxErrMsg = 'ERROR: File is empty'
          terminalPrint(blxErrMsg)
          return
        }
        // Optional (TBD)
        // terminalPrint('Calculated CRC32: ' + crc32Calc(binbuf).toString(16))

        let fname = file.name
        if (filetype !== undefined && filetype == '.sec') { // sec only allowed for firmware
          fname = '_firmware.sec'
        }
        await blxSendBinblock(binbuf, fname, syncflag) // Send as binary Block
        if (blxErrMsg) terminalPrint(blxErrMsg)

        if (filetype !== undefined && filetype == '.sec') { // Reset
          terminalPrint('Reset Device')
          await blxDeviceCmd('R', 2000) // Will Timeout!
          await sleepMs(1000)
          blxErrMsg = 0
        }
      }

      reader.readAsArrayBuffer(file)
    }

    terminalPrint('Select File or Cancel')
    fs_input.click()
    // return ohne wait!
  }

  async function blxSelectAndMemPutFile(mem_addr, mem_size, resetflag = false) {
    const fs_input = document.createElement('input')
    fs_input.type = 'file'

    fs_input.onchange = e => { // only called if File selected
      // getting a hold of the file reference
      const file = e.target.files[0]
      // setting up the reader
      terminalPrint('Selected File:"' + file.name + '" Size:' + file.size + ' LastModified: [' + file.lastModifiedDate.toLocaleDateString() + ' ' + file.lastModifiedDate.toLocaleTimeString() + ']')
      const reader = new FileReader()
      reader.onload = async function () {
        const binbuf = new Uint8Array(reader.result)

        if (!binbuf.length) {
          terminalPrint('ERROR: File is empty')
          return
        }
        if (binbuf.length > mem_size) {
          terminalPrint('ERROR: File too large')
          return
        }

        await blxSendBinblock(binbuf, undefined, false, mem_addr) // Send as binary Block
        if (blxErrMsg) terminalPrint(blxErrMsg)
        // Show CRC 
        terminalPrint('Calculated CRC32: ' + crc32Calc(binbuf).toString(16) + '(' + binbuf.length + ' Bytes)')

        if (resetflag === true) { // Reset
          terminalPrint('Reset Device')
          await blxDeviceCmd('R', 2000) // Will Timeout!
          await sleepMs(1000)
          blxErrMsg = 0
        }

      }
      reader.readAsArrayBuffer(file)
    }

    terminalPrint('Select File or Cancel')
    fs_input.click()
    // return ohne wait!
  }


  // =======Terminal-Emulation=======
  const TERMINAL_LINES = 25 // Default
  let terminal_lines // Real
  let terminalParent // parent HTML Element for terminal box
  let terminalContent = []

  function terminalPrint(txt) {
    if (txt !== undefined) terminalContent.push(txt)
    else terminalContent[0] = '*** BLX Terminal ' + VERSION + ' ' + COPYRIGHT + ' ***'
    while (terminalContent.length > terminal_lines) terminalContent.shift()
    if (terminalParent !== undefined) document.getElementById('blxTerminalOut').innerText = terminalContent.join('\n')
  }

  function terminalKeyUpEvent(e) {
    if (e.keyCode === 13 || e.keycode === 10) { // CR NL
      e.preventDefault()
      document.getElementById('blxTerminalSend').click()
    } else if (e.keyCode === 27) { // Esc
      e.preventDefault()
      document.getElementById('blxTerminalCmd').value = ''
    }
  }

  function terminalUserEnable(enstat) {
    if (terminalParent !== undefined) document.getElementById('blxTerminalSend').disabled = !enstat
  }

  let lastcmd = '' // Store last CMD

  async function terminalSendCmd() {
    const inpcmd = document.getElementById('blxTerminalCmd')
    let cmd = inpcmd.value.trim()
    inpcmd.value = ''
    inpcmd.focus()
    terminalPrint('> ' + cmd)
    terminalUserEnable(false)
    clicksound()
    blxErrMsg = 0

    if (cmd == '*' && lastcmd.length) cmd = lastcmd; // Repeat last CMD
    else if (cmd.length) lastcmd = cmd;

    if (cmd == 'help' || cmd == '-h' || cmd == '/h' || cmd == '-?' || cmd == '/?') {
      terminalPrint(HELP)
      terminalPrint(COPYRIGHT)
      return;
    }


    if (cmd.startsWith('.')) await blxSysCmd(cmd.substring(1))
    else await blxDeviceCmd(cmd)
    await blxCheckIDs()
    if (blxErrMsg) {
      errorsound()
      terminalPrint(blxErrMsg)
    }
    terminalUserEnable(true)
  }

  //         "<div><label>Cmd: &gt <input id='blxTerminalCmd' typ='text' style='min-width: 66%';' maxlength='80'></label> <button id='blxTerminalSend'>Send</button></div>"


  // Disable Callback by any argument that is not a function
  function setTerminal(elementId, userCB, lines = TERMINAL_LINES) { // (De-Assign Terminal to HTML Element)
    if (elementId !== undefined) {
      terminal_lines = lines
      terminalParent = document.getElementById(elementId)
      // Format CMD-line as 3 component Flexbox with grow for input
      terminalParent.innerHTML = "<div id='blxTerminalOut' style='border: 1px solid blue; margin: 6px 0; overflow:hidden;'></div>" +
        "<div style='display:flex; align-items: baseline;'><label for='blxTerminalCmd'>Cmd: &gt </label>" +
        "<input id='blxTerminalCmd' typ='text' style='flex-grow: 1; margin: 0 4px;' maxlength='80'>" +
        "<button id='blxTerminalSend'>Send</button></div>"
      document.getElementById('blxTerminalCmd').addEventListener('keyup', terminalKeyUpEvent)
      document.getElementById('blxTerminalSend').addEventListener('click', terminalSendCmd)
      // No initial Scroll - document.getElementById('blxTerminalCmd').focus()
      terminalPrint()
      terminalUserEnable(true)
    } else {
      if (terminalParent !== undefined) terminalParent.innerHTML = ''
      terminalParent = undefined
    }
    if (userCB !== undefined) {
      if ((typeof userCB) === 'function') {
        blxUserCB = userCB
      } else userCB = undefined
    }
  }

  // ===== Channel Edit Helpers =======
  // Add a Channel to Iparam-Array inplace!
  // *** ATTENTION: iparam is normally a shallow copy of blxDevice.iparam  and blxIDs.iparam!
  // Assume: iparam[] (external) scanned and OK
  function IparamAddChannel(iparam, copyflag) {
    let newChan = 0
    let maxChan = parseInt(iparam[2])
    let lastidx
    for (; ;) { // Find last Channel
      const h = blxFindIparamIdx(iparam, newChan)
      if (h < 0) break // Not found
      newChan++
      lastidx = h
      if (newChan >= maxChan) return false // Not possible
    }
    let plines = blxLinesPerChannel(iparam)
    iparam.push("@" + (newChan))
    for (let i = 0; i < (plines - 1); i++) {
      if (copyflag === true && lastidx !== undefined) iparam.push(iparam[lastidx + i + 1])
      else iparam.push("")
    }
    return true
  }

  // Find Array Index of Channel x in iparam, Return Index or -1
  // At least Channel #0 should be present
  function blxFindIparamIdx(iparam, chan) {
    let lookupstr = '@' + chan
    for (let i = 0; i < iparam.length; i++) {
      if (iparam[i] === lookupstr) return i
    }
    return -1
  }

  // Currently LTraX V1.x, a channel has 14 Lines, FIX and Channel #0 always present
  // Check this here!
  function blxLinesPerChannel(iparam) {
    let idx0 = blxFindIparamIdx(iparam, 0)
    let idx1 = blxFindIparamIdx(iparam, 1)
    if (idx1 < 0) idx1 = iparam.length // If only 1 Channel active
    let plines = idx1 - idx0 // Number of Lines in a Parameter

    if (idx0 < 0) {
      throw "FATAL_ERROR: iparam defect: Channel #0 not found"
    }
    if (plines !== 14) {
      throw "FATAL_ERROR: iparam defect: <> 14 Parameters/Channel!"
    }
    return plines // 14 by Design V1.x
  }

  // Reduce Iparam-Array to active Channel >= #0 or Channel #0 at least
  // A Channel is active if action-Flags > 0
  function CompactIparam(iparam) {
    let lastActiveChannel = 0
    let test_chan = 0;
    for (; ;) {
      let nChanIdx = blxFindIparamIdx(iparam, test_chan)
      if (nChanIdx < 0) break // Not found
      if (parseInt(iparam[nChanIdx + 1]) > 0) {
        lastActiveChannel = test_chan;
      }
      test_chan++;
    }
    // Remove all entries after last used ch
    let lastIdx = blxFindIparamIdx(iparam, lastActiveChannel) + blxLinesPerChannel(iparam)
    iparam.splice(lastIdx, 999) // Remove all the rest
  }

  function nverify_int(valstr, limlow, limhigh) {
    const val = parseInt(valstr)
    if (isNaN(val) || val < limlow || val > limhigh) return 1
    return 0
  }

  function nisfloat(valstr) {
    const val = parseFloat(valstr)
    if (isNaN(val)) return 1
    return 0
  }

  // Validate IParam as LTX ***V1.x*** Parameters
  function IparamValidateLTX_V1(iparam) {
    // First Check Header
    if (iparam.length < 19) return "300: Size "
    if (iparam[0] !== '@100') return "301: File Format (ID not '@100')"
    if (nverify_int(iparam[1], 1, 999999)) return "302: DEVICE_TYP"
    if (nverify_int(iparam[2], 1, 90)) return "303: MAX_CHANNELS"
    if (nverify_int(iparam[3], 0, 255)) return "304: HK_FLAGS"
    if (iparam[4].length !== 10) return "305: Cookie (10 Digits)"
    if (iparam[5].length > 41) return "306: Device Name Len"
    if (nverify_int(iparam[6], 10, 86400)) return "307: Period"
    if (nverify_int(iparam[7], 0, parseInt(iparam[6]) - 1)) return "308: Period Offset"
    if (nverify_int(iparam[8], 0, parseInt(iparam[6]))) return "309: Alarm Period"
    if (nverify_int(iparam[9], 0, 604799)) return "310: Internet Period"
    if (nverify_int(iparam[10], 0, parseInt(iparam[9]))) return "311: Internet Period"
    if (nverify_int(iparam[11], -43200, 43200)) return "312: UTC Offset"
    if (nverify_int(iparam[12], 0, 255)) return "313: Record Flags"
    if (nverify_int(iparam[13], 0, 255)) return "314: HK Flags"
    if (nverify_int(iparam[14], 0, 255)) return "315: HK Reload"
    if (nverify_int(iparam[15], 0, 255)) return "316: Net Mode"
    if (nverify_int(iparam[16], 0, 255)) return "317: Error Policy"
    if (nverify_int(iparam[17], -40, 10)) return "318: MinTemp oC"
    if (nverify_int(iparam[18], 0, 0x7FFFFFFF)) return "319: Config0_U31"
    if (iparam[19].length > 79) return "320: Configuration Command Len"

    let pidx = blxFindIparamIdx(iparam, 0)
    if (pidx < 19) return "600: Missing #0"
    let chan = 0
    for (; ;) {
      if (iparam.length - pidx < 13) return "601: No of Params #" + chan
      if (nverify_int(iparam[pidx + 1], 0, 255)) return "602: Action #" + chan
      if (nverify_int(iparam[pidx + 2], 0, 65535)) return "603: PhysChan #" + chan
      if (iparam[pidx + 3].length > 8) return "604: KanCaps Len #" + chan
      if (nverify_int(iparam[pidx + 4], 0, 255)) return "605: SrcIndex #" + chan
      if (iparam[pidx + 5].length > 8) return "606: Unit Len #" + chan
      if (nverify_int(iparam[pidx + 6], 0, 255)) return "607: MemFormat #" + chan
      if (nverify_int(iparam[pidx + 7], 0, 0x7FFFFFFF)) return "608: DB_ID #" + chan
      if (nisfloat(iparam[pidx + 8])) return "609: Offset #" + chan
      if (nisfloat(iparam[pidx + 9])) return "610: Factor #" + chan
      if (nisfloat(iparam[pidx + 10])) return "611: Alarm_Hi #" + chan
      if (nisfloat(iparam[pidx + 11])) return "612: Alarm_Low #" + chan
      if (nverify_int(iparam[pidx + 12], 0, 65535)) return "613: MeasBits #" + chan
      if (iparam[pidx + 13].length > 32) return "614: XBytes Len #" + chan
      if (iparam[pidx + 14] === undefined) break
      if (iparam[pidx + 14] !== ('@' + (chan + 1).toString())) return "615: Unexpected Line #" + chan
      pidx += 14 // V1.x  14 lines
      chan++
    }

    return undefined //  == OK
  }

  // Validate IParam as LTX ***V1.x*** Sys Parameters
  function SysParamValidateLTX_V1(sysparam) {
    // First Check Header
    if (sysparam.length < 19) return "200: Size "
    if (sysparam[0] !== '@200') return "201: File Format (ID not '@200')"
    if (sysparam[1].length > 41) return "202: APN Len"
    if (sysparam[2].length > 41) return "203: Server Len"
    if (sysparam[3].length > 41) return "204: Script Len"
    if (sysparam[4].length > 41) return "205: API Key Len"
    if (nverify_int(sysparam[5], 0, 255)) return "206: ConFlags"
    if (nverify_int(sysparam[6], 0, 65535)) return "207: SIM PIN"
    if (sysparam[7].length > 41) return "208: User Len"
    if (sysparam[8].length > 41) return "209: Password Len"
    if (nverify_int(sysparam[9], 10, 255)) return "210: Max_creg"
    if (nverify_int(sysparam[10], 1, 65535)) return "211: Port"
    if (nverify_int(sysparam[11], 1000, 65535)) return "212: Timeout_0"
    if (nverify_int(sysparam[12], 1000, 65535)) return "213: Timeout_run"
    if (nverify_int(sysparam[13], 60, 3600)) return "214: Reload"
    if (nverify_int(sysparam[14], 0, 100000)) return "215: Bat. Capacity"
    if (nisfloat(sysparam[15])) return "216: Bat. Volt 0%"
    if (nisfloat(sysparam[16])) return "217: Bat. Volt 100%"
    if (nverify_int(sysparam[17], 1000, 2e31)) return "218: Max Ringsize"
    if (nverify_int(sysparam[18], 0, 1e9)) return "219: mAmsec/Measure"

    if (sysparam.length < 20) sysparam[19] = '0' // NewItem
    if (nverify_int(sysparam[19], 0, 255)) return "220: Mobile_Protocol"
    return undefined //  == OK
  }


  // ========= Audio Tools ==========
  // 2 Var fuer Audio
  const AudioContext = window.AudioContext || window.webkitAudioContext
  let acx = null
  let audio_rssi = false // If true: Ping Distance
  let audio_term = true

  // Audio-Signalping BLE-Signal (positiv 100: Weak, 40 top)
  function rssi_ping(sig) {
    if (sig > 199) {
      frq_ping(30, 0.2, 0.3) // ERROR
    } else {
      if (sig < 30) sig = 30
      const frq = Math.pow(2, (100 - sig) / 12) * 100
      frq_ping(frq, 0.5, 0.15)
    }
  }

  function movesound() {
    frq_ping(100, 0.3, 0.2) // Bong
    frq_ping(99, 0.3, 0.2)
  }

  function clicksound() {
    frq_ping(1000, 0.05, 0.1) // Click
  }

  function zirpsound() {
    frq_ping(3000, 0.04, 0.02) // Zirpen
  }

  function errorsound() {
    frq_ping(30, 0.2, 0.3)
  }

  function chordsound(frq, dur = 0.3, vol = 0.05) { // Dur Akkord
    frq_ping(frq, dur, vol)
    frq_ping(frq * 1.259, dur, vol)
    frq_ping(frq * 1.498, dur, vol)
  }

  function frq_ping(frq, dura = 0.1, vol = 0.05) { // Helper, extern available
    if (!audio_term) return
    if (!acx) acx = new AudioContext()
    const oscillator = acx.createOscillator()
    // console.log("Sig: "+sig+" Frq: "+frq);
    oscillator.frequency.value = frq
    const volume = acx.createGain()
    volume.gain.value = vol // Damit Startet
    volume.gain.exponentialRampToValueAtTime(vol / 5, acx.currentTime + dura) // Ziel nach duration
    oscillator.connect(volume)
    volume.connect(acx.destination)
    oscillator.type = 'square'
    oscillator.start()
    oscillator.stop(acx.currentTime + dura) // 1 sec Duration
  }

  //= ====== Extern use ==========
  async function userSendCmd(inpcmd, cmdtimeout) {
    const cmd = inpcmd.trim()
    terminalPrint('=> ' + cmd) // Extern
    blxErrMsg = 0

    if (cmd.startsWith('.')) await blxSysCmd(cmd.substring(1))
    else {
      if (cmdtimeout != undefined) await blxDeviceCmd(cmd, cmdtimeout)
      else await blxDeviceCmd(cmd) // use standard timeout
    }
    await blxCheckIDs()
    if (blxErrMsg) {
      terminalPrint(blxErrMsg)
      if (blxUserCB) blxUserCB('ERR', 0, blxErrMsg) // ERR Type 0 (nicht ausgewertet)
    }
  }
  // console.log("BLXPreInit") // Nur zu Info
  blxSetup()
  //= =========the API==========
  return {
    setTerminal: setTerminal,
    userSendCmd: async (inpcmd, cmdtimeout) => {
      await userSendCmd(inpcmd, cmdtimeout)
      if (blxErrMsg) throw blxErrMsg
      if (blxCmdBusy === true) throw new Error('*** BLX BUSY (Since ' + (Date.now() - blxCmdBusy_t0).toFixed(0) + ' msec) ***')
    },
    // Info-Functions:
    terminalPrint: terminalPrint,
    getDevice: () => blxIDs,
    getMemory: () => blxDataMem,
    getPinOK: () => blx_pin_ok,
    frq_ping: frq_ping,
    chordsound: chordsound,
    getCrc32: crc32Calc,
    IparamAddChannel: IparamAddChannel,
    CompactIparam: CompactIparam,
    IparamValidate: IparamValidateLTX_V1,
    SysParamValidate: SysParamValidateLTX_V1,
    version: VERSION,
  }
})()

{ // Trailer
  // Export for different module loaders and browser
  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports.blx = blx // es6 syntax -> this is the new one
  } else {
    if (typeof define === 'function' && define.amd) { // amd modules
      // eslint-disable-next-line no-undef
      define([], function () {
        return blx
      })
    } else { // Browser (with include script)
      window.blx = blx
    }
  }
}