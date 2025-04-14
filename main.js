// Import necessary modules
import db from './db.js';
import * as userManager from './userManager.js';
import * as configManager from './config.js';
import * as apiHandler from './apiHandler.js';
import * as ui from './ui.js';
import * as dataManager from './dataManager.js';
import { QRScanner } from './qrScanner.js';
import { displayError } from './utils.js'; // Import specific utilities if needed

// DOM Elements
const settingsButton = document.getElementById('settingsButton');
const saveConfigButton = document.getElementById('saveConfig');
const importTokenHistoryButton = document.getElementById('importTokenHistoryButton');
const tokenHistoryFile = document.getElementById('tokenHistoryFile');
const importDataButton = document.getElementById('importDataButton');
const importDataFile = document.getElementById('importDataFile');
const startScanButton = document.getElementById('startScan');
const cancelScanButton = document.getElementById('cancelScan');
// const connectUrlButton = document.getElementById('connectUrl'); // Replaced by toggle
// const disconnectApiButton = document.getElementById('disconnectApi'); // Replaced by toggle
const connectionSwitch = document.getElementById('connectionSwitch'); // Get the toggle checkbox
const exportDataButton = document.getElementById('exportDataButton');
const factoryResetButton = document.getElementById('factoryReset');
const suggestThresholdsButton = document.getElementById('suggestThresholds');
const testSoundButton = document.getElementById('testSound');
const enablePasswordCheckbox = document.getElementById('enablePassword');

// --- Initial Setup ---

async function initApp() {
    try {
        // Open database connection
        await db.open();
        console.log('IndexedDB connection established');

        // Initialize modules
        await configManager.loadConfig();
        await userManager.loadUsers();

        // Prune old events on startup
        await dataManager.pruneOldEvents();
        
        // Initialize UI and other components
        ui.initializeUI();
        apiHandler.initializeAPI();
        QRScanner.initialize();

    } catch (error) {
        console.error('Failed to initialize application:', error);
        ui.displayMessage('Failed to initialize application. Please refresh the page.', 'error');
    }
}

// --- Event Listeners ---

function addEventListeners() {
    settingsButton.addEventListener('click', ui.toggleSettingsPanel);

    saveConfigButton.addEventListener('click', () => {
        try {
            configManager.saveConfig();
            ui.displayMessage('Configuration saved.', 'success', 'dataManagementResult');
            // Update the connection toggle UI based on the newly saved config
            const currentConfig = configManager.getConfig();
            // Assume disconnected status unless actively connected (which save doesn't change)
            const currentStatus = apiHandler.isApiConnected();
            ui.updateConnectionUI(currentStatus, currentConfig.scannedUrl, currentConfig.broadcasterName, currentConfig);
        } catch (error) {
            displayError("Failed to save config", error);
            ui.displayMessage(`Error saving config: ${error.message}`, 'error', 'dataManagementResult');
        }
    });

    // --- Data Management Listeners ---
    importTokenHistoryButton.addEventListener('click', () => tokenHistoryFile.click());
    tokenHistoryFile.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            dataManager.handleTokenHistoryImport(file);
            tokenHistoryFile.value = ''; // Reset file input
        }
    });

    importDataButton.addEventListener('click', () => importDataFile.click());
    importDataFile.addEventListener('change', (event) => {
         const file = event.target.files[0];
        if (file) {
            dataManager.handleDataImport(event); // Pass the event itself
            importDataFile.value = ''; // Reset file input
        }
    });

    exportDataButton.addEventListener('click', dataManager.exportData);
    factoryResetButton.addEventListener('click', dataManager.factoryReset);
    enablePasswordCheckbox.addEventListener('change', ui.togglePasswordInput);

    // --- Connection Toggle Listener ---
    if (connectionSwitch) {
        connectionSwitch.addEventListener('change', () => {
            const isChecked = connectionSwitch.checked;
            const config = configManager.getConfig();

            if (isChecked) {
                // --- Attempting to Connect ---
                console.log("Connection toggle switched ON");
                if (config.scannedUrl) {
                    // URL exists, proceed with connection attempt
                    ui.updateConnectionUI('connecting', config.scannedUrl, null, config); // Show connecting state immediately
                    apiHandler.connectWithUrl(config.scannedUrl);
                } else {
                    // No URL configured - Guide user to settings
                    console.log("Connect attempt failed: No API URL configured.");
                    // Prevent toggle from staying checked
                    connectionSwitch.checked = false;
                    // Update UI to reflect disconnected state and reason
                    ui.updateConnectionUI(false, null, null, config);
                    // Provide feedback
                    ui.displayMessage("Please configure API Endpoint in Settings first.", "error", "connectionToggleStatusText", 4000); // Display near toggle

                    // Open settings panel and focus the input
                    const settingsPanel = document.getElementById('settingsPanel');
                    if (settingsPanel.style.display === 'none') {
                        ui.toggleSettingsPanel();
                    }
                    // Use setTimeout to ensure panel is visible before focusing
                    setTimeout(() => {
                        const urlInput = document.getElementById('scannedUrl');
                        if (urlInput) {
                            urlInput.focus();
                            urlInput.select(); // Select existing text if any
                        }
                    }, 100); // Small delay
                }
            } else {
                // --- Attempting to Disconnect ---
                console.log("Connection toggle switched OFF");
                apiHandler.disconnect();
            }
        });
    } else {
        console.error("Connection switch element not found!");
    }

    // --- Settings Panel API Config Listeners ---
    startScanButton.addEventListener('click', () => QRScanner.startScan());
    cancelScanButton.addEventListener('click', () => QRScanner.stopScan(false));
    // QRScanner.handleCodeFound now just updates the input field value (handled in qrScanner.js).
    // connectUrlButton listener removed.
    // disconnectApiButton listener removed.

    // --- Other Settings Listeners ---
    suggestThresholdsButton.addEventListener('click', configManager.suggestThresholds);
    testSoundButton.addEventListener('click', ui.testSound);

}

// --- Application Start ---

// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    initApp().then(() => {
        addEventListeners();
    }).catch(error => {
        console.error('Failed to initialize application:', error);
        ui.displayMessage('Failed to initialize application. Please refresh the page.', 'error');
    });
});