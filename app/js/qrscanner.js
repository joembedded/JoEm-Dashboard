// qrscanner.js - V1.0 (C)JoEmbedded.de 

/*
    qrscanner verwendet die BarcodeDetector API, ist aber Stand Anf. 2024 nur aauf Android vorhanden
    Ansonsten  Barcode Polyfill: - https://github.com/cozmo/jsQR  V1.4.0
    Cozmo QR: works so lala, but only for Text
    Distribute: uglifyjs --warn ./js/jsQR.js -m -c -o ./js/jsQR.min.js
    (Version: uglify-es 3.3.9 )
    src="./js/jsQR.js" : 250kB
    src="./js/jsQR.min.js" 130kB

    <script src="./js/jsQR.min.js"></script>
*/

class cozmoQR {
    constructor(setup) {
        this.setup = setup;
        this.icanvas = undefined
        this.ctxIntern = undefined
    }
    detect(src) {
        let ret = []
        //console.log(src.videoWidth, src.videoHeight)
        if (this.icanvas === undefined) {
            this.icanvas = new OffscreenCanvas(src.videoWidth, src.videoHeight);
            this.ctxIntern = this.icanvas.getContext("2d", { willReadFrequently: true })
        }
        this.ctxIntern.drawImage(src, 0, 0, src.videoWidth, src.videoHeight)
        let imageData = this.ctxIntern.getImageData(0, 0, this.icanvas.width, this.icanvas.height);
        let fcode = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
        })

        if (fcode) {  // Max. 1 Code per Run
            // console.log(fcode)
            let cp = []
            cp.push(fcode.location.topLeftCorner)
            cp.push(fcode.location.topRightCorner)
            cp.push(fcode.location.bottomRightCorner)
            cp.push(fcode.location.bottomLeftCorner)
            let reti = { rawValue: fcode.data, cornerPoints: cp }
            ret.push(reti)
        }
        return ret
    }
} // Ende class cozmoQR

// DOMs
let scanDialog
let videoQuelle
let scaledVideoCanvas
let camSelector
let btnTorch

function initQrCodeDOM() {
    try {
        scanDialog = document.getElementById("qrscanner-dialog")
        videoQuelle = document.getElementById("qroriginal-video")
        scaledVideoCanvas = document.getElementById("qrscaled-videocanvas")
        camSelector = document.getElementById("qrcam-selector")
        document.getElementById("qrscanner-btnClose").addEventListener("click", closeCam)
        btnTorch = document.getElementById("qrscanner-btnTorch")
        btnTorch.addEventListener("click", torchOnOff)
    } catch (err) {
        if (qrLogPrint) qrLogPrint(`ERROR(initCameras): ${err}`)
    }
}

let availableCameras = [] // Array mit allen verfuegbaren Kameras. Prioritaet auf Back
let camStream = undefined // Aktuell geoeffnete Kamera oder undefined

let torchFlag = false

let barcodeDetector = undefined
let barcodeScannerInit = false // Wenn true; verwendbar

// Setup
const camUpdateInterval = 50 // ms
let qrLogPrint = console.log //  z.B. print() oder console.log(), null, ...
export function setQrLogPrint(f) {
    qrLogPrint = f
}
let wakeLock = null

// Global Temporaries
let ctxCam = undefined // Context
let scaleWidth = 0
let scaleHeight = 0
let scaleVideo2Canvas = 0

// Results - Array of Objects (auch ignorierte)
let qrScanDialogOpen = false
export let scannedResults = []
export function clearScannedResults() {
    scannedResults = []
}

// Wertet Scanned Result aus - Return -1:Ignore,0:OkUndEnd,1:OkUndMehr
let scanCallback = function () { return 1 }
export function setScanCallback(f) {
    scanCallback = f
}

//--- init --- Muss nicht explizit aufgerufen werden, fordert aber ggfs. Permissions an
// Returns Error-String or undefined(=OK)
async function initCameras() {
    if (qrLogPrint) qrLogPrint("INFO: InitCamera")
    try {
        // DOM
        initQrCodeDOM()

        // Barcode-Teil
        if (!('BarcodeDetector' in window) ) {
            if(window.jdDebug !== undefined && window.jdDebug >1){
                if (qrLogPrint) qrLogPrint("ERROR: No Barcode API available, Use Polyfill!")
                window.BarcodeDetector = cozmoQR
            }else{
                const sres = "ERROR: No Barcode API available"
                if (qrLogPrint) qrLogPrint(sres)
                return sres
            }
        } else {
            if (qrLogPrint) qrLogPrint("Barcode API available!")
        }
        barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] }) // API: Empty: All formats, Cozmo: QR only

        // Kamera-Teil
        const permissionStatus = await navigator.permissions.query({ name: "camera" })
        if (permissionStatus.state == 'denied') throw ("Camera Access denied")
        if (permissionStatus.state !== 'granted') { // Testweise auf- und gleich wieder zumachen
            const hcam = await navigator.mediaDevices.getUserMedia({ 'video': true, 'audio': false })
            hcam.getTracks().forEach((track) => { track.stop(); }); // getVideoTracks()/getTracks()
        }

        const alldev = await navigator.mediaDevices.enumerateDevices()
        availableCameras = alldev.filter(device => device.kind === 'videoinput')
        if (!availableCameras.length) throw ("No Camera(s) available on this device")
        if (qrLogPrint) qrLogPrint(`Found ${availableCameras.length} Camera${(availableCameras.length > 1 ? 's' : '')}`)
        let selectedCameraIdx = 0
        let backcnt = 0
        let facecnt = 0
        availableCameras.forEach((e, idx) => {
            const newoption = document.createElement("option"); // Von file:// anscheinend keine labels..
            var camname = (e.label == '') ? '(Unknown)' : e.label
            if (qrLogPrint) qrLogPrint(`Camera${idx}: '${camname}'`)
            if (e.label.toLowerCase().includes('back')) {
                selectedCameraIdx = idx
                camname = 'Back'
                backcnt++
                if (backcnt > 1) camname += `(${backcnt})`
            }
            if (e.label.toLowerCase().includes('front')) {
                camname = 'Front'
                facecnt++
                if (facecnt > 1) camname += `(${facecnt})`
            }
            newoption.text = camname

            camSelector.add(newoption)
        })
        camSelector.selectedIndex = selectedCameraIdx
        // const supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
        // Nur zur Info: for (const constraint of Object.keys(supportedConstraints)) qrLogPrint(`INFO: Supported: ${constraint}`)

        camSelector.addEventListener("change", openSelectedCamera)
        screen.orientation.addEventListener("change", openSelectedCamera)
        barcodeScannerInit = true
    } catch (err) {
        if (qrLogPrint) qrLogPrint(`ERROR(initCameras): ${err}`)
        return err
    }
}

// Returns Error-String or undefined(=OK)
export async function openSelectedCamera() {
    if (!barcodeScannerInit) {
        const sres = await initCameras()
        if(typeof sres === 'string') return sres
    }
    if (qrLogPrint) qrLogPrint("INFO: OpenCamera")
    try {
        if (!availableCameras.length) throw ("No Camera(s) available on this device")

        qrScanDialogOpen = true
        scanDialog.showModal()

        const layoutViewport = window.visualViewport
        if (qrLogPrint) qrLogPrint(`Viewport: ${Math.floor(layoutViewport.width)}x${Math.floor(layoutViewport.height)}`)

        const selCam = camSelector.selectedIndex
        if (qrLogPrint) qrLogPrint(`Open Camera${selCam}: '${availableCameras[selCam].label}'`)
        if (camStream !== undefined) stopCam()
        const loadPromise = new Promise((resolve) => {
            videoQuelle.onloadeddata = resolve
        });

        camStream = await navigator.mediaDevices.getUserMedia({
            video: {
                deviceId: availableCameras[selCam].deviceId,
                // Default Canvas 640x480, Achtung: Wenn 'ideal' (optional) vorhanden: groesser/langsamer)
                /*
                width: { min: 640  }, 
                height: { min: 480 },
                */
                width: { min: 640, ideal: 1920 },
                height: { min: 480, ideal: 1080 },
            }
        })
        // console.log(camStream)
        // const track = camStream.getVideoTracks()[0];
        // track auch zum aendern von Sachen wie torch, siehe 
        // https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/applyConstraints#examples
        // und https://www.webrtc-developers.com/getusermedia-constraints-explained/#playing-with-constraints
        //console.log("Constraints: ", track.getConstraints())

        videoQuelle.srcObject = camStream
        videoQuelle.play()
        await loadPromise

        torchFlag = false
        // getVideoTracks()/getTracks() beides
        if (camStream.getVideoTracks()[0].getSettings().torch === undefined)
            btnTorch.style.display = "none"
        else
            btnTorch.style.display = "block"


        const { videoWidth, videoHeight } = videoQuelle
        const arcam = videoWidth / videoHeight // Aspect-Ration Quelle
        /* Bsp: Vp.h: 400 VideoHeight 480: sch-> 0.833,  Vp.w: 500 VideoWidth 640: scw -> 0.781, Min. relevant */
        const sch = layoutViewport.height / videoHeight
        const scw = layoutViewport.width / videoWidth

        let canvasMax = 0.8 // Auf max. 80% Viewport
        if (scw < sch) { // Breiter als hoch: Hoehe anpassen
            canvasMax *= layoutViewport.width
            scaleWidth = Math.floor(canvasMax)
            scaleHeight = Math.floor(canvasMax / arcam)
        } else { // Hoeher als breit: Hoehe anpassen
            canvasMax *= layoutViewport.height
            scaleHeight = Math.floor(canvasMax)
            scaleWidth = Math.floor(canvasMax * arcam)
        }
        scaledVideoCanvas.height = scaleHeight
        scaledVideoCanvas.width = scaleWidth
        scaleVideo2Canvas = scaleWidth / videoWidth

        if (qrLogPrint) qrLogPrint(`Camera: ${videoWidth}x${videoHeight} Pixels (Aspect-Ratio: ${arcam.toFixed(2)})`)
        if (qrLogPrint) qrLogPrint(`Canvas: ${scaleWidth}x${scaleHeight} Pixels`)

        ctxCam = scaledVideoCanvas.getContext("2d", { willReadFrequently: true })

        camWorkerCont = true
        camWorker()

        // WakeLock - Screen Dimming disablen
        if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen")
    } catch (err) {
        if (qrLogPrint) qrLogPrint(`ERROR(openSelectedCamera): ${err}`)
        return err
    }
}

let camWorkerCont = false
async function camWorker() {
    try {
        if (videoQuelle.videoWidth && videoQuelle.videoHeight) {
            const run_t0 = performance.now();
            const barcode = await barcodeDetector.detect(videoQuelle)
            ctxCam.drawImage(videoQuelle, 0, 0, scaleWidth, scaleHeight)
            if (barcode.length > 0) { // 1. Barcode analysieren. Kann mehrere finden!
                //console.log(barcode.length)
                ctxCam.lineWidth = 5
                barcode.every(async (b) => {
                    const rawstring = b.rawValue.replace(/(\r\n|\n|\r)/gm, " ");
                    if (rawstring !== '') { // only for readable codes!
                        scaledVideoCanvas.style.borderColor = 'darkgreen' // Found something
                        const fn = scannedResults.find((e) => { return e.qrValue === rawstring })
                        let qcol = 'red' // Assume Ignored
                        if (!fn) {
                            // Results: -1:Ignored, 0:AcceptedUndENde, 1:AcceptedAberNochMehrErlaubt 2:OrangeUndNochMehr undefined:diesenScanignorieren
                            let nqacc = await scanCallback(rawstring)
                            if (nqacc === undefined) return camWorkerCont
                            if( nqacc == 2) {
                                qcol = 'orange' 
                            } else  if (nqacc >= 0) {
                                if (qrLogPrint) qrLogPrint(`Scanned: '${rawstring}'`) // Nur 0,1 anzeigen
                                qcol = 'lime' // OK
                            } 
                            scannedResults.push({ qrValue: rawstring, t0: performance.now(), scnt: 0, accepted: nqacc, qcolor: qcol });
                            if (nqacc == 0) camWorkerCont = false // Sofort raus
                        } else { // Code already accepted: Keep GREEN for 1 sec
                            const age = performance.now() - fn.t0;
                            fn.scnt++;
                            qcol = fn.qcolor
                            if (age > 1000){ // Only New for 1 sec
                                if(fn.accepted == 2) qcol = 'chocolate'
                                else if(fn.accepted >= 0) qcol = 'darkgreen' 
                            }
                        } 
                        ctxCam.strokeStyle = qcol
                        const dbarcp = b.cornerPoints
                        // console.log(dbarcp)
                        ctxCam.beginPath();
                        dbarcp.forEach((e, idx) => {
                            const dx = e.x * scaleVideo2Canvas
                            const dy = e.y * scaleVideo2Canvas
                            if (!idx) ctxCam.moveTo(dx, dy)
                            else ctxCam.lineTo(dx, dy)
                        })
                        ctxCam.closePath()
                        ctxCam.stroke()
                    }
                    return camWorkerCont
                })
            } else scaledVideoCanvas.style.borderColor = 'darkgray'
            const runtime = performance.now() - run_t0
            // if (qrLogPrint) qrLogPrint(`Runtime: ${runtime.toFixed(1)} ms`)
            if (!camWorkerCont) { // AutoStop
                closeCam()
                return
            }
        }
    } catch (err) {
        if (qrLogPrint) qrLogPrint(`ERROR(camWorker): ${err}`)
        closeCam()
        return
    }
    setTimeout(camWorker, camUpdateInterval)
}

function stopCam() {
    if (camStream === undefined) return
    if (qrLogPrint) qrLogPrint("INFO: CloseCamera")
    try {
        camStream.getTracks().forEach((track) => { // getVideoTracks()/getTracks()
            track.stop();
        });
        if (wakeLock) wakeLock.release().then(() => { wakeLock = null })
    } catch (err) {
        if (qrLogPrint) qrLogPrint(`ERROR(stopCam): ${err}`)
    }

    videoQuelle.srcObject = null;
    camStream = undefined
}

function closeCam() {
    stopCam()
    scanDialog.close()
    qrScanDialogOpen = false
}

async function torchOnOff() {
    torchFlag = !torchFlag
    const videoTrack = camStream.getVideoTracks()[0]; // getVideoTracks()/getTracks()
    await videoTrack.applyConstraints({ torch: torchFlag });
    if (qrLogPrint) qrLogPrint("Torch: " + torchFlag + ": " + videoTrack.getSettings().torch)
}

async function qrSleepMs(ms = 1) { // use: await qrSleepMs()
    let np = new Promise(resolve => setTimeout(resolve, ms))
    return np;
}
export async function scannerBusy() {
    for (; ;) { // Poll reply in 10 ms steps
        if (qrScanDialogOpen !== true) break
        await qrSleepMs(50)
    }
}
console.log("Qrscanner")

// ***
