// userManager.js - Manages user data (loading, saving, updating)

import { debounce, displayError, parseTimestamp } from './utils.js';
import * as ui from './ui.js'; // Import ui for logging whale status

const USERS_KEY = 'whaleBellUsers';
const MAX_HISTORY_PER_USER = 1000; // As per spec
const PRUNE_PERCENTAGE = 0.75; // Prune 75% of users on QuotaExceededError (More aggressive)
const MAX_PRUNE_ATTEMPTS = 3; // Limit pruning attempts to prevent infinite loops

let users = new Map(); // In-memory store for user data

// --- Core Methods ---

export function loadUsers() {
    console.log("Loading users...");
    try {
        const storedUsers = localStorage.getItem(USERS_KEY);
        if (storedUsers) {
            const parsedUsersArray = JSON.parse(storedUsers);
            users = new Map(parsedUsersArray);
            console.log(`Loaded ${users.size} users from localStorage.`);

            // Reset transient state and ensure structure
            users.forEach(user => {
                user.isOnline = false;
                if (!user.eventHistory) user.eventHistory = [];
                if (!user.tokenStats) {
                     user.tokenStats = createDefaultTokenStats(user.username);
                } else {
                     if (!user.tokenStats.timePeriods) {
                         user.tokenStats.timePeriods = createDefaultTokenStats(user.username).timePeriods;
                     }
                     const defaultPeriods = createDefaultTokenStats(user.username).timePeriods;
                     for (const periodKey in defaultPeriods) {
                         if (!user.tokenStats.timePeriods[periodKey]) {
                             user.tokenStats.timePeriods[periodKey] = defaultPeriods[periodKey];
                         }
                     }
                     // Ensure lifetime totals exist
                     if (user.tokenStats.totalTips === undefined) user.tokenStats.totalTips = 0;
                     if (user.tokenStats.totalPrivates === undefined) user.tokenStats.totalPrivates = 0;
                     if (user.tokenStats.totalMedia === undefined) user.tokenStats.totalMedia = 0;
                }
                 if (!user.maxHistory) user.maxHistory = MAX_HISTORY_PER_USER;
            });
        } else {
            console.log("No user data found in localStorage.");
            users = new Map();
        }
    } catch (error) {
        displayError("Failed to load user data from localStorage", error);
        console.warn("Initializing with empty user data due to loading error.");
        users = new Map();
    }
}

function createDefaultTokenStats(username) {
     return {
        username: username,
        totalSpent: 0, totalTips: 0, totalPrivates: 0, totalMedia: 0,
        lastUpdated: null,
        timePeriods: {
            'd1': { total: 0, tips: 0, privates: 0, media: 0 },
            'd7': { total: 0, tips: 0, privates: 0, media: 0 },
            'd30': { total: 0, tips: 0, privates: 0, media: 0 },
        }
    };
}


function saveUsersInternal() {
    let attempts = 0;
    while (attempts < MAX_PRUNE_ATTEMPTS) {
        try {
            const usersArray = Array.from(users.entries());
            const jsonString = JSON.stringify(usersArray);
            localStorage.setItem(USERS_KEY, jsonString);
            if (attempts > 0) {
                 console.log(`Users saved successfully after ${attempts} pruning attempt(s).`);
            }
            return; // Success
        } catch (error) {
            if (error.name === 'QuotaExceededError' || (error.message && error.message.toLowerCase().includes('quota'))) {
                attempts++;
                console.warn(`LocalStorage quota exceeded (Attempt ${attempts}/${MAX_PRUNE_ATTEMPTS}). Attempting to prune old user data...`);
                const prunedCount = handleQuotaExceededError();
                if (prunedCount === 0) {
                     displayError("Failed to save user data: Quota exceeded, and no further pruning possible.", error);
                     alert("Failed to save user data: Storage limit reached, and no more old data could be removed. Please export your data if possible.");
                     return;
                }
                 // Loop continues to retry save
            } else {
                displayError("Failed to save user data to localStorage", error);
                alert("An unexpected error occurred while saving user data. Check the console.");
                return; // Exit on other errors
            }
        }
    }
    // If loop finishes without success
    displayError(`Failed to save user data after ${MAX_PRUNE_ATTEMPTS} pruning attempts.`, null);
    alert(`Failed to save user data: Storage limit still reached after ${MAX_PRUNE_ATTEMPTS} attempts to clear space. Please export your data.`);
}

// Debounced save function
export const saveUsers = debounce(saveUsersInternal, 1500);

// Returns the number of users pruned
function handleQuotaExceededError() {
    const userCount = users.size;
    if (userCount <= 1) { console.warn("Pruning skipped: 1 or 0 users remaining."); return 0; }
    const usersArray = Array.from(users.values());
    usersArray.sort((a, b) => {
        const dateA = a.lastSeenDate ? new Date(a.lastSeenDate).getTime() : 0;
        const dateB = b.lastSeenDate ? new Date(b.lastSeenDate).getTime() : 0;
        return dateA - dateB; // Oldest first
    });
    const numberToPrune = Math.max(1, Math.min(userCount - 1, Math.floor(userCount * PRUNE_PERCENTAGE)));
    const usersToPrune = usersArray.slice(0, numberToPrune);
    if (usersToPrune.length === 0) { console.warn("Pruning calculation resulted in 0 users to prune."); return 0; }
    console.log(`Pruning ${usersToPrune.length} users (oldest seen):`, usersToPrune.map(u => u.username));
    usersToPrune.forEach(user => users.delete(user.username));
    console.log(`User count after pruning: ${users.size}`);
    return usersToPrune.length;
}


export function addUser(username) {
    let isNew = false;
    if (!users.has(username)) {
        isNew = true;
        users.set(username, {
            username: username,
            firstSeenDate: null, lastSeenDate: null, isOnline: false,
            eventHistory: [],
            tokenStats: createDefaultTokenStats(username),
            maxHistory: MAX_HISTORY_PER_USER
        });
        saveUsers();
    }
    return isNew;
}

export function getUser(username) {
    return users.get(username);
}

export function getAllUsers() {
    return new Map(users); // Return a copy
}

export function addEvent(username, type, data) {
    const isNewUser = addUser(username);
    const user = getUser(username);
    const eventData = data || {};
    const timestamp = parseTimestamp(eventData.timestamp) || new Date().toISOString();

    if (!user.firstSeenDate || timestamp < user.firstSeenDate) user.firstSeenDate = timestamp;
    if (!user.lastSeenDate || timestamp > user.lastSeenDate) user.lastSeenDate = timestamp;

    const event = { username: username, type: type, timestamp: timestamp, data: { ...eventData } };

    user.eventHistory.unshift(event);
    if (user.eventHistory.length > user.maxHistory) user.eventHistory.pop();

    if (eventData && typeof eventData.amount === 'number' && eventData.amount > 0) {
        updateTokenStats(user, event);
    }

    if (type === 'userEnter') markUserOnline(username, false);
    else if (type === 'userLeave') markUserOffline(username, false);

    saveUsers();
    return isNewUser;
}

// --- Token Stats Calculation with Detailed Logging ---

function updateTokenStats(user, event) {
    const amount = event.data.amount;
    if (typeof amount !== 'number' || amount <= 0) return;

    const eventTime = new Date(event.timestamp).getTime();
    const now = Date.now();
    const stats = user.tokenStats;

    console.group(`Stat Update: ${user.username} - Event: ${event.type} (+${amount} tokens)`);

    try {
        // --- Log Before State ---
        console.log(`Before - Lifetime: Spent=${stats.totalSpent}, Tips=${stats.totalTips}, Privates=${stats.totalPrivates}, Media=${stats.totalMedia}`);
        
        for (const periodKey in stats.timePeriods) {
            const days = parseInt(periodKey.substring(1));
            if (isNaN(days)) continue;
            const periodStart = now - days * 24 * 60 * 60 * 1000;
            if (eventTime >= periodStart) {
                console.log(`Before - Period ${periodKey}: Total=${stats.timePeriods[periodKey].total}, Tips=${stats.timePeriods[periodKey].tips}, Privates=${stats.timePeriods[periodKey].privates}, Media=${stats.timePeriods[periodKey].media}`);
            }
        }

        // --- Perform Updates ---
        stats.totalSpent = (stats.totalSpent || 0) + amount;
        let category = 'other';
        
        if (event.type === 'tip') {
            stats.totalTips = (stats.totalTips || 0) + amount;
            category = 'tips';
            console.log(`    -> Added to totalTips. New totalTips: ${stats.totalTips}`);
        } else if (event.type === 'privateShow' || event.type === 'privateShowSpy') {
            stats.totalPrivates = (stats.totalPrivates || 0) + amount;
            category = 'privates';
            console.log(`    -> Added to totalPrivates. New totalPrivates: ${stats.totalPrivates}`);
        } else if (event.type === 'mediaPurchase') {
            stats.totalMedia = (stats.totalMedia || 0) + amount;
            category = 'media';
            console.log(`    -> Added to totalMedia. New totalMedia: ${stats.totalMedia}`);
        }

        // Period stats adjustment
        for (const periodKey in stats.timePeriods) {
            const days = parseInt(periodKey.substring(1));
            if (isNaN(days)) continue;
            const periodStart = now - days * 24 * 60 * 60 * 1000;
            if (eventTime >= periodStart) {
                const periodStats = stats.timePeriods[periodKey];
                periodStats.total = (periodStats.total || 0) + amount;
                if (category !== 'other') {
                    periodStats[category] = (periodStats[category] || 0) + amount;
                }
                console.log(`    -> Period ${periodKey}: Total=${periodStats.total}, ${category}=${periodStats[category]}`);
            }
        }
        
        stats.lastUpdated = new Date().toISOString();

        // --- Log After State ---
        console.log(`After  - Lifetime: Spent=${stats.totalSpent}, Tips=${stats.totalTips}, Privates=${stats.totalPrivates}, Media=${stats.totalMedia}`);
        for (const periodKey in stats.timePeriods) {
            const days = parseInt(periodKey.substring(1));
            if (isNaN(days)) continue;
            const periodStart = now - days * 24 * 60 * 60 * 1000;
            if (eventTime >= periodStart) {
                console.log(`After  - Period ${periodKey}: Total=${stats.timePeriods[periodKey].total}, Tips=${stats.timePeriods[periodKey].tips}, Privates=${stats.timePeriods[periodKey].privates}, Media=${stats.timePeriods[periodKey].media}`);
            }
        }
    } finally {
        console.groupEnd();
    }
}

export function recalculateAllUserStats() {
    console.log("Recalculating stats for all users...");
    let count = 0;
    users.forEach(user => { recalculateTotals(user, false); count++; });
    saveUsers();
    console.log(`Recalculation complete for ${count} users.`);
}

export function recalculateTotals(user, shouldSave = true) {
    if (!user) return;
    user.tokenStats = createDefaultTokenStats(user.username); // Reset stats
    const stats = user.tokenStats;
    const now = Date.now();
    let processedPrivateMeta = false;

    console.groupCollapsed(`Recalculating Stats for: ${user.username}`);

    try {
        for (let i = user.eventHistory.length - 1; i >= 0; i--) {
            const event = user.eventHistory[i];
            if (event.data && typeof event.data.amount === 'number' && event.data.amount > 0) {
                const amount = event.data.amount;
                const eventTime = new Date(event.timestamp).getTime();
                stats.totalSpent += amount;
                let category = 'other';

                console.log(` -> Processing event [${i}]: type='${event.type}', amount=${amount}, timestamp='${event.timestamp}'`);

                if (event.type === 'tip') {
                    stats.totalTips += amount;
                    category = 'tips';
                    console.log(`    -> Added to totalTips. New totalTips: ${stats.totalTips}`);
                }
                else if (event.type === 'privateShow' || event.type === 'privateShowSpy') {
                    stats.totalPrivates += amount;
                    category = 'privates';
                    processedPrivateMeta = true;
                    console.log(`    -> Added to totalPrivates. New totalPrivates: ${stats.totalPrivates}`);
                }
                else if (event.type === 'mediaPurchase') {
                    stats.totalMedia += amount;
                    category = 'media';
                    console.log(`    -> Added to totalMedia. New totalMedia: ${stats.totalMedia}`);
                }

                // Update period stats
                for (const periodKey in stats.timePeriods) {
                    const days = parseInt(periodKey.substring(1));
                    if (isNaN(days)) continue;
                    const periodStart = now - days * 24 * 60 * 60 * 1000;
                    if (eventTime >= periodStart) {
                        const periodStats = stats.timePeriods[periodKey];
                        periodStats.total = (periodStats.total || 0) + amount;
                        if (category !== 'other') {
                            periodStats[category] = (periodStats[category] || 0) + amount;
                        }
                        console.log(`    -> Period ${periodKey}: Total=${periodStats.total}, ${category}=${periodStats[category]}`);
                    }
                }
            }
        }
    } finally {
        console.groupEnd();
    }

    stats.lastUpdated = new Date().toISOString();
    if (shouldSave) saveUsers();
}

// --- Online/Offline Status ---

export function markUserOnline(username, shouldSave = true) {
    const user = getUser(username);
    if (user && !user.isOnline) {
        user.isOnline = true; user.lastSeenDate = new Date().toISOString();
        if (shouldSave) saveUsers();
    }
}

export function markUserOffline(username, shouldSave = true) {
    const user = getUser(username);
    if (user && user.isOnline) {
        user.isOnline = false; user.lastSeenDate = new Date().toISOString();
        if (shouldSave) saveUsers();
    }
}

// --- Whale Check Logic with Detailed Logging ---

export function isWhale(username, thresholds) {
    const user = getUser(username);
    if (!user || !user.tokenStats) { return false; }
    const stats = user.tokenStats; let isUserWhale = false;
    console.groupCollapsed(`Whale Check: ${username}`);
    try {
        console.log(`Stats: Spent=${stats.totalSpent}, Tips=${stats.totalTips}, Privates=${stats.totalPrivates}`);
        const lifetimeCheck = stats.totalSpent >= thresholds.lifetimeSpendingThreshold;
        console.log(` -> Lifetime Spending: ${stats.totalSpent} >= ${thresholds.lifetimeSpendingThreshold} ? ${lifetimeCheck}`);
        if (lifetimeCheck) { console.log(`   * WHALE Reason: Lifetime spending.`); isUserWhale = true; }
        const lifetimeTipsCheck = stats.totalTips >= thresholds.totalLifetimeTipsThreshold;
        console.log(` -> Lifetime Tips: ${stats.totalTips} >= ${thresholds.totalLifetimeTipsThreshold} ? ${lifetimeTipsCheck}`);
        if (lifetimeTipsCheck) { console.log(`   * WHALE Reason: Lifetime tips.`); isUserWhale = true; }
        const lifetimePrivatesCheck = stats.totalPrivates >= thresholds.totalPrivatesThreshold;
        console.log(` -> Lifetime Privates: ${stats.totalPrivates} >= ${thresholds.totalPrivatesThreshold} ? ${lifetimePrivatesCheck}`);
        if (lifetimePrivatesCheck) { console.log(`   * WHALE Reason: Lifetime privates.`); isUserWhale = true; }
        const recentTipSeconds = thresholds.recentTipTimeframe;
        if (recentTipSeconds > 0) {
            const recentTipDays = Math.ceil(recentTipSeconds / 86400);
            const recentTips = getSpentInPeriod(username, recentTipDays, 'tips');
            const recentTipsCheck = recentTips >= thresholds.recentTipThreshold;
            console.log(` -> Recent Tips (~${recentTipDays}d): ${recentTips} >= ${thresholds.recentTipThreshold} ? ${recentTipsCheck}`);
            if (recentTipsCheck) { console.log(`   * WHALE Reason: Recent tips.`); isUserWhale = true; }
        } else { console.log(` -> Recent Tips: Skipped (Timeframe=0)`); }
        const recentPrivateSeconds = thresholds.recentPrivateTimeframe;
         if (recentPrivateSeconds > 0) {
            const recentPrivateDays = Math.ceil(recentPrivateSeconds / 86400);
            const recentPrivates = getSpentInPeriod(username, recentPrivateDays, 'privates');
            const recentPrivatesCheck = recentPrivates >= thresholds.recentPrivateThreshold;
            console.log(` -> Recent Privates (~${recentPrivateDays}d): ${recentPrivates} >= ${thresholds.recentPrivateThreshold} ? ${recentPrivatesCheck}`);
            if (recentPrivatesCheck) { console.log(`   * WHALE Reason: Recent privates.`); isUserWhale = true; }
        } else { console.log(` -> Recent Privates: Skipped (Timeframe=0)`); }
        const largeTipThreshold = thresholds.recentLargeTipThreshold;
        if (largeTipThreshold > 0 && recentTipSeconds > 0) {
            const periodStart = Date.now() - recentTipSeconds * 1000; let foundLargeTip = false;
            for (const event of user.eventHistory) {
                const eventTime = new Date(event.timestamp).getTime(); if (eventTime < periodStart) break;
                if (event.type === 'tip' && event.data?.amount >= largeTipThreshold) {
                    console.log(` -> Large Single Tip (${recentTipSeconds}s): Found ${event.data.amount} >= ${largeTipThreshold} ? true`);
                    console.log(`   * WHALE Reason: Large single tip.`); isUserWhale = true; foundLargeTip = true; break;
                }
            }
            if (!foundLargeTip) { console.log(` -> Large Single Tip (${recentTipSeconds}s): No tip >= ${largeTipThreshold} found ? false`); }
        } else { console.log(` -> Large Single Tip: Skipped (Threshold or Timeframe=0)`); }
        if (!isUserWhale) { console.log(" -> Verdict: Not a whale."); } else { console.log(" -> Verdict: IS A WHALE."); }
    } catch (error) { console.error(`Error during whale check for ${username}:`, error); }
    finally { console.groupEnd(); }
    return isUserWhale;
}

// --- User Data Management ---

export function clearAllUsers() {
    console.log("Clearing all user data...");
    users.clear();
    saveUsersInternal(); // Persist immediately
}

export function importUser(userObject) {
     if (!userObject || !userObject.username) { console.warn("Skipping invalid user object during import:", userObject); return; }
     const username = userObject.username;
     const defaultStats = createDefaultTokenStats(username);
     userObject.tokenStats = { ...defaultStats, ...(userObject.tokenStats || {}) };
     userObject.tokenStats.timePeriods = { ...defaultStats.timePeriods, ...(userObject.tokenStats.timePeriods || {}) };
     if (!userObject.eventHistory) userObject.eventHistory = [];
     if (!userObject.maxHistory) userObject.maxHistory = MAX_HISTORY_PER_USER;
     userObject.isOnline = false;
     users.set(username, userObject);
}

// --- Getters for Stats ---
export function getUserStats(username) {
    const user = getUser(username);
    return user ? JSON.parse(JSON.stringify(user.tokenStats)) : createDefaultTokenStats(username);
}

export function getTotalSpent(username) { return getUserStats(username).totalSpent; }
export function getTotalTips(username) { return getUserStats(username).totalTips; }
export function getTotalPrivates(username) { return getUserStats(username).totalPrivates; }

export function getSpentInPeriod(username, days, category = 'total') {
    const user = getUser(username);
    if (!user || !user.tokenStats?.timePeriods) return 0;
    const periodKey = `d${days}`;
    const periodStats = user.tokenStats.timePeriods[periodKey];
    if (!periodStats) {
        console.warn(`Pre-calculated stats for period ${periodKey} not found for user ${username}. Recalculating might be needed.`);
        return calculateSpentInPeriodOnTheFly(user, days, category);
    }
    return periodStats[category] || 0;
}

function calculateSpentInPeriodOnTheFly(user, days, category = 'all') {
    if (!user) return 0;
    const now = Date.now();
    const periodStart = now - days * 24 * 60 * 60 * 1000;
    let totalSpentInPeriod = 0;
    
    for (const event of user.eventHistory) {
        const eventTime = new Date(event.timestamp).getTime();
        if (eventTime < periodStart) break;
        
        if (event.data && typeof event.data.amount === 'number' && event.data.amount > 0) {
            const amount = event.data.amount;
            const type = event.type;
            
            if (category === 'all' || category === 'total') {
                totalSpentInPeriod += amount;
            }
            else if (category === 'tips' && type === 'tip') {
                totalSpentInPeriod += amount;
            }
            else if (category === 'privates' && (type === 'privateShow' || type === 'privateShowSpy')) {
                totalSpentInPeriod += amount;
            }
            else if (category === 'media' && type === 'mediaPurchase') {
                totalSpentInPeriod += amount;
            }
        }
    }
    return totalSpentInPeriod;
}