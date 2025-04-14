// userManager.js - Manages user data (loading, saving, updating)

import { debounce, displayError, parseTimestamp } from './utils.js';
import * as ui from './ui.js'; // Import ui for logging whale status
import db from './db.js';

// Constants for the new strategy (if any needed later)
// const MAX_HISTORY_PER_USER = 1000; // REMOVED - No longer storing full history per user
// const PRUNE_PERCENTAGE = 0.75; // REMOVED - Pruning strategy changed to time-based event deletion
// const MAX_PRUNE_ATTEMPTS = 3; // REMOVED

let users = new Map(); // In-memory store for user *aggregate* data

// --- Core Methods ---

export async function loadUsers() {
    try {
        // Load aggregate user data from the 'users' store
        const usersArray = await db.users.toArray();
        users.clear();
        usersArray.forEach(user => {
            // Key is username, value is the aggregate user object
            users.set(user.username, user);
        });
        console.log(`Loaded ${usersArray.length} user aggregates from IndexedDB.`);
        // Log the tokenStats of the first loaded user specifically
        if (usersArray.length > 0) {
            console.log(`loadUsers: Loaded sample user[0].tokenStats=`, JSON.parse(JSON.stringify(usersArray[0]?.tokenStats)));
        }
    } catch (error) { // Added closing '}' for try block
        console.error('Error loading users:', error);
        throw error;
    }
} // Added closing '}' for loadUsers function

// Creates the structure for lifetime aggregate stats
function createLifetimeTokenStats(username) {
    return {
        username: username, // Keep for reference if needed within stats object
        lifetimeTotalSpent: 0,
        lifetimeTotalTips: 0,
        lifetimeTotalPrivates: 0,
        lifetimeTotalMedia: 0,
        lastUpdated: null // Timestamp of the last event processed for this user
    };
}

export async function saveUsers() {
    try {
        // Save the aggregate user data (values from the map)
        const usersArray = Array.from(users.values());
        // Log the tokenStats of the first user specifically before saving
        if (usersArray.length > 0) {
            console.log(`saveUsers: Saving ${usersArray.length} users. Sample user[0].tokenStats=`, JSON.parse(JSON.stringify(usersArray[0]?.tokenStats)));
        } else {
            console.log(`saveUsers: No users to save.`);
        }
        await db.users.bulkPut(usersArray);
        // console.log(`Saved ${usersArray.length} user aggregates to IndexedDB`);
    } catch (error) {
        console.error('Error saving user aggregates:', error);
        // Avoid throwing here if possible, maybe retry or log more context
        // Consider if save failures should block operation or just be logged.
        // For now, re-throwing to maintain original behavior pattern.
        throw error;
    }
}

// Refactored addEvent for Aggregate & Tiered Retention strategy
export async function addEvent(username, type, data) {
    const isNewUser = addUser(username); // Ensures user aggregate record exists in memory
    const user = getUser(username);
    const eventData = data || {};
    console.log(`addEvent(${username}, ${type}): Received data=`, data); // Log incoming data
    const timestamp = parseTimestamp(eventData.timestamp) || new Date().toISOString();
    const amount = typeof eventData.amount === 'number' ? eventData.amount : 0;
    console.log(`addEvent(${username}, ${type}): Parsed amount=`, amount); // Log parsed amount

    // --- 1. Update In-Memory Aggregates ---
    if (!user.firstSeenDate || timestamp < user.firstSeenDate) {
        user.firstSeenDate = timestamp;
    }
    user.lastSeenDate = timestamp; // Always update last seen on any event
    user.tokenStats.lastUpdated = timestamp;

    if (amount > 0) {
        user.tokenStats.lifetimeTotalSpent += amount;
        if (type === 'tip') {
            user.tokenStats.lifetimeTotalTips += amount;
        } else if (type === 'privateShow' || type === 'privateShowSpy') {
            user.tokenStats.lifetimeTotalPrivates += amount;
        } else if (type === 'mediaPurchase') {
            user.tokenStats.lifetimeTotalMedia += amount;
        }
    }

    // Handle online/offline status (affects aggregate record only)
    if (type === 'userEnter') {
        user.isOnline = true;
    } else if (type === 'userLeave') {
        user.isOnline = false;
    }

    // --- 2. Create Detailed Event Record for Recent Storage ---
    const eventRecord = {
        username: username,
        timestamp: timestamp,
        type: type,
        amount: amount,
        note: eventData.note || '',
        // Add follow-specific data
        followData: type === 'follow' ? {
            broadcaster: eventData.object?.broadcaster || '',
            isFollower: eventData.object?.user?.isFollower || false
        } : undefined
    };

    // --- 3. Persist Changes ---
    try {
        // Add detailed event to the recent events store
        await db.recentEvents.add(eventRecord);

        // Trigger debounced save for the updated aggregate user data
        saveUsersDebounced();

        return isNewUser;
    } catch (error) {
        console.error(`Failed to add event to recentEvents store for ${username}:`, error, "Event:", eventRecord);
        // Decide on error handling: Should this stop processing? Log and continue?
        // For now, re-throwing to signal failure upstream.
        throw error;
    }
}

// Debounced save function
// Debounced save function for user aggregates
export const saveUsersDebounced = debounce(saveUsers, 3000); // 3 seconds debounce seems reasonable

// REMOVED: handleQuotaExceededError - Pruning is now handled by deleting old events from recentEvents store, not users.


// Creates or ensures an aggregate user record exists in the in-memory map
export function addUser(username) {
    let isNew = false;
    if (!users.has(username)) {
        isNew = true;
        users.set(username, {
            // No 'id' field needed, username is the key in the map and DB
            username: username,
            firstSeenDate: null,
            lastSeenDate: null,
            isOnline: false,
            // No 'eventHistory' or 'maxHistory'
            tokenStats: createLifetimeTokenStats(username) // Use the new stats structure
        });
        // Don't save immediately, let addEvent trigger the debounced save
        // saveUsersDebounced();
    }
    return isNew;
}

export function getUser(username) {
    return users.get(username);
}

export function getAllUsers() {
    return new Map(users); // Return a copy
}

// REMOVED: updateTokenStats - Aggregate updates are now handled directly within addEvent.

// REMOVED: recalculateAllUserStats - Aggregation is live; recalculation from history is not possible/needed.
// REMOVED: recalculateTotals - Aggregation is live; recalculation from history is not possible/needed.

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

// --- Refactored Whale Check Logic ---

// Note: This function becomes async because it queries the DB.
async function getLastEventOfType(username, type, maxLookback = 90) {
    const now = Date.now();
    const earliestTimestampISO = new Date(now - maxLookback * 24 * 60 * 60 * 1000).toISOString();
    
    try {
        const events = await db.recentEvents
            .where('[username+timestamp]')
            .between([username, earliestTimestampISO], [username, new Date(now).toISOString()], true, true)
            .filter(event => event.type === type)
            .reverse() // Most recent first
            .limit(1)
            .toArray();
        
        return events[0];
    } catch (error) {
        console.error(`Error finding last ${type} for ${username}:`, error);
        return null;
    }
}

function getTimeAgo(timestamp) {
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const days = Math.floor((now - then) / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days/7)} weeks ago`;
    if (days < 365) return `${Math.floor(days/30)} months ago`;
    return `${Math.floor(days/365)} years ago`;
}

export async function isWhale(username, thresholds) {
    const user = getUser(username); // Get aggregate data from memory
    if (!user || !user.tokenStats) {
        // console.debug(`isWhale: User ${username} not found or no stats.`);
        return false;
    }
    const stats = user.tokenStats;

    // Get temporal context
    const lastPrivate = await getLastEventOfType(username, 'privateShow');
    const lastTip = await getLastEventOfType(username, 'tip');
    const firstSeenAgo = getTimeAgo(user.firstSeenDate);
    const lastSeenAgo = getTimeAgo(user.lastSeenDate);

    // Build context message
    let contextMsg = '';
    if (user.firstSeenDate) {
        contextMsg += `\n        • First seen: ${firstSeenAgo}`;
    }
    if (lastTip) {
        contextMsg += `\n        • Last tip: ${getTimeAgo(lastTip.timestamp)} (${lastTip.amount} tokens)`;
    }
    if (lastPrivate) {
        contextMsg += `\n        • Last private: ${getTimeAgo(lastPrivate.timestamp)} (${lastPrivate.amount} tokens)`;
    }

    // Add welcome back message if they haven't been seen in a while
    const daysAway = (Date.now() - new Date(user.lastSeenDate).getTime()) / (1000 * 60 * 60 * 24);
    if (daysAway > 30) {
        contextMsg += `\n        • Welcome back after ${Math.floor(daysAway)} days!`;
    }

    // --- 1. Check Lifetime Aggregates ---
    if (thresholds.lifetimeSpendingThreshold > 0 && stats.lifetimeTotalSpent >= thresholds.lifetimeSpendingThreshold) {
        ui.addLogEntry(`🐳 ${username} is a WHALE!
        • Total Lifetime: ${stats.lifetimeTotalSpent} tokens
        • Tips: ${stats.lifetimeTotalTips} tokens
        • Privates: ${stats.lifetimeTotalPrivates} tokens
        • Media: ${stats.lifetimeTotalMedia} tokens${contextMsg}`);
        return true;
    }
    if (thresholds.totalLifetimeTipsThreshold > 0 && stats.lifetimeTotalTips >= thresholds.totalLifetimeTipsThreshold) {
        ui.addLogEntry(`🐳 ${username} is a TIPPING WHALE!
        • Total Tips: ${stats.lifetimeTotalTips} tokens
        • Overall Spent: ${stats.lifetimeTotalSpent} tokens
        • Privates: ${stats.lifetimeTotalPrivates} tokens${contextMsg}`);
        return true;
    }
    if (thresholds.totalPrivatesThreshold > 0 && stats.lifetimeTotalPrivates >= thresholds.totalPrivatesThreshold) {
        ui.addLogEntry(`🐳 ${username} is a PRIVATE SHOW WHALE!
        • Private Shows: ${stats.lifetimeTotalPrivates} tokens
        • Total Tips: ${stats.lifetimeTotalTips} tokens
        • Overall Spent: ${stats.lifetimeTotalSpent} tokens${contextMsg}`);
        return true;
    }

    // --- 2. Check Recent Activity (Requires DB Query) ---
    let recentEvents = [];
    const now = Date.now();
    const recentTipSeconds = thresholds.recentTipTimeframe || 0;
    const recentPrivateSeconds = thresholds.recentPrivateTimeframe || 0;
    const largeTipThreshold = thresholds.recentLargeTipThreshold || 0;

    // Determine the maximum lookback needed for any recent check
    const maxLookbackSeconds = Math.max(recentTipSeconds, recentPrivateSeconds);

    if (maxLookbackSeconds > 0) {
        try {
            const earliestTimestampISO = new Date(now - maxLookbackSeconds * 1000).toISOString();
            // console.debug(`isWhale: Querying recentEvents for ${username} from ${earliestTimestampISO}`);
            recentEvents = await db.recentEvents
                .where('[username+timestamp]')
                .between([username, earliestTimestampISO], [username, new Date(now).toISOString()], true, true) // Inclusive start, inclusive end
                .toArray();
            // console.debug(`isWhale: Found ${recentEvents.length} recent events for ${username}`);
        } catch (error) {
            console.error(`Error querying recentEvents for ${username} in isWhale:`, error);
            return false; // Cannot perform recent checks if DB query fails
        }
    } else {
        // console.debug(`isWhale: No recent timeframes configured for ${username}, skipping DB query.`);
    }


    // --- 3. Process Recent Events for Threshold Checks ---
    let recentTipSum = 0;
    let recentPrivateSum = 0;
    let foundLargeTip = false;

    const recentTipCutoff = now - recentTipSeconds * 1000;
    const recentPrivateCutoff = now - recentPrivateSeconds * 1000;

    for (const event of recentEvents) {
        const eventTime = new Date(event.timestamp).getTime();

        // Check Recent Tips
        if (recentTipSeconds > 0 && event.type === 'tip' && eventTime >= recentTipCutoff) {
            recentTipSum += event.amount;
            // Check Large Single Tip (within the recent tip timeframe)
            if (largeTipThreshold > 0 && event.amount >= largeTipThreshold) {
                foundLargeTip = true;
            }
        }

        // Check Recent Privates
        if (recentPrivateSeconds > 0 && (event.type === 'privateShow' || event.type === 'privateShowSpy') && eventTime >= recentPrivateCutoff) {
            recentPrivateSum += event.amount;
        }
    }

    // --- 4. Evaluate Recent Thresholds ---
    if (recentTipSeconds > 0 && thresholds.recentTipThreshold > 0 && recentTipSum >= thresholds.recentTipThreshold) {
        ui.addLogEntry(`🐳 ${username} is a RECENT WHALE!
        • Recent Tips: ${recentTipSum} tokens in last ${Math.floor(recentTipSeconds/60)}min
        • Lifetime Total: ${stats.lifetimeTotalSpent} tokens${contextMsg}`);
        return true;
    }
    if (recentTipSeconds > 0 && largeTipThreshold > 0 && foundLargeTip) {
        ui.addLogEntry(`🐳 ${username} is a BIG TIPPER WHALE!
        • Large Tip: ${largeTipThreshold}+ tokens
        • Total Tips: ${stats.lifetimeTotalTips} tokens
        • Overall Spent: ${stats.lifetimeTotalSpent} tokens${contextMsg}`);
        return true;
    }
    if (recentPrivateSeconds > 0 && thresholds.recentPrivateThreshold > 0 && recentPrivateSum >= thresholds.recentPrivateThreshold) {
        ui.addLogEntry(`🐳 ${username} is a WHALE (Recent Privates: ${recentPrivateSum} >= ${thresholds.recentPrivateThreshold} in ${recentPrivateSeconds}s)${contextMsg}`);
        return true;
    }

    // console.debug(`isWhale: ${username} did not meet any whale criteria.`);
    return false;
}

// --- User Data Management ---

// Clears both aggregate user data and recent events
export async function clearAllUsers() {
    console.log("Clearing all user aggregates and recent events...");
    users.clear(); // Clear in-memory map
    try {
        await db.transaction('rw', db.users, db.recentEvents, async () => {
            await db.users.clear();
            await db.recentEvents.clear();
        });
        console.log("Cleared users and recentEvents tables in IndexedDB.");
    } catch (error) {
        console.error("Error clearing user data from IndexedDB:", error);
        // Decide if UI feedback is needed
        displayError("Failed to clear all user data from the database.");
    }
    // No need to call saveUsers() as we just cleared everything.
}

// Imports a user aggregate record (assumes new format)
export function importUser(userObject) {
    if (!userObject || !userObject.username) {
        console.warn("Skipping invalid user object during import:", userObject);
        return;
    }
    const username = userObject.username;
    const defaultLifetimeStats = createLifetimeTokenStats(username);

    // Create a clean aggregate object based on the expected structure
    const aggregateUser = {
        username: username,
        firstSeenDate: userObject.firstSeenDate || null,
        lastSeenDate: userObject.lastSeenDate || null,
        isOnline: false, // Assume offline on import
        tokenStats: {
            ...defaultLifetimeStats, // Start with defaults
            ...(userObject.tokenStats || {}) // Overlay imported stats
        }
        // Ensure no eventHistory or timePeriods are carried over
    };
    // Remove potentially invalid fields from imported stats
    delete aggregateUser.tokenStats.timePeriods;
    delete aggregateUser.tokenStats.totalSpent; // Use lifetimeTotalSpent etc.
    delete aggregateUser.tokenStats.totalTips;
    delete aggregateUser.tokenStats.totalPrivates;
    delete aggregateUser.tokenStats.totalMedia;


    users.set(username, aggregateUser);
}
// Note: Importing detailed *recentEvents* is not handled here.
// The plan suggests import should replace data initially.

// --- Getters for Stats ---
// Gets a *copy* of the user's lifetime aggregate stats
export function getUserStats(username) {
    const user = getUser(username);
    // Return a deep copy to prevent accidental modification of the in-memory store
    return user ? JSON.parse(JSON.stringify(user.tokenStats)) : createLifetimeTokenStats(username);
}

// Getters for specific lifetime stats
export function getTotalSpent(username) { return getUserStats(username).lifetimeTotalSpent; }
export function getTotalTips(username) { return getUserStats(username).lifetimeTotalTips; }
export function getTotalPrivates(username) { return getUserStats(username).lifetimeTotalPrivates; }
export function getTotalMedia(username) { return getUserStats(username).lifetimeTotalMedia; } // Added getter for media

// Refactored getSpentInPeriod to query recentEvents store
// Note: This function becomes async because it queries the DB.
export async function getSpentInPeriod(username, days, category = 'total') {
    if (days <= 0) return 0;

    const now = Date.now();
    const startTimeISO = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
    let totalSpentInPeriod = 0;

    try {
        const recentUserEvents = await db.recentEvents
            .where('[username+timestamp]')
            .between([username, startTimeISO], [username, new Date(now).toISOString()], true, true)
            .toArray();
        console.log(`getSpentInPeriod(${username}, ${days}, ${category}): Found ${recentUserEvents.length} events:`, recentUserEvents); // Log found events

        for (const event of recentUserEvents) {
            if (event.amount > 0) {
                const amount = event.amount;
                const type = event.type;

                if (category === 'total') {
                    totalSpentInPeriod += amount;
                } else if (category === 'tips' && type === 'tip') {
                    totalSpentInPeriod += amount;
                } else if (category === 'privates' && (type === 'privateShow' || type === 'privateShowSpy')) {
                    totalSpentInPeriod += amount;
                } else if (category === 'media' && type === 'mediaPurchase') {
                    totalSpentInPeriod += amount;
                }
                // Add other categories if needed
            }
        }
        return totalSpentInPeriod;
    } catch (error) {
        console.error(`Error querying recentEvents for ${username} in getSpentInPeriod:`, error);
        return 0; // Return 0 on error
    }
}

// REMOVED: calculateSpentInPeriodOnTheFly - Replaced by the async getSpentInPeriod above.