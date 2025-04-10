// qrScanner.js - Handles QR code scanning logic

import * as apiHandler from './apiHandler.js';
import * as ui from './ui.js';

// QR Scanner implementation
export class QRScanner {
    static video = null;
    static canvas = null;
    static scanning = false;

    static initialize() {
        this.video = document.getElementById('qrScanner');
        this.canvas = document.getElementById('qrCanvas');
    }

    static async startScan() {
        try {
            this.video.style.display = 'block';
            document.getElementById('cancelScan').style.display = 'inline-block';
            document.getElementById('startScan').classList.add('loading');

            // Add overlay with scanning animation
            const overlay = document.createElement('div');
            overlay.className = 'qr-scanner-overlay';
            overlay.innerHTML = `
                <div class="scanning-line"></div>
                <div class="corner-marker top-left"></div>
                <div class="corner-marker top-right"></div>
                <div class="corner-marker bottom-left"></div>
                <div class="corner-marker bottom-right"></div>
            `;
            this.video.parentElement.appendChild(overlay);

            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                } 
            });
            
            this.video.srcObject = stream;
            this.video.play();
            this.scanning = true;
            this.scan();
        } catch (error) {
            console.error('Error accessing camera:', error);
            this.stopScan(true);
            throw new Error('Could not access camera. Please make sure you have granted camera permissions.');
        }
    }

    static stopScan(error = false) {
        this.scanning = false;
        if (this.video.srcObject) {
            this.video.srcObject.getTracks().forEach(track => track.stop());
        }
        this.video.style.display = 'none';
        document.getElementById('cancelScan').style.display = 'none';
        document.getElementById('startScan').classList.remove('loading');

        // Remove overlay if it exists
        const overlay = document.querySelector('.qr-scanner-overlay');
        if (overlay) {
            overlay.remove();
        }

        if (error) {
            // Visual feedback for error
            const startScanBtn = document.getElementById('startScan');
            startScanBtn.classList.add('error-shake');
            setTimeout(() => startScanBtn.classList.remove('error-shake'), 500);
        }
    }

    static scan() {
        if (!this.scanning) return;

        requestAnimationFrame(() => this.scan());

        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        const ctx = this.canvas.getContext('2d');
        ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

        try {
            const imageData = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);

            if (code) {
                this.stopScan();
                const urlInput = document.getElementById('setupScannedUrl'); // Use the same field for both scanning and manual entry
                urlInput.value = code.data;
                
                // Visual success feedback
                urlInput.classList.add('success-highlight');
                setTimeout(() => urlInput.classList.remove('success-highlight'), 2000);
                
                // Auto-connect after successful scan
                document.getElementById('connectUrl').click();
            }
        } catch (error) {
            console.error('QR scanning error:', error);
        }
    }
}