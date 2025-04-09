// Import necessary modules
import * as configManager from './config.js';
import * as userManager from './userManager.js';
import * as apiHandler from './apiHandler.js';
import * as ui from './ui.js';
import * as dataManager from './dataManager.js';
import * as qrScanner from './qrScanner.js';
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
const connectUrlButton = document.getElementById('connectUrl');
const disconnectApiButton = document.getElementById('disconnectApi');
const exportDataButton = document.getElementById('exportDataButton');
const factoryResetButton = document.getElementById('factoryReset');
const suggestThresholdsButton = document.getElementById('suggestThresholds');
const testSoundButton = document.getElementById('testSound');
const enablePasswordCheckbox = document.getElementById('enablePassword');

// --- Initial Setup ---

function initializeApp() {
    console.log("Initializing Whale Bell...");
    try {
        // Load configuration first
        configManager.initConfig(); // Loads config and populates UI via ui.populateSettings

        // Load user data
        userManager.loadUsers();

        // Initialize UI elements (like hiding panels, setting initial states)
        ui.initializeUI(); // Sets initial UI states
        ui.updateConnectionStatus(false); // Set initial disconnected status

        // Add event listeners
        addEventListeners();

        console.log("Whale Bell Initialized.");
    } catch (error) {
        displayError("Initialization failed", error);
        ui.displayMessage("Application failed to initialize. Check console for errors.", "error", "dataManagementResult");
    }
}

// --- Event Listeners ---

function addEventListeners() {
    settingsButton.addEventListener('click', ui.toggleSettingsPanel);

    saveConfigButton.addEventListener('click', () => {
        try {
            configManager.saveConfig();
            ui.displayMessage('Configuration saved.', 'success', 'dataManagementResult');
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

    // --- API Connection Listeners ---
    startScanButton.addEventListener('click', qrScanner.startScan);
    cancelScanButton.addEventListener('click', () => qrScanner.stopScan(false)); // Explicitly pass false for cancellation
    connectUrlButton.addEventListener('click', () => {
        const urlInput = document.getElementById('scannedUrl');
        apiHandler.connectWithUrl(urlInput?.value);
    });
    disconnectApiButton.addEventListener('click', apiHandler.disconnect);

    // --- Other Settings Listeners ---
    suggestThresholdsButton.addEventListener('click', configManager.suggestThresholds);
    testSoundButton.addEventListener('click', ui.testSound);

}

// --- Application Start ---

// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', initializeApp);