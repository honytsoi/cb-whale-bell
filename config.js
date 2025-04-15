// config.js - Manages application configuration and settings

import * as ui from './ui.js'; // Import UI to populate settings
import * as userManager from './userManager.js'; // Import userManager to analyze data
import { displayError } from './utils.js';
import db from './db.js';

// Add this near the top of the file, after imports
window.whaleBellDebug = {};

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
    recentEventRetentionDays: 30, // Added: Default retention period in days
    showFollows: true,
};

let currentConfig = { ...defaultConfig };
const CONFIG_KEY = 'whaleBellConfig';

export async function loadConfig() {
    console.log("Loading configuration...");
    try {
        const config = await db.config.get('main');
        console.log("Raw config from IndexedDB:", config);
        
        if (!config) {
            console.log('No saved configuration found, using defaults');
            currentConfig = { ...defaultConfig };
        } else {
            console.log("Merging loaded config with defaults...");
            currentConfig = { ...defaultConfig, ...config };
            // Remove the 'id' field that IndexedDB adds as it's not part of our config
            delete currentConfig.id;
            console.log("Final merged configuration:", currentConfig);
        }
        
        // Make sure showFollows has a value
        currentConfig.showFollows = currentConfig.showFollows ?? defaultConfig.showFollows;
        
        ui.populateSettings(); // Update UI fields after loading/setting defaults
    } catch (error) {
        displayError("Failed to load configuration from IndexedDB", error);
        console.warn("Using default configuration due to loading error.");
        currentConfig = { ...defaultConfig };
        try {
            ui.populateSettings();
        } catch (uiError) {
            displayError("Failed to populate UI after config load error", uiError);
        }
    }
}

export async function saveConfig() {
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
        currentConfig.recentEventRetentionDays = parseInt(document.getElementById('recentEventRetentionDays')?.value, 10) || defaultConfig.recentEventRetentionDays; // Added
        // Ensure retention days is at least 1
        if (currentConfig.recentEventRetentionDays < 1) {
            console.warn(`Retention period cannot be less than 1 day. Setting to 1.`);
            currentConfig.recentEventRetentionDays = 1;
        }
        currentConfig.scannedUrl = document.getElementById('scannedUrl')?.value || null;
        await db.config.put({ id: 'main', ...currentConfig });
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

export async function resetConfig() {
    console.log("Resetting configuration to defaults...");
    currentConfig = { ...defaultConfig };
    try {
        await db.config.delete('main');
        console.log("Configuration removed from IndexedDB.");
        ui.populateSettings(); // Update UI to reflect defaults
    } catch (error) {
        displayError("Failed to remove configuration from IndexedDB during reset", error);
    }
}

// --- Threshold Suggestion ---

// Made async because getSpentInPeriod is now async
export async function suggestThresholds() {
    const suggestButton = document.getElementById('suggestThresholds');
    suggestButton.classList.add('loading');
    ui.displayMessage("Analyzing user data to suggest thresholds...", "info", "dataManagementResult");
    
    console.group('Threshold Suggestion Debug');
    console.log("Starting threshold suggestion process...");
    
    try {
        const allUsersMap = userManager.getAllUsers();
        console.log("Total users in map:", allUsersMap.size);
        
        // Add more detailed user data logging
        if (allUsersMap.size > 0) {
            const sampleUser = Array.from(allUsersMap.values())[0];
            console.log("First user full data:", {
                username: sampleUser.username,
                tokenStats: sampleUser.tokenStats,
                rawData: sampleUser
            });
        }

        const users = Array.from(allUsersMap.values());
        
        // Debug lifetime metrics
        const lifetimeSpending = users.map(u => {
            console.log(`User ${u.username} lifetime spent:`, u.tokenStats?.lifetimeTotalSpent);
            return u.tokenStats?.lifetimeTotalSpent || 0;
        }).filter(s => s > 0);

        console.log("Lifetime spending values:", lifetimeSpending);

        // --- Calculate Metrics ---
        const lifetimeTips = users.map(u => u.tokenStats?.lifetimeTotalTips || 0).filter(t => t > 0);
        const lifetimePrivates = users.map(u => u.tokenStats?.lifetimeTotalPrivates || 0).filter(p => p > 0);

        const currentConfig = getConfig();

        // Calculate recent spending (e.g., last 7 days)
        const recentTipDays = Math.max(1, Math.ceil((currentConfig.recentTipTimeframe || 3600) / 86400));
        const recentTipsPromises = users.map(u => userManager.getSpentInPeriod(u.username, recentTipDays, 'tips'));
        const recentTips = (await Promise.all(recentTipsPromises)).filter(t => t > 0);

        const recentPrivateDays = Math.max(1, Math.ceil((currentConfig.recentPrivateTimeframe || 86400) / 86400));
        const recentPrivatesPromises = users.map(u => userManager.getSpentInPeriod(u.username, recentPrivateDays, 'privates'));
        const recentPrivates = (await Promise.all(recentPrivatesPromises)).filter(p => p > 0);

        // --- Calculate Percentiles ---
        console.log("Data for percentile calculation (after filtering zeros):", {
            lifetimeSpending, lifetimeTips, lifetimePrivates, recentTips, recentPrivates
        });

        const p75 = 0.75;
        const p90 = 0.90;
        const p95 = 0.95;
        const lifetimeSpending_p90 = calculatePercentile(lifetimeSpending, p90);
        const lifetimeTips_p90 = calculatePercentile(lifetimeTips, p90);
        const lifetimePrivates_p90 = calculatePercentile(lifetimePrivates, p90);
        const recentTips_p75 = calculatePercentile(recentTips, p75);
        const recentPrivates_p75 = calculatePercentile(recentPrivates, p75);
        const largeTipSuggestion = calculatePercentile(lifetimeTips, p95);

        // --- Populate UI ---
        document.getElementById('lifetimeSpendingThreshold').value = Math.ceil(lifetimeSpending_p90) || defaultConfig.lifetimeSpendingThreshold;
        document.getElementById('totalLifetimeTipsThreshold').value = Math.ceil(lifetimeTips_p90) || defaultConfig.totalLifetimeTipsThreshold;
        document.getElementById('totalPrivatesThreshold').value = Math.ceil(lifetimePrivates_p90) || defaultConfig.totalPrivatesThreshold;
        document.getElementById('recentTipThreshold').value = Math.ceil(recentTips_p75) || defaultConfig.recentTipThreshold;
        document.getElementById('recentPrivateThreshold').value = Math.ceil(recentPrivates_p75) || defaultConfig.recentPrivateThreshold;
        document.getElementById('recentLargeTipThreshold').value = Math.ceil(largeTipSuggestion) || defaultConfig.recentLargeTipThreshold;

        ui.displayMessage("Thresholds updated based on your user data analysis!", "success", "dataManagementResult");
        console.log("Suggestions:", {
            lifetimeSpending_p90, lifetimeTips_p90, lifetimePrivates_p90,
            recentTips_p75, recentPrivates_p75, largeTipSuggestion
        });

        console.groupEnd();
    } catch (error) {
        console.error("Suggestion process failed:", error);
        console.groupEnd();
        ui.displayMessage("Failed to suggest thresholds: " + error.message, "error", "dataManagementResult");
        throw error;
    } finally {
        suggestButton.classList.remove('loading');
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

export function debugUserData() {
    console.group('User Data Debug');
    const users = userManager.getAllUsers();
    console.log('Total users:', users.size);
    
    // Sample the first few users
    const sampleUsers = Array.from(users.values()).slice(0, 5);
    console.log('Sample users:', sampleUsers);
    
    // Statistics summary
    const stats = Array.from(users.values()).reduce((acc, user) => {
        acc.totalUsers++;
        if (user.tokenStats?.lifetimeTotalSpent > 0) acc.usersWithSpending++;
        acc.totalSpent += user.tokenStats?.lifetimeTotalSpent || 0;
        return acc;
    }, { totalUsers: 0, usersWithSpending: 0, totalSpent: 0 });
    
    console.log('Statistics:', stats);
    console.groupEnd();
    return stats;
}

export function initConfig() {
    loadConfig(); // Load config which also calls ui.populateSettings
}

// Add this at the bottom of the file
window.whaleBellDebug = {
    ...window.whaleBellDebug,
    suggestThresholds,
    debugUserData,
    getCurrentConfig: () => console.log('Current config:', getConfig())
};