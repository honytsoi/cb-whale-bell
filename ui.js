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
const connectionStatusElement = document.getElementById('connectionStatus');
const settingsPanel = document.getElementById('settingsPanel');
const activityLogElement = document.getElementById('activityLog');
const dataManagementResultElement = document.getElementById('dataManagementResult');
const apiEndpointElement = document.getElementById('apiEndpoint');
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

// --- Toast Notification System ---
function showToast(message, duration = 3000) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Remove toast after animation
    setTimeout(() => {
        document.body.removeChild(toast);
    }, duration);
}

export function updateConnectionStatus(status, url = null, broadcaster = null) {
    console.log(`Updating connection status UI: ${status}`);
    if (status === 'connecting') {
        connectionStatusElement.textContent = 'Status: Connecting...';
        connectionStatusElement.style.color = 'orange';
        apiEndpointElement.textContent = '';
        broadcasterNameDisplayElement.textContent = '';
        document.getElementById('connectUrl').classList.add('loading');
    } else if (status === true) { // Connected
        connectionStatusElement.textContent = 'Status: Connected';
        connectionStatusElement.style.color = 'lightgreen';
        apiEndpointElement.textContent = `Connected to: ${url || 'Unknown URL'}`;
        broadcasterNameDisplayElement.textContent = `Broadcaster: ${broadcaster || 'Unknown'}`;
        document.getElementById('startScan').disabled = true;
        document.getElementById('connectUrl').disabled = true;
        document.getElementById('scannedUrl').disabled = true;
        document.getElementById('disconnectApi').disabled = false;
        document.getElementById('connectUrl').classList.remove('loading');

        // Automatically finish setup and start monitoring
        finishSetup();
        startMonitoring();
    } else { // Disconnected or Error
        connectionStatusElement.textContent = 'Status: Disconnected';
        connectionStatusElement.style.color = 'red';
        apiEndpointElement.textContent = '';
        broadcasterNameDisplayElement.textContent = '';
        document.getElementById('startScan').disabled = false;
        document.getElementById('connectUrl').disabled = false;
        document.getElementById('scannedUrl').disabled = false;
        document.getElementById('disconnectApi').disabled = true;
        document.getElementById('connectUrl').classList.remove('loading');
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
                if (element.textContent === message) { 
                    element.textContent = ''; 
                    element.className = ''; 
                }
            }, durationMs);
        }
    }
    // Also show as toast for important messages
    if (type === 'error' || type === 'success') {
        showToast(message);
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
    
    // Create whale notification element
    const notification = document.createElement('div');
    notification.className = 'whale-notification';
    notification.innerHTML = `
        <strong>🐳 Whale Alert!</strong>
        <p>${username} has entered!</p>
    `;
    
    // Add to activity log with animation
    const li = document.createElement('li');
    li.appendChild(notification);
    li.classList.add('whale-enter');
    activityLogElement.prepend(li);
    
    // Show toast notification
    showToast(`🐳 Whale Alert: ${username} has entered!`);
    
    // Play sound
    playNotificationSound();
    
    // Clean up old entries
    const maxLogEntries = 100;
    while (activityLogElement.children.length > maxLogEntries) {
        activityLogElement.removeChild(activityLogElement.lastChild);
    }
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

// --- Import Progress UI Functions ---
export function showImportProgress(totalRows) {
    const importProgress = document.getElementById('importProgress');
    importProgress.style.display = 'block';
    document.getElementById('importTokenHistoryButton').classList.add('loading');
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
    document.getElementById('importTokenHistoryButton').classList.remove('loading');
}

// --- Setup Wizard Functions ---
let currentSetupStep = 1;

export function showSetupWizard() {
    const setupWizard = document.getElementById('setupWizard');
    const mainArea = document.getElementById('mainArea');
    
    setupWizard.style.display = 'block';
    mainArea.style.display = 'none';
    showSetupStep(1);
}

function showSetupStep(stepNumber) {
    document.querySelectorAll('.setup-step').forEach(step => {
        step.style.display = 'none';
    });
    
    const currentStep = document.querySelector(`.setup-step[data-step="${stepNumber}"]`);
    if (currentStep) {
        currentStep.style.display = 'block';
        currentSetupStep = stepNumber;
    }
}

export function setupNextStep() {
    const currentStep = document.querySelector(`.setup-step[data-step="${currentSetupStep}"]`);
    const nextStep = document.querySelector(`.setup-step[data-step="${currentSetupStep + 1}"]`);
    
    // Save thresholds when moving from step 3
    if (currentSetupStep === 3) {
        const lifetimeSpending = document.getElementById('lifetimeSpendingThreshold').value;
        const recentTip = document.getElementById('recentTipThreshold').value;
        
        // Update config with onboarding values
        const config = configManager.getConfig();
        config.lifetimeSpendingThreshold = parseInt(lifetimeSpending);
        config.recentTipThreshold = parseInt(recentTip);
        configManager.saveConfig(config);
    }
    
    if (currentStep && nextStep) {
        currentStep.style.animation = 'fadeOut 0.3s ease-out forwards';
        setTimeout(() => {
            currentStep.style.display = 'none';
            nextStep.style.display = 'block';
            nextStep.style.animation = 'fadeIn 0.3s ease-out';
            currentSetupStep++;
        }, 300);
    }
}

export function setupSkipStep() {
    showSetupStep(currentSetupStep + 1);
}

export function finishSetup() {
    const setupWizard = document.getElementById('setupWizard');
    const mainArea = document.getElementById('mainArea');
    
    setupWizard.style.display = 'none';
    mainArea.style.display = 'block';
    
    // Save setup completion status
    localStorage.setItem('setupCompleted', 'true');
    
    // Initialize main UI first so elements are visible
    initializeUI();
    
    // Then update displays after elements are visible
    updateThresholdDisplay();
}

export function updateThresholdDisplay() {
    const currentThresholds = document.getElementById('currentThresholds');
    if (!currentThresholds) {
        console.error("#currentThresholds container not found in the DOM. Aborting update.");
        return;
    }

    const thresholdDisplay = currentThresholds.querySelector('.threshold-display');
    if (!thresholdDisplay) {
        console.error("#currentThresholds .threshold-display element not found in the DOM. Aborting update.");
        return;
    }

    const config = configManager.getConfig();
    thresholdDisplay.innerHTML = `
        <div class="threshold-item">
            <span>Lifetime Spending: ${config.lifetimeSpendingThreshold} tokens</span>
        </div>
        <div class="threshold-item">
            <span>Recent Tip: ${config.recentTipThreshold} tokens in ${config.recentTipTimeframe}s</span>
        </div>
    `;
}

export function updateWhaleStats() {
    const statsDisplay = document.querySelector('.stats-display');
    // Add whale statistics display logic here
    statsDisplay.innerHTML = `
        <div class="stats-item">
            <span>Whales Online: 0</span>
        </div>
        <div class="stats-item">
            <span>Total Whale Tips Today: 0</span>
        </div>
    `;
}

// --- Settings Tab Management ---
function initializeSettingsTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            
            // Update active states
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            button.classList.add('active');
            document.getElementById(tabId + 'Settings').classList.add('active');
        });
    });
}

// --- Monitoring Controls ---
let isMonitoring = false;

export function startMonitoring() {
    isMonitoring = true;
    document.getElementById('stopMonitoring').style.display = 'inline-block';
    addLogEntry('Monitoring started.', 'info');
}

export function stopMonitoring() {
    isMonitoring = false;
    document.getElementById('stopMonitoring').style.display = 'none';
    addLogEntry('Monitoring stopped.', 'info');
}

// --- Auto-Pruning Management ---
export function initializeAutoPruning() {
    const enableAutoPruning = document.getElementById('enableAutoPruning');
    const pruneThreshold = document.getElementById('pruneThreshold');
    const pruneAmount = document.getElementById('pruneAmount');
    
    // Load saved auto-pruning settings
    const savedSettings = JSON.parse(localStorage.getItem('autoPruningSettings') || '{}');
    enableAutoPruning.checked = savedSettings.enabled || false;
    pruneThreshold.value = savedSettings.threshold || 90;
    pruneAmount.value = savedSettings.amount || 20;
    
    // Save settings when changed
    const saveAutoPruningSettings = () => {
        const settings = {
            enabled: enableAutoPruning.checked,
            threshold: parseInt(pruneThreshold.value),
            amount: parseInt(pruneAmount.value)
        };
        localStorage.setItem('autoPruningSettings', JSON.stringify(settings));
    };
    
    enableAutoPruning.addEventListener('change', saveAutoPruningSettings);
    pruneThreshold.addEventListener('change', saveAutoPruningSettings);
    pruneAmount.addEventListener('change', saveAutoPruningSettings);
}

// Modify initializeUI to check for first-time setup
export function initializeUI() {
    const setupCompleted = localStorage.getItem('setupCompleted');

    if (!setupCompleted) {
        showSetupWizard();
    } else {
        const setupWizard = document.getElementById('setupWizard');
        const mainArea = document.getElementById('mainArea');

        setupWizard.style.display = 'none';
        mainArea.style.display = 'block';

        // Ensure settings button is visible
        const settingsButton = document.getElementById('settingsButton');
        if (settingsButton) {
            settingsButton.style.display = 'inline-block';
            settingsButton.addEventListener('click', toggleSettingsPanel);
        }

        // Load thresholds from localStorage
        loadThresholdsFromLocalStorage();

        // Initialize new components
        initializeSettingsTabs();
        initializeAutoPruning();

        updateConnectionStatus(false);

        // Delay updating the threshold display to ensure DOM is fully rendered
        setTimeout(() => {
            updateThresholdDisplay();
        }, 0);

        updateWhaleStats();

        addLogEntry("Application initialized.", "info");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initializeUI();
});

export function saveThresholdsToLocalStorage() {
    const config = configManager.getConfig();
    localStorage.setItem('lifetimeSpendingThreshold', config.lifetimeSpendingThreshold);
    localStorage.setItem('recentTipThreshold', config.recentTipThreshold);
    localStorage.setItem('recentTipTimeframe', config.recentTipTimeframe);
    localStorage.setItem('recentLargeTipThreshold', config.recentLargeTipThreshold);
    localStorage.setItem('recentPrivateThreshold', config.recentPrivateThreshold);
    localStorage.setItem('recentPrivateTimeframe', config.recentPrivateTimeframe);
    localStorage.setItem('totalPrivatesThreshold', config.totalPrivatesThreshold);
    localStorage.setItem('totalLifetimeTipsThreshold', config.totalLifetimeTipsThreshold);
    console.log('Thresholds saved to localStorage.');
}

export function loadThresholdsFromLocalStorage() {
    const config = configManager.getConfig();
    config.lifetimeSpendingThreshold = parseInt(localStorage.getItem('lifetimeSpendingThreshold')) || config.lifetimeSpendingThreshold;
    config.recentTipThreshold = parseInt(localStorage.getItem('recentTipThreshold')) || config.recentTipThreshold;
    config.recentTipTimeframe = parseInt(localStorage.getItem('recentTipTimeframe')) || config.recentTipTimeframe;
    config.recentLargeTipThreshold = parseInt(localStorage.getItem('recentLargeTipThreshold')) || config.recentLargeTipThreshold;
    config.recentPrivateThreshold = parseInt(localStorage.getItem('recentPrivateThreshold')) || config.recentPrivateThreshold;
    config.recentPrivateTimeframe = parseInt(localStorage.getItem('recentPrivateTimeframe')) || config.recentPrivateTimeframe;
    config.totalPrivatesThreshold = parseInt(localStorage.getItem('totalPrivatesThreshold')) || config.totalPrivatesThreshold;
    config.totalLifetimeTipsThreshold = parseInt(localStorage.getItem('totalLifetimeTipsThreshold')) || config.totalLifetimeTipsThreshold;
    console.log('Thresholds loaded from localStorage.');
}