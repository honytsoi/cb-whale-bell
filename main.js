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

async function initializeWithConfig(config) {
    try {
        // Initialize the UI with the loaded config
        ui.initializeUI(config);
        
        // Load users data
        await userManager.loadUsers();
        
        // Set up event listeners
        addEventListeners();
        
        // Update connection UI with initial state
        ui.updateConnectionUI(false, config.scannedUrl, config.broadcasterName, config);
        
        // Show main content
        const mainContent = document.getElementById('mainContent');
        if (mainContent) {
            mainContent.style.display = 'block';
        }
        
        // Hide setup required message
        const setupRequired = document.getElementById('setupRequired');
        if (setupRequired) {
            setupRequired.style.display = 'none';
        }
    } catch (error) {
        console.error('Error in initializeWithConfig:', error);
        displayError('Failed to initialize application', error);
        ui.showSetupRequired();
    }
}

async function initializeApp() {
    try {
        await db.open();
        console.log('Database opened successfully');

        const config = await configManager.loadConfig();
        console.log('Initial config loaded:', config);

        if (!config) {
            console.log('No configuration found - showing setup');
            const setupRequired = document.getElementById('setupRequired');
            if (setupRequired) {
                setupRequired.style.display = 'block';
            }
            return;
        }

        await initializeWithConfig(config);
    } catch (error) {
        console.error('Error during app initialization:', error);
        const setupRequired = document.getElementById('setupRequired');
        if (setupRequired) {
            setupRequired.style.display = 'block';
        }
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

// In the processEvent function
async function processEvent(event) {
    // ...existing code...
    if (event.method === 'follow' && config.showFollows) {
        const username = event.object?.user?.username;
        if (username) {
            await userManager.addEvent(username, 'follow', {
                timestamp: event.timestamp,
                object: event.object
            });
            ui.addLogEntry(`${username} followed`, 'follow');
        }
        return;
    }
    // ...existing code...
}

// --- Application Start ---

// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', initializeApp);