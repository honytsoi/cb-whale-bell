// dataManager.js - Handles data import/export, validation, backup, and reset

import * as userManager from './userManager.js';
import * as configManager from './config.js';
import * as ui from './ui.js';
import { displayError, parseTimestamp } from './utils.js';
// PapaParse and CryptoJS are assumed to be loaded globally via CDN

const BACKUP_KEY = 'whaleBellBackup';
const MAX_FILE_SIZE_MB = 10;
const CURRENT_APP_VERSION = "1.1"; // Matches spec
const PRIVATE_SHOW_GROUPING_THRESHOLD_SECONDS = 30; // Max time gap for grouping private/spy entries

// --- CSV Import ---

export function handleTokenHistoryImport(file) {
    console.log(`Handling token history import: ${file.name}`);
    ui.displayMessage('Starting CSV import...', 'info', 'dataManagementResult', 0); // No timeout

    if (!file || !file.name.toLowerCase().endsWith('.csv')) {
        ui.displayMessage('Invalid file type. Please select a .csv file.', 'error', 'dataManagementResult');
        return;
    }

    if (!isFileSizeValid(file)) {
        ui.displayMessage(`File size exceeds ${MAX_FILE_SIZE_MB}MB limit.`, 'error', 'dataManagementResult');
        return;
    }

    // Use PapaParse to read the file
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            console.log("CSV parsing complete:", results);
            if (results.errors.length > 0) {
                console.error("CSV parsing errors:", results.errors);
                ui.displayMessage(`CSV parsing error: ${results.errors[0].message} (Row ${results.errors[0].row})`, 'error', 'dataManagementResult');
                return;
            }
            if (!validateCsvHeaders(results.meta.fields)) {
                 ui.displayMessage('CSV missing required columns (User, Token change, Timestamp, Note).', 'error', 'dataManagementResult');
                return;
            }
            setTimeout(() => processCsvData(results.data), 0); // Process async
        },
        error: (error) => {
            console.error("PapaParse error:", error);
            ui.displayMessage(`Failed to parse CSV: ${error.message}`, 'error', 'dataManagementResult');
        }
    });
}

function validateCsvHeaders(headers) {
    const requiredHeaders = ["User", "Token change", "Timestamp", "Note"];
    const normalizedHeaders = headers.map(h => h.trim().toLowerCase());
    return requiredHeaders.every(reqHeader => normalizedHeaders.includes(reqHeader.toLowerCase()));
}

function processCsvData(data) {
    console.log("Processing CSV data rows:", data.length);
    ui.displayMessage(`Processing ${data.length} CSV rows... This might take a while.`, 'info', 'dataManagementResult', 0);

    let importedTokenCount = 0;
    let processedUserCount = new Set();
    let eventsAddedCount = 0;
    let duplicatesSkippedCount = 0;
    let privateShowsCreated = 0;
    let spyShowsCreated = 0;

    // --- Pre-processing: Group data by user and sort by timestamp ---
    const userData = {};
    data.forEach(row => {
        const username = row.User?.trim();
        const amountStr = row["Token change"];
        const timestampStr = row.Timestamp;
        const note = row.Note?.trim() || '';

        if (!username || !amountStr || !timestampStr) return;
        const amount = parseFloat(amountStr);
        const timestamp = parseTimestamp(timestampStr);
        if (isNaN(amount) || amount <= 0 || !timestamp) return;

        if (!userData[username]) userData[username] = [];
        userData[username].push({ username, amount, timestamp, note, originalRow: row });
    });

    for (const username in userData) {
        userData[username].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }

    // --- Processing Logic (Iterate through users and their sorted events) ---
    let usersProcessed = 0;
    const totalUsers = Object.keys(userData).length;

    for (const username in userData) {
        usersProcessed++;
        if (usersProcessed % 50 === 0) { // Update progress periodically
             ui.displayMessage(`Processing CSV: User ${usersProcessed}/${totalUsers}...`, 'info', 'dataManagementResult', 0);
        }

        processedUserCount.add(username);
        // Ensure user exists in userManager before getting history/signatures
        userManager.addUser(username); // Creates user if doesn't exist
        const existingUser = userManager.getUser(username); // Now guaranteed to exist
        const existingEventSignatures = new Set();

        if (existingUser?.eventHistory) {
            existingUser.eventHistory.forEach(event => {
                const signature = createEventSignature(event);
                if (signature) existingEventSignatures.add(signature);
            });
        }

        let i = 0;
        while (i < userData[username].length) {
            const currentEvent = userData[username][i];
            const noteLower = currentEvent.note.toLowerCase();
            const isPotentialPrivate = noteLower.includes('private');
            const isPotentialSpy = noteLower.includes('spy');

            // --- Duplicate Check (using signature of the raw CSV event) ---
            const csvEventSignature = `${currentEvent.username}-${currentEvent.timestamp}-${currentEvent.amount.toFixed(2)}`;
            if (existingEventSignatures.has(csvEventSignature)) {
                duplicatesSkippedCount++;
                i++;
                continue; // Skip this raw event if its exact signature exists
            }

            // --- Private/Spy Show Grouping ---
            if (isPotentialPrivate || isPotentialSpy) {
                let showGroup = [currentEvent];
                let showTotal = currentEvent.amount;
                let j = i + 1;

                while (j < userData[username].length) {
                    const nextEvent = userData[username][j];
                    const timeDiffSeconds = (new Date(nextEvent.timestamp).getTime() - new Date(userData[username][showGroup.length - 1].timestamp).getTime()) / 1000; // This line seems complex, let's re-evaluate the logic
                    if (timeDiffSeconds >= PRIVATE_SHOW_GROUPING_THRESHOLD_SECONDS) break;

                    const nextNoteLower = nextEvent.note.toLowerCase();
                    if (nextNoteLower.includes('private') || nextNoteLower.includes('spy')) {
                         const nextCsvEventSignature = `${nextEvent.username}-${nextEvent.timestamp}-${nextEvent.amount.toFixed(2)}`;
                         if (existingEventSignatures.has(nextCsvEventSignature)) {
                             duplicatesSkippedCount++;
                         } else {
                            showGroup.push(nextEvent);
                            showTotal += nextEvent.amount;
                         }
                         j++;
                    } else {
                        break;
                    }
                }

                if (showGroup.length > 0) {
                    const startTime = showGroup[0].timestamp;
                    const endTime = showGroup[showGroup.length - 1].timestamp;
                    const duration = Math.max(0, (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000);
                    const showType = isPotentialSpy ? 'privateShowSpy' : 'privateShow';

                    const metaEventData = {
                        timestamp: startTime, startTime: startTime, endTime: endTime,
                        duration: duration, tokens: showTotal, amount: showTotal,
                    };

                    const metaEventSignature = createEventSignature({ type: showType, timestamp: startTime, data: metaEventData });
                    if (metaEventSignature && existingEventSignatures.has(metaEventSignature)) {
                         duplicatesSkippedCount++;
                    } else {
                        // Use addEvent directly - it handles adding user and saving (debounced)
                        userManager.addEvent(username, showType, metaEventData);
                        eventsAddedCount++;
                        importedTokenCount += showTotal;
                        if (showType === 'privateShow') privateShowsCreated++; else spyShowsCreated++;
                        if (metaEventSignature) existingEventSignatures.add(metaEventSignature);
                    }

                    showGroup.forEach(groupedEvent => {
                         const groupedCsvSignature = `${groupedEvent.username}-${groupedEvent.timestamp}-${groupedEvent.amount.toFixed(2)}`;
                         existingEventSignatures.add(groupedCsvSignature);
                    });

                    i = j; continue;
                }
            }

            // --- Regular Tip Processing ---
            const tipData = { amount: currentEvent.amount, note: currentEvent.note, timestamp: currentEvent.timestamp };
            const tipEventSignature = createEventSignature({ type: 'tip', timestamp: currentEvent.timestamp, data: tipData });

            if (tipEventSignature && existingEventSignatures.has(tipEventSignature)) {
                 duplicatesSkippedCount++;
            } else {
                // Use addEvent directly
                userManager.addEvent(username, 'tip', tipData);
                eventsAddedCount++;
                importedTokenCount += currentEvent.amount;
                if (tipEventSignature) existingEventSignatures.add(tipEventSignature);
            }
            existingEventSignatures.add(csvEventSignature); // Add raw sig regardless

            i++;
        }
         // Recalculate totals for the user after processing all their CSV events
         // Pass the user object directly, don't rely on closure
         userManager.recalculateTotals(userManager.getUser(username), false); // Don't save yet
    }

    userManager.saveUsers(); // Final save after all users processed

    let summary = `CSV Import Complete: Added ${eventsAddedCount} events (${importedTokenCount.toFixed(0)} tokens) for ${processedUserCount.size} users.`;
    if (duplicatesSkippedCount > 0) summary += ` Skipped ${duplicatesSkippedCount} duplicate entries.`;
    if (privateShowsCreated > 0) summary += ` Created ${privateShowsCreated} Private Show groups.`;
    if (spyShowsCreated > 0) summary += ` Created ${spyShowsCreated} Spy Show groups.`;
    ui.displayMessage(summary, 'success', 'dataManagementResult', 15000);
    console.log(summary);
}

// Helper to create a consistent signature for duplicate checking
function createEventSignature(event) {
    if (!event || !event.timestamp || !event.type) return null;
    let amountStr = "0.00";
    const amountVal = event.data?.amount ?? event.data?.tokens; // Use amount or tokens
    if (typeof amountVal === 'number') {
        amountStr = parseFloat(amountVal).toFixed(2);
    }
    // Signature: type-timestampISO-amount
    return `${event.type}-${event.timestamp}-${amountStr}`;
}


// --- JSON Export/Import ---

export function exportData() {
    console.log("Exporting data...");
    ui.displayMessage('Preparing data for export...', 'info', 'dataManagementResult', 0);
    try {
        const usersMap = userManager.getAllUsers();
        const usersArray = Array.from(usersMap.values());
        const settings = configManager.getConfig();
        const exportObj = { version: CURRENT_APP_VERSION, timestamp: new Date().toISOString(), users: usersArray, settings: settings };
        let jsonData = JSON.stringify(exportObj, null, 2);
        const passwordEnabled = document.getElementById('enablePassword')?.checked;
        const password = document.getElementById('dataPassword')?.value;
        let fileNameSuffix = '';
        if (passwordEnabled && password) {
            jsonData = CryptoJS.AES.encrypt(jsonData, password).toString();
            fileNameSuffix = '-encrypted';
            ui.displayMessage('Data encrypted. Starting download...', 'info', 'dataManagementResult');
        } else { ui.displayMessage('Starting download...', 'info', 'dataManagementResult'); }
        const blob = new Blob([jsonData], { type: passwordEnabled ? 'text/plain' : 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `whale-bell-backup-${new Date().toISOString().split('T')[0]}${fileNameSuffix}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        ui.displayMessage('Export successful!', 'success', 'dataManagementResult');
    } catch (error) {
        console.error("Error during data export:", error);
        ui.displayMessage(`Export failed: ${error.message}`, 'error', 'dataManagementResult');
        displayError("Export failed", error);
    }
}

export function handleDataImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    console.log(`Handling data import: ${file.name}`);
    ui.displayMessage('Starting JSON import...', 'info', 'dataManagementResult', 0);
    if (!file.name.toLowerCase().endsWith('.json')) { ui.displayMessage('Invalid file type...', 'error'); return; }
    if (!isFileSizeValid(file)) { ui.displayMessage(`File size exceeds limit...`, 'error'); return; }
    const reader = new FileReader();
    reader.onload = (e) => { let fileContent = e.target.result; setTimeout(() => processImportedJson(fileContent), 0); }; // Process async
    reader.onerror = (error) => { ui.displayMessage(`Failed to read file...`, 'error'); };
    reader.readAsText(file);
    event.target.value = '';
}

function processImportedJson(jsonData) {
    ui.displayMessage('Processing imported JSON data...', 'info', 'dataManagementResult', 0);
    try {
        let parsedData;
        const passwordEnabled = document.getElementById('enablePassword')?.checked;
        const password = document.getElementById('dataPassword')?.value;

        // --- Decryption & Parsing ---
        if (passwordEnabled && !password) { ui.displayMessage('Password needed...', 'error'); return; }
        if (passwordEnabled && password) {
            ui.displayMessage('Decrypting data...', 'info', 'dataManagementResult', 0);
            try {
                const bytes = CryptoJS.AES.decrypt(jsonData, password);
                const decryptedData = bytes.toString(CryptoJS.enc.Utf8);
                if (!decryptedData) { throw new Error("Decryption failed (wrong password/corrupted?)."); }
                jsonData = decryptedData;
                ui.displayMessage('Decryption successful. Parsing JSON...', 'info', 'dataManagementResult', 0);
                parsedData = JSON.parse(jsonData);
            } catch (error) {
                console.error("Decryption/Parsing failed:", error);
                ui.displayMessage(`Import Failed: ${error.message}`, 'error', 'dataManagementResult');
                return;
            }
        } else {
             try {
                 ui.displayMessage('Parsing JSON...', 'info', 'dataManagementResult', 0);
                 parsedData = JSON.parse(jsonData);
             } catch (parseError) {
                  console.error("JSON Parsing failed:", parseError);
                  if (jsonData.startsWith("U2FsdGVkX1")) {
                       ui.displayMessage('Import Failed: File seems encrypted, but no password was provided or it was incorrect.', 'error', 'dataManagementResult');
                  } else {
                       ui.displayMessage(`Import Failed: Invalid JSON format. ${parseError.message}`, 'error', 'dataManagementResult');
                  }
                  return;
             }
        }

        // --- Validation ---
        if (!validateImportData(parsedData)) { return; } // Validation shows error

        // --- Backup ---
        createBackup();

        // --- Merge or Replace ---
        const merge = document.getElementById('mergeData')?.checked;
        let importSummary = '';

        if (merge) {
            console.log("Merging imported data...");
            ui.displayMessage('Merging imported data... This may take time.', 'info', 'dataManagementResult', 0);
            importSummary = mergeUsers(parsedData.users); // Call merge function
        } else {
            console.log("Replacing existing data with imported data...");
            ui.displayMessage('Replacing existing data...', 'info', 'dataManagementResult', 0);
            userManager.clearAllUsers(); // Clear existing users first
            parsedData.users.forEach(user => userManager.importUser(user)); // Use importUser method
            // Recalculate all stats after replacing data
            userManager.recalculateAllUserStats();
            importSummary = `Replaced data with ${parsedData.users.length} users from import file.`;
        }

        // --- Apply Settings & Save ---
        ui.displayMessage('Applying settings and saving...', 'info', 'dataManagementResult', 0);
        configManager.updateConfig(parsedData.settings);
        configManager.saveConfig();
        ui.populateSettings(); // Update UI with new settings
        userManager.saveUsers(); // Final save of potentially modified user data

        ui.displayMessage(`Import successful! ${importSummary} Reloading application...`, 'success', 'dataManagementResult', 10000);
        console.log(`Import successful! ${importSummary}`);
        setTimeout(() => window.location.reload(), 2000); // Reload for clean state

    } catch (error) {
        console.error("Error processing imported JSON:", error);
        ui.displayMessage(`Import failed: ${error.message}`, 'error', 'dataManagementResult');
        displayError("JSON Import failed", error);
    }
}

// --- Merge Logic ---
function mergeUsers(importedUsers) {
    let newUsers = 0;
    let mergedUsers = 0;
    let usersProcessed = 0;
    const totalToProcess = importedUsers.length;

    importedUsers.forEach(importedUser => {
        usersProcessed++;
        if (usersProcessed % 20 === 0) { // Update progress
             ui.displayMessage(`Merging user data: ${usersProcessed}/${totalToProcess}...`, 'info', 'dataManagementResult', 0);
        }

        if (!importedUser || !importedUser.username) {
            console.warn("Skipping invalid user object during merge:", importedUser);
            return;
        }

        const username = importedUser.username;
        const existingUser = userManager.getUser(username);

        if (existingUser) {
            // --- Merge Existing User ---
            mergedUsers++;

            // Merge seen dates
            if (importedUser.firstSeenDate && (!existingUser.firstSeenDate || importedUser.firstSeenDate < existingUser.firstSeenDate)) {
                existingUser.firstSeenDate = importedUser.firstSeenDate;
            }
            if (importedUser.lastSeenDate && (!existingUser.lastSeenDate || importedUser.lastSeenDate > existingUser.lastSeenDate)) {
                existingUser.lastSeenDate = importedUser.lastSeenDate;
            }

            // Merge event history
            const combinedHistory = [...(existingUser.eventHistory || []), ...(importedUser.eventHistory || [])];
            const uniqueEventsMap = new Map();

            combinedHistory.forEach(event => {
                const signature = createEventSignature(event);
                // Keep the first occurrence (which might be existing or imported)
                // If timestamps differ slightly for "same" event, this keeps one.
                if (signature && !uniqueEventsMap.has(signature)) {
                    uniqueEventsMap.set(signature, event);
                } else if (!signature) {
                    // Handle events without a clear signature? Maybe add anyway?
                    // For now, we only merge events with signatures.
                    console.warn("Event without signature during merge:", event);
                }
            });

            // Sort merged unique events (newest first)
            const mergedUniqueEvents = Array.from(uniqueEventsMap.values());
            mergedUniqueEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            // Truncate and update history
            existingUser.eventHistory = mergedUniqueEvents.slice(0, userManager.MAX_HISTORY_PER_USER || 1000);

            // Recalculate stats based on merged history
            userManager.recalculateTotals(existingUser, false); // Don't save yet

        } else {
            // --- Add New User ---
            newUsers++;
            userManager.importUser(importedUser); // Adds the user via userManager
             // Recalculate totals for the newly imported user as well
             userManager.recalculateTotals(userManager.getUser(username), false); // Don't save yet
        }
    });

    return `Merged data: Added ${newUsers} new users, merged ${mergedUsers} existing users.`;
}


function validateImportData(data) {
    if (!data || typeof data !== 'object') {
        ui.displayMessage('Invalid import file format (not an object).', 'error', 'dataManagementResult');
        return false;
    }
    if (data.version && data.version !== CURRENT_APP_VERSION) {
        ui.displayMessage(`Warning: Import file version (${data.version}) differs from app version (${CURRENT_APP_VERSION}). Data structure might be incompatible.`, 'info', 'dataManagementResult', 10000);
        console.warn(`Import file version (${data.version}) differs from app version (${CURRENT_APP_VERSION}).`);
    } else if (!data.version) {
         ui.displayMessage(`Warning: Import file missing version information. Data structure might be incompatible.`, 'info', 'dataManagementResult', 10000);
         console.warn(`Import file missing version information.`);
    }
    if (!Array.isArray(data.users)) {
         ui.displayMessage('Invalid import data: "users" array is missing or not an array.', 'error', 'dataManagementResult');
        return false;
    }
     if (typeof data.settings !== 'object' || data.settings === null) {
        ui.displayMessage('Invalid import data: "settings" object is missing or not an object.', 'error', 'dataManagementResult');
        return false;
    }
    // Add more granular validation? Check if users have username?
    return true;
}

// --- Backup & Reset ---

function createBackup() {
    console.log("Creating backup of current data...");
    try {
        const usersMap = userManager.getAllUsers();
        const usersArray = Array.from(usersMap.values());
        const settings = configManager.getConfig();
        const backupData = { backupTimestamp: new Date().toISOString(), version: CURRENT_APP_VERSION, users: usersArray, settings: settings };
        localStorage.setItem(BACKUP_KEY, JSON.stringify(backupData));
        console.log("Backup created successfully.");
        ui.displayMessage('Backup of current data created before import.', 'info', 'dataManagementResult', 5000);
    } catch (error) {
        console.error("Failed to create backup:", error);
        // Don't stop import, but warn
        ui.displayMessage('Warning: Failed to create backup before import.', 'error', 'dataManagementResult');
    }
}

export function factoryReset() {
    console.warn("Performing factory reset!");
    if (confirm("ARE YOU SURE?\n\nThis will permanently delete ALL stored user data, configuration, and backups for Whale Bell.\n\nThis action cannot be undone.")) {
        if (confirm("FINAL WARNING:\n\nReally delete everything?")) {
            try {
                ui.displayMessage('Performing factory reset...', 'info', 'dataManagementResult', 0);
                // Stop API connection if active
                // Need to import apiHandler here or handle this differently
                // if (apiHandler && apiHandler.isApiConnected()) { apiHandler.disconnect(); }

                // Clear data
                userManager.clearAllUsers();
                configManager.resetConfig();
                localStorage.removeItem(BACKUP_KEY);

                ui.displayMessage('Factory reset complete. Reloading application...', 'success', 'dataManagementResult', 5000);
                console.log("Factory reset complete.");
                setTimeout(() => window.location.reload(), 1500);
            } catch (error) {
                console.error("Error during factory reset:", error);
                ui.displayMessage(`Factory reset failed: ${error.message}`, 'error', 'dataManagementResult');
                displayError("Factory reset failed", error);
            }
        } else { ui.displayMessage('Factory reset cancelled.', 'info'); }
    } else { ui.displayMessage('Factory reset cancelled.', 'info'); }
}

// --- Utility ---

function isFileSizeValid(file, maxSizeMB = MAX_FILE_SIZE_MB) {
    return file.size <= maxSizeMB * 1024 * 1024;
}