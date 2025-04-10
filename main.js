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
const connectUrlButton = document.getElementById('connectUrl');
const disconnectApiButton = document.getElementById('disconnectApi');
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
    startScanButton.addEventListener('click', () => QRScanner.startScan());
    cancelScanButton.addEventListener('click', () => QRScanner.stopScan(false));
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
document.addEventListener('DOMContentLoaded', () => {
    initApp().then(() => {
        addEventListeners();
    }).catch(error => {
        console.error('Failed to initialize application:', error);
        ui.displayMessage('Failed to initialize application. Please refresh the page.', 'error');
    });
});