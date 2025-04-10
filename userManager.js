// userManager.js - Manages user data (loading, saving, updating)

import { debounce, displayError, parseTimestamp } from './utils.js';
import * as ui from './ui.js'; // Import ui for logging whale status
import db from './db.js';

const USERS_KEY = 'whaleBellUsers';
const MAX_HISTORY_PER_USER = 1000; // As per spec
const PRUNE_PERCENTAGE = 0.75; // Prune 75% of users on QuotaExceededError (More aggressive)
const MAX_PRUNE_ATTEMPTS = 3; // Limit pruning attempts to prevent infinite loops

let users = new Map(); // In-memory store for user data

// --- Core Methods ---

export async function loadUsers() {
    try {
        const usersArray = await db.users.toArray();
        users.clear();
        usersArray.forEach(user => {
            users.set(user.id, user);
        });
        console.log(`Loaded ${users.size} users from IndexedDB`);
    } catch (error) {
        console.error('Error loading users:', error);
        throw error;
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

export async function saveUsers() {
    try {
        const usersArray = Array.from(users.values());
        
        // Validate and ensure all users have an id field
        const validUsers = usersArray.map(user => {
            if (!user.id) {
                user.id = user.username; // Use username as id if missing
            }
            return user;
        });
        
        await db.users.bulkPut(validUsers);
        console.log(`Saved ${validUsers.length} users to IndexedDB`);
    } catch (error) {
        console.error('Error saving users:', error);
        throw error;
    }
}

export async function addEvent(username, type, data) {
    const isNewUser = addUser(username);
    const user = getUser(username);
    const eventData = data || {};
    const timestamp = parseTimestamp(eventData.timestamp) || new Date().toISOString();

    // Create event object
    const event = {
        userId: username,
        type: type,
        timestamp: timestamp,
        data: { ...eventData }
    };

    try {
        // Store in IndexedDB
        console.log(`userManager.addEvent: Preparing to save event for user ${username}:`, JSON.stringify(event, null, 2));
        await db.events.add(event);
        console.log(`userManager.addEvent: Event added to DB for user ${username}.`);
        // Update in-memory user data
        if (!user.firstSeenDate || timestamp < user.firstSeenDate) user.firstSeenDate = timestamp;
        if (!user.lastSeenDate || timestamp > user.lastSeenDate) user.lastSeenDate = timestamp;

        // Update event history
        user.eventHistory.unshift(event);
        if (user.eventHistory.length > user.maxHistory) user.eventHistory.pop();

        // Update stats if event has amount
        if (eventData && typeof eventData.amount === 'number' && eventData.amount > 0) {
            updateTokenStats(user, event);
        }

        // Handle online/offline status
        if (type === 'userEnter') markUserOnline(username, false);
        else if (type === 'userLeave') markUserOffline(username, false);

        // Save changes
        // console.log(`userManager.addEvent: Preparing to save user map state after event processing for ${username}. Current user state:`, JSON.stringify(getUser(username), null, 2));
        await saveUsers();
        
        return isNewUser;
    } catch (error) {
        console.error('Error adding event:', error, "User:", JSON.stringify(getUser(username), null, 2), "Event:", JSON.stringify(event, null, 2));
        throw error;
    }
}

// Debounced save function
export const saveUsersDebounced = debounce(saveUsers, 5000); // Increased from 1500ms to 5000ms

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
            id: username, // Add id field matching username
            username: username,
            firstSeenDate: null, lastSeenDate: null, isOnline: false,
            eventHistory: [],
            tokenStats: createDefaultTokenStats(username),
            maxHistory: MAX_HISTORY_PER_USER
        });
        saveUsersDebounced();
    }
    return isNew;
}

export function getUser(username) {
    return users.get(username);
}

export function getAllUsers() {
    return new Map(users); // Return a copy
}

// --- Token Stats Calculation with Detailed Logging ---

function updateTokenStats(user, event) {
    const amount = event.data.amount;
    if (typeof amount !== 'number' || amount <= 0) return;

    const eventTime = new Date(event.timestamp).getTime();
    const now = Date.now();
    const stats = user.tokenStats;

    // Remove console.group and detailed logging
    stats.totalSpent = (stats.totalSpent || 0) + amount;
    let category = 'other';
        
    if (event.type === 'tip') {
        stats.totalTips = (stats.totalTips || 0) + amount;
        category = 'tips';
    } else if (event.type === 'privateShow' || event.type === 'privateShowSpy') {
        stats.totalPrivates = (stats.totalPrivates || 0) + amount;
        category = 'privates';
    } else if (event.type === 'mediaPurchase') {
        stats.totalMedia = (stats.totalMedia || 0) + amount;
        category = 'media';
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
        }
    }
        
    stats.lastUpdated = new Date().toISOString();
}

export function recalculateAllUserStats() {
    console.log("Recalculating stats for all users...");
    let count = 0;
    users.forEach(user => { recalculateTotals(user, false); count++; });
    saveUsersDebounced();
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
    if (shouldSave) saveUsersDebounced();
}

// --- Online/Offline Status ---

export function markUserOnline(username, shouldSave = true) {
    const user = getUser(username);
    if (user && !user.isOnline) {
        user.isOnline = true; user.lastSeenDate = new Date().toISOString();
        if (shouldSave) saveUsersDebounced();
    }
}

export function markUserOffline(username, shouldSave = true) {
    const user = getUser(username);
    if (user && user.isOnline) {
        user.isOnline = false; user.lastSeenDate = new Date().toISOString();
        if (shouldSave) saveUsersDebounced();
    }
}

// --- Whale Check Logic with Detailed Logging ---

export function isWhale(username, thresholds) {
    const user = getUser(username);
    if (!user || !user.tokenStats) { return false; }
    const stats = user.tokenStats;
    
    console.group(`🐳 Whale Check for ${username}`);
    console.log(`User stats:`, {
        totalSpent: stats.totalSpent,
        totalTips: stats.totalTips,
        totalPrivates: stats.totalPrivates,
        totalMedia: stats.totalMedia
    });
    
    // Check lifetime spending first (most common case)
    console.log(`Lifetime spending check: ${stats.totalSpent} >= ${thresholds.lifetimeSpendingThreshold}`);
    if (stats.totalSpent >= thresholds.lifetimeSpendingThreshold) {
        console.log(`✨ IS WHALE: Lifetime spending threshold met`);
        console.groupEnd();
        return true;
    }

    // Check lifetime tips
    console.log(`Lifetime tips check: ${stats.totalTips} >= ${thresholds.totalLifetimeTipsThreshold}`);
    if (stats.totalTips >= thresholds.totalLifetimeTipsThreshold) {
        console.log(`✨ IS WHALE: Lifetime tips threshold met`);
        console.groupEnd();
        return true;
    }

    // Check lifetime privates
    console.log(`Lifetime privates check: ${stats.totalPrivates} >= ${thresholds.totalPrivatesThreshold}`);
    if (stats.totalPrivates >= thresholds.totalPrivatesThreshold) {
        console.log(`✨ IS WHALE: Lifetime privates threshold met`);
        console.groupEnd();
        return true;
    }

    // Check recent tips if timeframe > 0
    const recentTipSeconds = thresholds.recentTipTimeframe;
    if (recentTipSeconds > 0) {
        const recentTipDays = Math.ceil(recentTipSeconds / 86400);
        const recentTips = getSpentInPeriod(username, recentTipDays, 'tips');
        console.log(`Recent tips check (${recentTipDays} days): ${recentTips} >= ${thresholds.recentTipThreshold}`);
        if (recentTips >= thresholds.recentTipThreshold) {
            console.log(`✨ IS WHALE: Recent tips threshold met`);
            console.groupEnd();
            return true;
        }
    }

    // Check recent privates if timeframe > 0
    const recentPrivateSeconds = thresholds.recentPrivateTimeframe;
    if (recentPrivateSeconds > 0) {
        const recentPrivateDays = Math.ceil(recentPrivateSeconds / 86400);
        const recentPrivates = getSpentInPeriod(username, recentPrivateDays, 'privates');
        console.log(`Recent privates check (${recentPrivateDays} days): ${recentPrivates} >= ${thresholds.recentPrivateThreshold}`);
        if (recentPrivates >= thresholds.recentPrivateThreshold) {
            console.log(`✨ IS WHALE: Recent privates threshold met`);
            console.groupEnd();
            return true;
        }
    }

    // Check large tips if threshold > 0
    const largeTipThreshold = thresholds.recentLargeTipThreshold;
    if (largeTipThreshold > 0 && recentTipSeconds > 0) {
        const periodStart = Date.now() - recentTipSeconds * 1000;
        console.log(`Checking for large tips >= ${largeTipThreshold} in last ${recentTipSeconds} seconds...`);
        for (const event of user.eventHistory) {
            const eventTime = new Date(event.timestamp).getTime();
            if (eventTime < periodStart) break;
            if (event.type === 'tip' && event.data?.amount >= largeTipThreshold) {
                console.log(`✨ IS WHALE: Large single tip found (${event.data.amount} tokens) at ${event.timestamp}`);
                console.groupEnd();
                return true;
            }
        }
    }

    console.log(`❌ Not a whale: No thresholds met`);
    console.groupEnd();
    return false;
}

// --- User Data Management ---

export function clearAllUsers() {
    console.log("Clearing all user data...");
    users.clear();
    saveUsers(); // Persist immediately
}

export function importUser(userObject) {
     if (!userObject || !userObject.username) { console.warn("Skipping invalid user object during import:", userObject); return; }
     const username = userObject.username;
     const defaultStats = createDefaultTokenStats(username);
     userObject.id = username; // Ensure id field exists
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