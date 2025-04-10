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
        console.log('Initializing application...');

        // Open database connection
        console.log('Opening IndexedDB connection...');
        await db.open();
        console.log('IndexedDB connection established');

        // Load configuration
        console.log('Loading configuration...');
        await configManager.loadConfig();
        console.log('Configuration loaded');

        // Load users
        console.log('Loading users...');
        await userManager.loadUsers();
        console.log('Users loaded');

        // Initialize UI and other components
        console.log('Initializing UI...');
        ui.initializeUI();
        console.log('UI initialized');

        console.log('Initializing API handler...');
        apiHandler.initializeAPI();
        console.log('API handler initialized');

        console.log('Initializing QR Scanner...');
        QRScanner.initialize();
        console.log('QR Scanner initialized');

        console.log('Adding keyboard shortcuts...');
        addKeyboardShortcuts();
        console.log('Keyboard shortcuts added');

        console.log('Application initialized successfully');
    } catch (error) {
        console.error('Failed to initialize application:', error);
        ui.displayMessage('Failed to initialize application. Please refresh the page.', 'error');
    }
}

// --- Setup Wizard Event Listeners ---
function addSetupWizardListeners() {
    document.querySelectorAll('.next-step').forEach(button => {
        button.addEventListener('click', () => {
            ui.setupNextStep();
        });
    });

    document.querySelectorAll('.skip-step').forEach(button => {
        button.addEventListener('click', () => {
            ui.setupSkipStep();
        });
    });

    // Removed setup-specific listener for importTokenHistoryButton

    // Handle setup-specific threshold suggestions
    const setupSuggestButton = document.querySelector('.setup-step[data-step="3"] #suggestThresholds');
    if (setupSuggestButton) {
        setupSuggestButton.addEventListener('click', async () => {
            await suggestThresholds();
        });
    }

    // Handle setup-specific QR scanner
    const setupScanButton = document.querySelector('.setup-step[data-step="4"] #startScan');
    if (setupScanButton) {
        setupScanButton.addEventListener('click', () => {
            const urlInput = document.getElementById('setupScannedUrl');
            const urlValue = urlInput?.value?.trim(); // Ensure value is trimmed and not empty
            if (!urlValue) {
                ui.displayMessage('Please enter a valid URL.', 'error');
                return;
            }
            apiHandler.connectWithUrl(urlValue);
        });
    }
}

// --- Event Listeners ---
function addEventListeners() {
    // Add setup wizard listeners
    addSetupWizardListeners();

    // Existing event listeners
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
    importTokenHistoryButton.addEventListener('click', (event) => {
        console.log('[DEBUG] Import button clicked, event:', { 
            type: event.type, 
            detail: event.detail, 
            target: event.target.id,
            timestamp: new Date().toISOString()
        });
        tokenHistoryFile.click();
    });
    
    tokenHistoryFile.addEventListener('change', (event) => {
        console.log('[DEBUG] File input change event:', {
            type: event.type,
            files: event.target.files?.length,
            fileName: event.target.files?.[0]?.name,
            inputId: event.target.id,
            timestamp: new Date().toISOString()
        });
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
        const urlInput = document.getElementById('setupScannedUrl'); // Use the manual URL input field
        const urlValue = urlInput?.value?.trim(); // Ensure value is trimmed and not empty
        if (!urlValue) {
            ui.displayMessage('Please enter a valid URL.', 'error');
            return;
        }
        apiHandler.connectWithUrl(urlValue);
    });
    disconnectApiButton.addEventListener('click', apiHandler.disconnect);

    // --- Other Settings Listeners ---
    suggestThresholdsButton.addEventListener('click', configManager.suggestThresholds);
    testSoundButton.addEventListener('click', ui.testSound);

    // Add new UI update listeners
    window.addEventListener('thresholdUpdate', () => {
        ui.updateThresholdDisplay();
    });

    window.addEventListener('statsUpdate', () => {
        ui.updateWhaleStats();
    });


    // Add settings tab listeners
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            button.classList.add('active');
            document.getElementById(tabId + 'Settings').classList.add('active');
        });
    });
}

// --- Application Start ---

// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    initApp().then(() => {
        addEventListeners();
        
        // Check if first-time setup is needed
        const setupCompleted = localStorage.getItem('setupCompleted');
        if (!setupCompleted) {
            ui.showSetupWizard();
        }
    }).catch(error => {
        console.error('Failed to initialize application:', error);
        ui.displayMessage('Failed to initialize application. Please refresh the page.', 'error');
    });
});

// --- Connection Handling ---

async function connectToEventsAPI(url) {
    try {
        ui.updateConnectionStatus('connecting');
        // ... existing connection code ...
    } catch (error) {
        console.error('Failed to connect to Events API:', error);
        ui.updateConnectionStatus(false);
        ui.displayMessage('Failed to connect to Events API. Please try again.', 'error');
    }
}

// --- Threshold Management ---

async function suggestThresholds() {
    try {
        // Implement threshold suggestion logic based on imported data
        const suggestions = await dataManager.suggestThresholds();
        if (suggestions) {
            Object.entries(suggestions).forEach(([key, value]) => {
                const input = document.getElementById(key);
                if (input) {
                    input.value = value;
                }
            });
            ui.displayMessage('Thresholds suggested based on your history!', 'success');
        }
    } catch (error) {
        console.error('Failed to suggest thresholds:', error);
        ui.displayMessage('Failed to suggest thresholds. Using default values.', 'error');
    }
}

// --- Keyboard Shortcuts ---
function addKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
        // Only handle shortcuts if not in an input field
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }

        // Ctrl/Cmd + Shortcuts
        if (event.ctrlKey || event.metaKey) {
            switch (event.key.toLowerCase()) {
                case ',':  // Ctrl/Cmd + , for Settings
                    event.preventDefault();
                    ui.toggleSettingsPanel();
                    break;
                case 's':  // Ctrl/Cmd + S for Save Config
                    event.preventDefault();
                    configManager.saveConfig();
                    break;
                case 'i':  // Ctrl/Cmd + I for Import
                    event.preventDefault();
                    document.getElementById('tokenHistoryFile').click();
                    break;
                case 'e':  // Ctrl/Cmd + E for Export
                    event.preventDefault();
                    dataManager.exportData();
                    break;
            }
            return;
        }

        // Single key shortcuts (when not using Ctrl/Cmd)
        switch (event.key.toLowerCase()) {
            case ' ':  // Space to Start/Stop Monitoring
                event.preventDefault();
                const startButton = document.getElementById('startMonitoring');
                const stopButton = document.getElementById('stopMonitoring');
                if (startButton.style.display !== 'none') {
                    startButton.click();
                } else if (stopButton.style.display !== 'none') {
                    stopButton.click();
                }
                break;
            case 'escape':  // Escape to close settings panel
                if (settingsPanel.style.display !== 'none') {
                    ui.toggleSettingsPanel();
                }
                break;
        }
    });

    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + , to toggle settings
        if ((e.ctrlKey || e.metaKey) && e.key === ',') {
            e.preventDefault();
            toggleSettingsPanel();
        }
    });
}