// qrScanner.js - Handles QR code scanning logic

import * as apiHandler from './apiHandler.js'; // To initiate connection
import * as ui from './ui.js'; // To display messages and update UI state

// DOM Elements
const videoElement = document.getElementById('qrScanner');
const canvasElement = document.getElementById('qrCanvas');
const startScanButton = document.getElementById('startScan');
const cancelScanButton = document.getElementById('cancelScan');
const urlInput = document.getElementById('scannedUrl'); // To potentially populate the URL field

// Ensure canvas context is retrieved correctly
let canvasContext = null;
if (canvasElement) {
    canvasContext = canvasElement.getContext('2d', { willReadFrequently: true }); // Optimization hint
} else {
    console.error("QR Canvas element not found!");
}


let stream = null;
let animationFrameId = null;

export function startScan() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        ui.displayMessage('Camera access (getUserMedia) not supported by this browser.', 'error', 'apiEndpoint');
        return;
    }
     if (!canvasContext) {
        ui.displayMessage('Canvas context not available for QR scanning.', 'error', 'apiEndpoint');
        return;
    }
     if (!window.jsQR) {
         ui.displayMessage('jsQR library not loaded. Cannot scan.', 'error', 'apiEndpoint');
         return;
     }


    console.log("Starting QR code scan...");
    ui.displayMessage('Requesting camera access...', 'info', 'apiEndpoint');
    startScanButton.disabled = true;
    cancelScanButton.style.display = 'inline-block';
    videoElement.style.display = 'block';

    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then(handleStream)
        .catch(handleError);
}

function handleStream(mediaStream) {
    stream = mediaStream;
    videoElement.srcObject = stream;
    videoElement.setAttribute("playsinline", true); // Required to work on iOS Safari
    videoElement.play()
        .then(() => {
            console.log("Camera stream active and playing.");
            ui.displayMessage('Camera active. Point at QR code.', 'info', 'apiEndpoint');
            requestAnimationFrame(scanLoop);
        })
        .catch(error => {
             console.error("Error playing video stream:", error);
             ui.displayMessage(`Error starting camera stream: ${error.message}`, 'error', 'apiEndpoint');
             stopScan(false);
        });
}

function handleError(error) {
    console.error("Error accessing camera:", error);
    let message = `Camera Error: ${error.name}`;
    if (error.message) message += ` - ${error.message}`;
    ui.displayMessage(message, 'error', 'apiEndpoint');
    stopScan(false); // Stop scan without success message
}

function scanLoop() {
    if (!stream || !videoElement || videoElement.readyState !== videoElement.HAVE_ENOUGH_DATA || !canvasContext) {
        // If stream stopped or elements missing, cancel the loop
        if (animationFrameId) { // Check if loop is still supposed to be running
             console.warn("Scan loop cancelled due to missing stream or elements.");
             stopScan(false);
        }
        return;
    }

    try {
        // Set canvas size to match video element size
        if (canvasElement.height !== videoElement.videoHeight || canvasElement.width !== videoElement.videoWidth) {
            canvasElement.height = videoElement.videoHeight;
            canvasElement.width = videoElement.videoWidth;
             if(canvasElement.height === 0 || canvasElement.width === 0) {
                 console.warn("Video dimensions are zero, skipping frame.");
                 animationFrameId = requestAnimationFrame(scanLoop); // Try again next frame
                 return;
             }
        }


        // Draw video frame to canvas
        canvasContext.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

        // Get image data from canvas
        const imageData = canvasContext.getImageData(0, 0, canvasElement.width, canvasElement.height);

        // Use jsQR to detect QR code
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert", // Performance optimization
        });

        if (code && code.data) {
            console.log("QR Code detected:", code.data);
            handleCodeFound(code.data);
            // Exit loop once code is found and handled
        } else {
            // Continue loop if no code found
            animationFrameId = requestAnimationFrame(scanLoop);
        }
    } catch (error) {
        console.error("Error during QR scan loop:", error);
        ui.displayMessage('Error during scanning. See console.', 'error', 'apiEndpoint');
        stopScan(false); // Stop on error
    }
}

function handleCodeFound(url) {
    // Validate the URL format
    if (url && url.startsWith('https://eventsapi.chaturbate.com/events/')) {
        console.log("Valid Events API URL found:", url);
        ui.displayMessage('Valid QR code found! Connecting...', 'success', 'apiEndpoint');
        stopScan(true); // Stop scanning visuals successfully

        // Update the input field
        if (urlInput) {
            urlInput.value = url;
            urlInput.disabled = true; // Disable input after successful scan/connect
        }

        // Initiate connection using the scanned URL via apiHandler
        apiHandler.connectWithUrl(url);

    } else {
        console.warn("Invalid QR code data:", url);
        ui.displayMessage('Scanned code is not a valid Events API URL. Try again.', 'error', 'apiEndpoint');
        // Keep scanning - request another frame
        animationFrameId = requestAnimationFrame(scanLoop);
    }
}

export function stopScan(success = false) {
    console.log("Stopping QR code scan...");
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    if (videoElement) {
        videoElement.srcObject = null;
        videoElement.style.display = 'none';
    }
     if (canvasContext) {
        canvasContext.clearRect(0, 0, canvasElement.width, canvasElement.height); // Clear canvas
     }


    startScanButton.disabled = apiHandler.isApiConnected(); // Disable if already connected
    cancelScanButton.style.display = 'none';

    if (!success && !apiHandler.isApiConnected()) { // Only show cancelled message if not already connected
        ui.displayMessage('Scan cancelled.', 'info', 'apiEndpoint');
    }
}