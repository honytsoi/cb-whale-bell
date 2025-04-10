// qrScanner.js - Handles QR code scanning logic

import * as apiHandler from './apiHandler.js';
import * as ui from './ui.js';

// Create a QRScanner object to export
export const QRScanner = {
    stream: null,
    animationFrameId: null,
    canvasContext: null,
    videoElement: null,
    canvasElement: null,
    startScanButton: null,
    cancelScanButton: null,
    urlInput: null,

    initialize() {
        // Initialize DOM elements
        this.videoElement = document.getElementById('qrScanner');
        this.canvasElement = document.getElementById('qrCanvas');
        this.startScanButton = document.getElementById('startScan');
        this.cancelScanButton = document.getElementById('cancelScan');
        this.urlInput = document.getElementById('scannedUrl');

        // Initialize canvas context
        if (this.canvasElement) {
            this.canvasContext = this.canvasElement.getContext('2d', { willReadFrequently: true });
        } else {
            console.error("QR Canvas element not found!");
        }
    },

    startScan() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            ui.displayMessage('Camera access (getUserMedia) not supported by this browser.', 'error', 'apiEndpoint');
            return;
        }
        if (!QRScanner.canvasContext) {
            ui.displayMessage('Canvas context not available for QR scanning.', 'error', 'apiEndpoint');
            return;
        }
        if (!window.jsQR) {
            ui.displayMessage('jsQR library not loaded. Cannot scan.', 'error', 'apiEndpoint');
            return;
        }

        console.log("Starting QR code scan...");
        ui.displayMessage('Requesting camera access...', 'info', 'apiEndpoint');
        QRScanner.startScanButton.disabled = true;
        QRScanner.cancelScanButton.style.display = 'inline-block';
        QRScanner.videoElement.style.display = 'block';

        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then(QRScanner.handleStream)
            .catch(QRScanner.handleError);
    },

    handleStream(mediaStream) {
        QRScanner.stream = mediaStream;
        QRScanner.videoElement.srcObject = mediaStream;
        QRScanner.videoElement.setAttribute("playsinline", true);
        QRScanner.videoElement.play()
            .then(() => {
                console.log("Camera stream active and playing.");
                ui.displayMessage('Camera active. Point at QR code.', 'info', 'apiEndpoint');
                requestAnimationFrame(QRScanner.scanLoop);
            })
            .catch(error => {
                console.error("Error playing video stream:", error);
                ui.displayMessage(`Error starting camera stream: ${error.message}`, 'error', 'apiEndpoint');
                QRScanner.stopScan(false);
            });
    },

    handleError(error) {
        console.error("Error accessing camera:", error);
        let message = `Camera Error: ${error.name}`;
        if (error.message) message += ` - ${error.message}`;
        ui.displayMessage(message, 'error', 'apiEndpoint');
        QRScanner.stopScan(false);
    },

    scanLoop() {
        if (!QRScanner.stream || !QRScanner.videoElement || 
            QRScanner.videoElement.readyState !== QRScanner.videoElement.HAVE_ENOUGH_DATA || 
            !QRScanner.canvasContext) {
            if (QRScanner.animationFrameId) {
                console.warn("Scan loop cancelled due to missing stream or elements.");
                QRScanner.stopScan(false);
            }
            return;
        }

        try {
            if (QRScanner.canvasElement.height !== QRScanner.videoElement.videoHeight || 
                QRScanner.canvasElement.width !== QRScanner.videoElement.videoWidth) {
                QRScanner.canvasElement.height = QRScanner.videoElement.videoHeight;
                QRScanner.canvasElement.width = QRScanner.videoElement.videoWidth;
                if(QRScanner.canvasElement.height === 0 || QRScanner.canvasElement.width === 0) {
                    console.warn("Video dimensions are zero, skipping frame.");
                    QRScanner.animationFrameId = requestAnimationFrame(QRScanner.scanLoop);
                    return;
                }
            }

            QRScanner.canvasContext.drawImage(QRScanner.videoElement, 0, 0, 
                QRScanner.canvasElement.width, QRScanner.canvasElement.height);

            const imageData = QRScanner.canvasContext.getImageData(0, 0, 
                QRScanner.canvasElement.width, QRScanner.canvasElement.height);

            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert"
            });

            if (code && code.data) {
                console.log("QR Code detected:", code.data);
                QRScanner.handleCodeFound(code.data);
            } else {
                QRScanner.animationFrameId = requestAnimationFrame(QRScanner.scanLoop);
            }
        } catch (error) {
            console.error("Error during QR scan loop:", error);
            ui.displayMessage('Error during scanning. See console.', 'error', 'apiEndpoint');
            QRScanner.stopScan(false);
        }
    },

    handleCodeFound(url) {
        if (url && url.startsWith('https://eventsapi.chaturbate.com/events/')) {
            console.log("Valid Events API URL found:", url);
            ui.displayMessage('Valid QR code found! Connecting...', 'success', 'apiEndpoint');
            QRScanner.stopScan(true);

            if (QRScanner.urlInput) {
                QRScanner.urlInput.value = url;
                QRScanner.urlInput.disabled = true;
            }

            apiHandler.connectWithUrl(url);
        } else {
            console.warn("Invalid QR code data:", url);
            ui.displayMessage('Scanned code is not a valid Events API URL. Try again.', 'error', 'apiEndpoint');
            QRScanner.animationFrameId = requestAnimationFrame(QRScanner.scanLoop);
        }
    },

    stopScan(success = false) {
        console.log("Stopping QR code scan...");
        if (QRScanner.animationFrameId) {
            cancelAnimationFrame(QRScanner.animationFrameId);
            QRScanner.animationFrameId = null;
        }
        if (QRScanner.stream) {
            QRScanner.stream.getTracks().forEach(track => track.stop());
            QRScanner.stream = null;
        }
        if (QRScanner.videoElement) {
            QRScanner.videoElement.srcObject = null;
            QRScanner.videoElement.style.display = 'none';
        }
        if (QRScanner.canvasContext) {
            QRScanner.canvasContext.clearRect(0, 0, QRScanner.canvasElement.width, QRScanner.canvasElement.height);
        }

        QRScanner.startScanButton.disabled = apiHandler.isApiConnected();
        QRScanner.cancelScanButton.style.display = 'none';

        if (!success && !apiHandler.isApiConnected()) {
            ui.displayMessage('Scan cancelled.', 'info', 'apiEndpoint');
        }
    }
};