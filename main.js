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
    let dbOpenedSuccessfully = false;
    try {
        // Attempt to open the database
        console.log("Attempting to open IndexedDB...");
        await db.open();
        console.log('IndexedDB connection established.');
        dbOpenedSuccessfully = true;
    } catch (error) {
        console.error('Initial db.open() failed:', error);
        // Check if it's the specific upgrade error preventing primary key change
        // Dexie might wrap the error, so check inner errors or message content
        const errorString = String(error?.inner || error);
        if (error.name === 'UpgradeError' || errorString.includes("changing primary key")) {
            console.warn("Database upgrade failed due to schema incompatibility (likely v1 -> v2 primary key change). Deleting and recreating database...");
            ui.displayMessage("Upgrading database structure (v1->v2). Existing data will be cleared. Please re-import CSV after initialization.", "warning", "dataManagementResult", 15000); // Inform user
            try {
                await db.delete();
                console.log("Old database deleted successfully.");
                // Retry opening the database, which will now create it fresh with v2 schema
                console.log("Retrying db.open() to create fresh database...");
                await db.open();
                console.log("Fresh IndexedDB connection established with new schema.");
                dbOpenedSuccessfully = true;
            } catch (deleteOrReopenError) {
                console.error("Failed to delete and reopen database after upgrade error:", deleteOrReopenError);
                ui.displayMessage('CRITICAL ERROR: Failed to recreate database after upgrade attempt. Please clear site data manually and refresh.', 'error');
                // Prevent further initialization
                return;
            }
        } else {
            // Handle other potential db.open() errors
            ui.displayMessage('Failed to open database. Please refresh the page or clear site data.', 'error');
             // Prevent further initialization
            return;
        }
    }

    // Proceed with initialization only if DB opened successfully
    if (dbOpenedSuccessfully) {
        try {
            console.log("Proceeding with application initialization...");
            // Initialize modules
            await configManager.loadConfig(); // Loads config or sets defaults
            await userManager.loadUsers();    // Loads users (will be empty on fresh DB)

            // Prune old events on startup (will do nothing on fresh DB)
            await dataManager.pruneOldEvents();

            // Initialize UI and other components
            ui.initializeUI();
            apiHandler.initializeAPI();
            QRScanner.initialize();
            console.log("Application initialization complete.");
        } catch (initError) {
             console.error('Error during application initialization after DB open:', initError);
             ui.displayMessage('Error initializing application components after DB setup. Please refresh.', 'error');
        }
    } else {
         console.error("Database was not opened successfully. Halting initialization.");
         // UI message handled in the catch blocks above
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