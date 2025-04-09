// config.js - Manages application configuration and settings

import * as ui from './ui.js'; // Import UI to populate settings
import * as userManager from './userManager.js'; // Import userManager to analyze data
import { displayError } from './utils.js';

// Default configuration
const defaultConfig = {
    scannedUrl: null,
    broadcasterName: null,
    lifetimeSpendingThreshold: 10000,
    recentTipThreshold: 1000,
    recentTipTimeframe: 3600,       // 1 hour
    recentLargeTipThreshold: 5000,
    recentPrivateThreshold: 2000,
    recentPrivateTimeframe: 86400,  // 1 day
    totalPrivatesThreshold: 10000,
    totalLifetimeTipsThreshold: 5000,
    bellSound: "default_bell.mp3",
};

let currentConfig = { ...defaultConfig };
const CONFIG_KEY = 'whaleBellConfig';

export function loadConfig() {
    console.log("Loading configuration...");
    try {
        const storedConfig = localStorage.getItem(CONFIG_KEY);
        if (storedConfig) {
            const parsedConfig = JSON.parse(storedConfig);
            currentConfig = { ...defaultConfig, ...parsedConfig };
            console.log("Configuration loaded from localStorage:", currentConfig);
        } else {
            console.log("No configuration found in localStorage, using defaults.");
            currentConfig = { ...defaultConfig };
        }
        ui.populateSettings(); // Update UI fields after loading/setting defaults
    } catch (error) {
        displayError("Failed to load configuration from localStorage", error);
        console.warn("Using default configuration due to loading error.");
        currentConfig = { ...defaultConfig };
        try {
            ui.populateSettings();
        } catch (uiError) {
            displayError("Failed to populate UI after config load error", uiError);
        }
    }
}

export function saveConfig() {
    console.log("Saving configuration...");
    try {
        // Read values from UI input fields and update currentConfig
        currentConfig.lifetimeSpendingThreshold = parseInt(document.getElementById('lifetimeSpendingThreshold').value, 10) || defaultConfig.lifetimeSpendingThreshold;
        currentConfig.recentTipThreshold = parseInt(document.getElementById('recentTipThreshold').value, 10) || defaultConfig.recentTipThreshold;
        currentConfig.recentTipTimeframe = parseInt(document.getElementById('recentTipTimeframe').value, 10) || defaultConfig.recentTipTimeframe;
        currentConfig.recentLargeTipThreshold = parseInt(document.getElementById('recentLargeTipThreshold').value, 10) || defaultConfig.recentLargeTipThreshold;
        currentConfig.recentPrivateThreshold = parseInt(document.getElementById('recentPrivateThreshold').value, 10) || defaultConfig.recentPrivateThreshold;
        currentConfig.recentPrivateTimeframe = parseInt(document.getElementById('recentPrivateTimeframe').value, 10) || defaultConfig.recentPrivateTimeframe;
        currentConfig.totalPrivatesThreshold = parseInt(document.getElementById('totalPrivatesThreshold').value, 10) || defaultConfig.totalPrivatesThreshold;
        currentConfig.totalLifetimeTipsThreshold = parseInt(document.getElementById('totalLifetimeTipsThreshold').value, 10) || defaultConfig.totalLifetimeTipsThreshold;
        currentConfig.bellSound = document.getElementById('bellSound').value || defaultConfig.bellSound;

        localStorage.setItem(CONFIG_KEY, JSON.stringify(currentConfig));
        console.log("Configuration saved:", currentConfig);
        // Update the read-only display after saving
        ui.populateSettings();
    } catch (error) {
        displayError("Failed to save configuration", error);
        throw error; // Re-throw for main.js to handle UI message
    }
}

export function getConfig() {
    return JSON.parse(JSON.stringify(currentConfig)); // Deep copy
}

export function updateConfig(newValues) {
    currentConfig = { ...currentConfig, ...newValues };
    console.log("Config updated programmatically:", newValues);
    // Don't auto-save here, let user explicitly save or connect trigger save
}


export function resetConfig() {
    console.log("Resetting configuration to defaults...");
    currentConfig = { ...defaultConfig };
    try {
        localStorage.removeItem(CONFIG_KEY);
        console.log("Configuration removed from localStorage.");
        ui.populateSettings(); // Update UI to reflect defaults
    } catch (error) {
        displayError("Failed to remove configuration from localStorage during reset", error);
    }
}

// --- Threshold Suggestion ---

export function suggestThresholds() {
    console.log("Suggesting thresholds based on user data...");
    ui.displayMessage("Analyzing user data for suggestions...", "info", "dataManagementResult", 0);

    try {
        const allUsersMap = userManager.getAllUsers();
        if (allUsersMap.size === 0) {
            ui.displayMessage("No user data available to generate suggestions.", "info", "dataManagementResult");
            return;
        }

        const users = Array.from(allUsersMap.values());

        // --- Calculate Metrics ---
        const lifetimeSpending = users.map(u => u.tokenStats?.totalSpent || 0).filter(s => s > 0);
        const lifetimeTips = users.map(u => u.tokenStats?.totalTips || 0).filter(t => t > 0);
        const lifetimePrivates = users.map(u => u.tokenStats?.totalPrivates || 0).filter(p => p > 0);

        // Calculate recent spending (e.g., last 7 days) - requires getSpentInPeriod
        const recentTipDays = Math.ceil((currentConfig.recentTipTimeframe || 3600) / 86400);
        const recentTips = users.map(u => userManager.getSpentInPeriod(u.username, recentTipDays, 'tips')).filter(t => t > 0);

        const recentPrivateDays = Math.ceil((currentConfig.recentPrivateTimeframe || 86400) / 86400);
        const recentPrivates = users.map(u => userManager.getSpentInPeriod(u.username, recentPrivateDays, 'privates')).filter(p => p > 0);

        // --- Calculate Percentiles ---
        // Percentiles to calculate (e.g., 75th, 90th, 95th)
        const p75 = 0.75;
        const p90 = 0.90;
        const p95 = 0.95;

        const lifetimeSpending_p90 = calculatePercentile(lifetimeSpending, p90);
        const lifetimeTips_p90 = calculatePercentile(lifetimeTips, p90);
        const lifetimePrivates_p90 = calculatePercentile(lifetimePrivates, p90);
        const recentTips_p75 = calculatePercentile(recentTips, p75); // Use lower percentile for recent tips?
        const recentPrivates_p75 = calculatePercentile(recentPrivates, p75); // Use lower percentile for recent privates?

        // Suggest large single tip based on overall tip distribution? (e.g., 95th percentile of all individual tips?)
        // This requires iterating through event history - potentially slow, skip for now or do simplified version.
        const largeTipSuggestion = calculatePercentile(lifetimeTips, p95); // Simple approximation


        // --- Populate UI ---
        // Use Math.ceil to round up suggestions to whole tokens
        document.getElementById('lifetimeSpendingThreshold').value = Math.ceil(lifetimeSpending_p90) || defaultConfig.lifetimeSpendingThreshold;
        document.getElementById('totalLifetimeTipsThreshold').value = Math.ceil(lifetimeTips_p90) || defaultConfig.totalLifetimeTipsThreshold;
        document.getElementById('totalPrivatesThreshold').value = Math.ceil(lifetimePrivates_p90) || defaultConfig.totalPrivatesThreshold;
        document.getElementById('recentTipThreshold').value = Math.ceil(recentTips_p75) || defaultConfig.recentTipThreshold;
        document.getElementById('recentPrivateThreshold').value = Math.ceil(recentPrivates_p75) || defaultConfig.recentPrivateThreshold;
        document.getElementById('recentLargeTipThreshold').value = Math.ceil(largeTipSuggestion) || defaultConfig.recentLargeTipThreshold;

        ui.displayMessage("Suggested thresholds populated based on user data.", "success", "dataManagementResult");
        console.log("Suggestions:", {
            lifetimeSpending_p90, lifetimeTips_p90, lifetimePrivates_p90,
            recentTips_p75, recentPrivates_p75, largeTipSuggestion
        });

    } catch (error) {
        displayError("Failed to suggest thresholds", error);
        ui.displayMessage(`Error suggesting thresholds: ${error.message}`, "error", "dataManagementResult");
    }
}

function calculatePercentile(data, percentile) {
    if (!data || data.length === 0) {
        return 0;
    }
    data.sort((a, b) => a - b); // Sort numerically
    const index = percentile * (data.length - 1);
    if (Number.isInteger(index)) {
        return data[index];
    } else {
        const lowerIndex = Math.floor(index);
        const upperIndex = Math.ceil(index);
        // Interpolate
        return data[lowerIndex] + (index - lowerIndex) * (data[upperIndex] - data[lowerIndex]);
    }
}


export function initConfig() {
    loadConfig(); // Load config which also calls ui.populateSettings
}