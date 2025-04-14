// ui.js - Manages UI updates and interactions

import * as configManager from './config.js'; // Import config to get values
import { displayError } from './utils.js';

// --- Web Audio API Setup ---
let audioContext = null;
try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    console.log("AudioContext initialized.");
} catch (e) {
    console.error("Web Audio API is not supported in this browser.", e);
    displayError("Web Audio API not supported. Sounds disabled.");
}

// --- DOM Element References ---
// --- DOM Element References ---
// Header Elements
const connectionSwitchCheckbox = document.getElementById('connectionSwitch');
const connectionToggleStatusText = document.getElementById('connectionToggleStatusText');
// Other elements
// const connectionStatusElement = document.getElementById('connectionStatus'); // Removed old status element
const settingsPanel = document.getElementById('settingsPanel');
const activityLogElement = document.getElementById('activityLog');
const dataManagementResultElement = document.getElementById('dataManagementResult');
const apiEndpointResultElement = document.getElementById('apiEndpointResult'); // Renamed in HTML
const broadcasterNameDisplayElement = document.getElementById('broadcasterNameDisplay');
const passwordInput = document.getElementById('dataPassword');
const enablePasswordCheckbox = document.getElementById('enablePassword');
const mergeDataCheckbox = document.getElementById('mergeData');

// Settings Input Fields
const lifetimeSpendingThresholdInput = document.getElementById('lifetimeSpendingThreshold');
const recentTipThresholdInput = document.getElementById('recentTipThreshold');
const recentTipTimeframeInput = document.getElementById('recentTipTimeframe');
const recentLargeTipThresholdInput = document.getElementById('recentLargeTipThreshold');
const recentPrivateThresholdInput = document.getElementById('recentPrivateThreshold');
const recentPrivateTimeframeInput = document.getElementById('recentPrivateTimeframe');
const totalPrivatesThresholdInput = document.getElementById('totalPrivatesThreshold');
const totalLifetimeTipsThresholdInput = document.getElementById('totalLifetimeTipsThreshold');
const bellSoundSelect = document.getElementById('bellSound'); // Keep for potential future file options? Or remove? Removing for now.
const testSoundButton = document.getElementById('testSound'); // Keep test button

// Current Thresholds Display
const currentThresholdsDisplay = document.getElementById('currentThresholds');


// --- Sound Generation ---
function playNotificationSound() {
    if (!audioContext) {
        console.warn("Cannot play sound, AudioContext not available.");
        return;
    }
     // Simple bell-like sound
    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = 'triangle'; // Triangle wave often sounds bell-like
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5 note

        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime); // Start fairly loud
        // Exponential decay for bell sound
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.8);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.8); // Stop after 0.8 seconds
        console.log("Playing notification sound.");
    } catch (error) {
        console.error("Error playing Web Audio sound:", error);
        displayError("Error playing sound.");
    }
}


// --- UI Update Functions ---

// Consolidated function to update ALL connection-related UI elements
export function updateConnectionUI(status, apiUrl = null, broadcaster = null, config = null) {
    const currentConfig = config || configManager.getConfig(); // Get config if not passed
    const savedUrl = apiUrl || currentConfig.scannedUrl;

    console.log(`Updating Connection UI (Toggle): Status=${status}, SavedURL=${!!savedUrl}, Broadcaster=${broadcaster}`);

    let toggleChecked = false;
    let toggleDisabled = false;
    let statusText = 'Disconnected';
    let statusColor = 'salmon'; // Or header color

    if (status === 'connecting') {
        toggleChecked = true; // Visually show 'on' but disable interaction
        toggleDisabled = true;
        statusText = 'Connecting...';
        statusColor = 'orange';
    } else if (status === true) { // Connected
        toggleChecked = true;
        toggleDisabled = false; // Enable to allow disconnect
        statusText = `Connected: ${broadcaster || 'Unknown'}`;
        statusColor = 'lightgreen';
    } else { // Disconnected or Error (status is false or other)
        toggleChecked = false;
        toggleDisabled = !savedUrl; // Disable toggle if no URL is configured
        statusText = 'Disconnected';
        statusColor = 'salmon'; // Or header default color
        if (!savedUrl) {
            statusText = 'Setup Required'; // More specific if no URL
        }
    }

    // Update Toggle Switch State
    if (connectionSwitchCheckbox) {
        connectionSwitchCheckbox.checked = toggleChecked;
        connectionSwitchCheckbox.disabled = toggleDisabled;
    }
    if (connectionToggleStatusText) {
        connectionToggleStatusText.textContent = statusText;
        connectionToggleStatusText.style.color = statusColor; // Apply color to text
    }

    // Update Settings Panel Displays (if needed)
    // Keep existing logic for apiEndpointResultElement, broadcasterNameDisplayElement if desired
    if (apiEndpointResultElement) {
        apiEndpointResultElement.textContent = status === true ? `Connected to: ${savedUrl || 'Unknown URL'}` : '';
    }
     if (broadcasterNameDisplayElement) {
        broadcasterNameDisplayElement.textContent = status === true ? `Broadcaster: ${broadcaster || 'Unknown'}` : '';
    }
}

export function toggleSettingsPanel() {
    const isHidden = settingsPanel.style.display === 'none';
    settingsPanel.style.display = isHidden ? 'block' : 'none';
    console.log(`Settings panel ${isHidden ? 'shown' : 'hidden'}`);
    if (isHidden) {
        populateSettings(); // Refresh settings display when shown
    }
}

export function displayMessage(message, type = 'info', elementId = 'dataManagementResult', durationMs = 5000) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.className = type;
        if (durationMs > 0) {
            setTimeout(() => {
                if (element.textContent === message) { element.textContent = ''; element.className = ''; }
            }, durationMs);
        }
    } else {
        console.warn(`UI element with ID "${elementId}" not found for message:`, message);
        alert(`${type.toUpperCase()}: ${message}`);
    }
}

export function populateSettings() {
    console.log("Populating settings UI from config...");
    try {
        const config = configManager.getConfig();

        lifetimeSpendingThresholdInput.value = config.lifetimeSpendingThreshold ?? '';
        recentTipThresholdInput.value = config.recentTipThreshold ?? '';
        recentTipTimeframeInput.value = config.recentTipTimeframe ?? '';
        recentLargeTipThresholdInput.value = config.recentLargeTipThreshold ?? '';
        recentPrivateThresholdInput.value = config.recentPrivateThreshold ?? '';
        recentPrivateTimeframeInput.value = config.recentPrivateTimeframe ?? '';
        totalPrivatesThresholdInput.value = config.totalPrivatesThreshold ?? '';
        totalLifetimeTipsThresholdInput.value = config.totalLifetimeTipsThreshold ?? '';
        // bellSoundSelect.value = config.bellSound || 'default_bell.mp3'; // Removed select

        // Populate the new retention days field
        const retentionDaysInput = document.getElementById('recentEventRetentionDays');
        if (retentionDaysInput) {
            retentionDaysInput.value = config.recentEventRetentionDays ?? 30; // Default to 30 if missing
        }

        // Also populate the scannedUrl input field in settings
        const scannedUrlInput = document.getElementById('scannedUrl');
        if (scannedUrlInput) {
            scannedUrlInput.value = config.scannedUrl || '';
        }

        if (currentThresholdsDisplay) {
             currentThresholdsDisplay.innerHTML = `
                <h3>Current Whale Thresholds</h3>
                <p>Lifetime: ${config.lifetimeSpendingThreshold}</p>
                <p>Recent Tip: ${config.recentTipThreshold} (last ${config.recentTipTimeframe}s)</p>
                <p>Recent Private: ${config.recentPrivateThreshold} (last ${config.recentPrivateTimeframe}s)</p>
                <!-- Add others as needed -->
            `;
        }
    } catch (error) {
        displayError("Failed to populate settings UI", error);
    }
}

export function addLogEntry(message, type = 'info') {
    const li = document.createElement('li');
    li.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    li.classList.add(type);
    if (message.includes('🐳')) { li.classList.add('highlight-whale'); }
    activityLogElement.prepend(li);
    const maxLogEntries = 100;
    while (activityLogElement.children.length > maxLogEntries) {
        activityLogElement.removeChild(activityLogElement.lastChild);
    }
}

export function triggerWhaleNotification(username) {
    console.log(`WHALE ALERT: ${username} entered! 🐳`);
    addLogEntry(`${username} entered! 🐳`, 'whale-enter');
    playNotificationSound(); // Use Web Audio API sound
    // Optional: Add a more prominent visual cue
}

export function testSound() {
     playNotificationSound(); // Use Web Audio API sound
     displayMessage('Playing test sound...', 'info');
}

export function togglePasswordInput() {
    const isChecked = enablePasswordCheckbox.checked;
    passwordInput.style.display = isChecked ? 'inline-block' : 'none';
    if (!isChecked) { passwordInput.value = ''; }
    console.log(`Password input ${isChecked ? 'shown' : 'hidden'}`);
}

// Save settings to localStorage
function saveSettingsToLocalStorage() {
    const settings = {
        lifetimeSpendingThreshold: lifetimeSpendingThresholdInput.value,
        recentTipThreshold: recentTipThresholdInput.value,
        recentTipTimeframe: recentTipTimeframeInput.value,
        recentLargeTipThreshold: recentLargeTipThresholdInput.value,
        recentPrivateThreshold: recentPrivateThresholdInput.value,
        recentPrivateTimeframe: recentPrivateTimeframeInput.value,
        totalPrivatesThreshold: totalPrivatesThresholdInput.value,
        totalLifetimeTipsThreshold: totalLifetimeTipsThresholdInput.value,
        settingsPanelVisible: settingsPanel.style.display === 'block',
        enablePassword: enablePasswordCheckbox.checked,
    };
    localStorage.setItem('appSettings', JSON.stringify(settings));
    console.log('Settings saved to localStorage.');
}

// Restore settings from localStorage
function restoreSettingsFromLocalStorage() {
    const savedSettings = JSON.parse(localStorage.getItem('appSettings'));
    if (savedSettings) {
        lifetimeSpendingThresholdInput.value = savedSettings.lifetimeSpendingThreshold || '';
        recentTipThresholdInput.value = savedSettings.recentTipThreshold || '';
        recentTipTimeframeInput.value = savedSettings.recentTipTimeframe || '';
        recentLargeTipThresholdInput.value = savedSettings.recentLargeTipThreshold || '';
        recentPrivateThresholdInput.value = savedSettings.recentPrivateThreshold || '';
        recentPrivateTimeframeInput.value = savedSettings.recentPrivateTimeframe || '';
        totalPrivatesThresholdInput.value = savedSettings.totalPrivatesThreshold || '';
        totalLifetimeTipsThresholdInput.value = savedSettings.totalLifetimeTipsThreshold || '';
        settingsPanel.style.display = savedSettings.settingsPanelVisible ? 'block' : 'none';
        enablePasswordCheckbox.checked = savedSettings.enablePassword || false;
        togglePasswordInput(); // Update password input visibility
        console.log('Settings restored from localStorage.');
    } else {
        console.log('No settings found in localStorage.');
    }
}

// Call saveSettingsToLocalStorage when settings are updated
lifetimeSpendingThresholdInput.addEventListener('input', saveSettingsToLocalStorage);
recentTipThresholdInput.addEventListener('input', saveSettingsToLocalStorage);
recentTipTimeframeInput.addEventListener('input', saveSettingsToLocalStorage);
recentLargeTipThresholdInput.addEventListener('input', saveSettingsToLocalStorage);
recentPrivateThresholdInput.addEventListener('input', saveSettingsToLocalStorage);
recentPrivateTimeframeInput.addEventListener('input', saveSettingsToLocalStorage);
totalPrivatesThresholdInput.addEventListener('input', saveSettingsToLocalStorage);
totalLifetimeTipsThresholdInput.addEventListener('input', saveSettingsToLocalStorage);
enablePasswordCheckbox.addEventListener('change', saveSettingsToLocalStorage);

// --- Import Progress UI Functions ---
export function showImportProgress(totalRows) {
    document.getElementById('importProgress').style.display = 'block';
    document.getElementById('totalRows').textContent = totalRows;
    document.getElementById('currentProgress').textContent = '0';
    document.getElementById('usersFound').textContent = '0';
    document.getElementById('tokensProcessed').textContent = '0';
    document.getElementById('privateShowsFound').textContent = '0';
    document.getElementById('spyShowsFound').textContent = '0';
    document.getElementById('progressBarFill').style.width = '0%';
}

export function updateImportProgress(current, total, stats = {}) {
    document.getElementById('currentProgress').textContent = current;
    document.getElementById('usersFound').textContent = stats.usersFound || '0';
    document.getElementById('tokensProcessed').textContent = stats.tokensProcessed || '0';
    document.getElementById('privateShowsFound').textContent = stats.privateShowsFound || '0';
    document.getElementById('spyShowsFound').textContent = stats.spyShowsFound || '0';
    const percentage = Math.min(100, Math.round((current / total) * 100));
    document.getElementById('progressBarFill').style.width = `${percentage}%`;
}

export function hideImportProgress() {
    document.getElementById('importProgress').style.display = 'none';
}

// --- Initial UI Setup ---
export function initializeUI() {
    restoreSettingsFromLocalStorage();
    settingsPanel.style.display = 'none';
    passwordInput.style.display = 'none';
    document.getElementById('cancelScan').style.display = 'none';
    document.getElementById('qrScanner').style.display = 'none';
    // Set initial connection UI state based on loaded config
    const initialConfig = configManager.getConfig();
    updateConnectionUI(false, initialConfig.scannedUrl, null, initialConfig); // Start as disconnected
    addLogEntry("Application initialized.", "info");

    // Remove or hide the sound file selector if it exists
    if (bellSoundSelect) {
        bellSoundSelect.style.display = 'none';
        // Also hide its label if it has one
        const bellSoundLabel = document.querySelector(`label[for='${bellSoundSelect.id}']`);
        if (bellSoundLabel) {
            bellSoundLabel.style.display = 'none';
        }
    }
}