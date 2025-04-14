// dataManager.js - Handles data import/export, validation, backup, and reset

import * as userManager from './userManager.js';
import * as configManager from './config.js';
import * as ui from './ui.js';
import { displayError, parseTimestamp } from './utils.js';
import db from './db.js';
// PapaParse and CryptoJS are assumed to be loaded globally via CDN

const BACKUP_KEY = 'whaleBellBackup';
const MAX_FILE_SIZE_MB = 100; // Increased limit for potentially larger files
const CURRENT_APP_VERSION = "2.0-agg"; // Update version to reflect major change
// REMOVED: const PRIVATE_SHOW_GROUPING_THRESHOLD_SECONDS = 30; - Grouping logic removed
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
            
            // Show progress UI before starting processing
            ui.showImportProgress(results.data.length);
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

// Refactored processCsvData for Aggregate & Tiered Retention
async function processCsvData(data) {
    console.log("Processing CSV data rows:", data.length);
    ui.displayMessage('Processing CSV rows...', 'info', 'dataManagementResult', 0);

    let totalRows = data.length;
    let rowsProcessed = 0;
    let aggregatesUpdatedCount = 0;
    let recentEventsBatchedCount = 0;
    let recentEventsBatch = [];
    const BATCH_SIZE = 500; // How many recent events to add to DB at once

    const config = configManager.getConfig();
    const retentionDays = config.recentEventRetentionDays || 30;
    const cutoffTimestamp = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    console.log(`Retention period: ${retentionDays} days. Cutoff: ${new Date(cutoffTimestamp).toISOString()}`);

    // Use a Map to temporarily hold aggregate updates during processing if needed,
    // but userManager now holds the main state.
    // let userAggregates = new Map(); // Might not be needed if userManager handles it live

    // --- Pre-processing: Group data by user and sort by timestamp ---
    const userData = {};
    
    // Process data row by row (can still yield to UI)
    async function processRow(index) {
        if (index >= totalRows) {
            await finishCsvProcessing();
            return;
        }

        const row = data[index];
        const username = row.User?.trim();
        const amountStr = row["Token change"];
        const timestampStr = row.Timestamp;
        const transactionType = row["Transaction type"]?.trim() || '';
        const note = row.Note?.trim() || '';

        rowsProcessed++;

        if (username && amountStr && timestampStr) {
            const amount = parseFloat(amountStr);
            const timestamp = parseTimestamp(timestampStr); // Returns ISO string or null
            const eventTime = timestamp ? new Date(timestamp).getTime() : 0;

            if (timestamp && amount >= 0) { // Process 0 amount events too (like userEnter/Leave if present)
                const eventType = determineEventType(transactionType);

                // 1. Update Aggregates (via userManager.addEvent, which handles aggregates now)
                // We still call addEvent for *every* row to update first/last seen and aggregates.
                // addEvent itself will decide whether to store the detailed event.
                const eventData = {
                    amount: amount,
                    note: note,
                    timestamp: timestamp, // Pass the parsed ISO string
                    transactionType: transactionType // Pass original type if needed downstream
                };

                try {
                    // This updates aggregates in memory AND adds to recentEvents if applicable
                    // await userManager.addEvent(username, eventType, eventData);
                    // Correction: userManager.addEvent should ONLY add to recentEvents.
                    // We need separate logic here for aggregates vs recent.

                    // --- Aggregate Update ---
                    userManager.addUser(username); // Ensure user exists in memory
                    const user = userManager.getUser(username);
                    if (!user.firstSeenDate || timestamp < user.firstSeenDate) user.firstSeenDate = timestamp;
                    user.lastSeenDate = timestamp;
                    user.tokenStats.lastUpdated = timestamp;

                    // Log amount parsed from CSV
                    console.log(`processRow[${index}] (${username}): Parsed amount=${amount}, eventType=${eventType}`);

                    if (amount > 0) {
                        // Log stats BEFORE update
                        console.log(`processRow[${index}] (${username}): Stats BEFORE:`, JSON.parse(JSON.stringify(user.tokenStats)));
                        user.tokenStats.lifetimeTotalSpent = (user.tokenStats.lifetimeTotalSpent || 0) + amount;
                        if (eventType === 'tip') user.tokenStats.lifetimeTotalTips = (user.tokenStats.lifetimeTotalTips || 0) + amount;
                        else if (eventType === 'privateShow' || eventType === 'privateShowSpy') user.tokenStats.lifetimeTotalPrivates = (user.tokenStats.lifetimeTotalPrivates || 0) + amount;
                        else if (eventType === 'mediaPurchase') user.tokenStats.lifetimeTotalMedia = (user.tokenStats.lifetimeTotalMedia || 0) + amount;
                        // Log stats AFTER update
                        console.log(`processRow[${index}] (${username}): Stats AFTER:`, JSON.parse(JSON.stringify(user.tokenStats)));
                        aggregatesUpdatedCount++; // Count rows that potentially changed aggregates
                    } else {
                         console.log(`processRow[${index}] (${username}): Skipping aggregation update (amount <= 0)`);
                    }


                    // --- Recent Event Check & Batching ---
                    if (eventTime >= cutoffTimestamp) {
                        const recentEventRecord = {
                            username: username,
                            timestamp: timestamp,
                            type: eventType,
                            amount: amount,
                            note: note
                        };
                        recentEventsBatch.push(recentEventRecord);
                        recentEventsBatchedCount++;

                        if (recentEventsBatch.length >= BATCH_SIZE) {
                            await saveRecentEventsBatch();
                        }
                    }

                } catch (error) {
                    console.error(`Error processing row ${index} for user ${username}:`, error, row);
                    // Optionally skip row or halt import? For now, log and continue.
                }
            }
        }

        // Update UI periodically
        if (rowsProcessed % 100 === 0 || rowsProcessed === totalRows) {
            ui.updateImportProgress(rowsProcessed, totalRows, {
                // usersFound: userManager.getAllUsers().size, // Might be slow
                aggregatesUpdated: aggregatesUpdatedCount,
                recentEventsStored: recentEventsBatchedCount - recentEventsBatch.length // Stored = Batched - Remaining in current batch
            });
            // Yield to the event loop to keep UI responsive
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        // Process next row
        await processRow(index + 1);
    }

    // Helper to save the current batch of recent events
    async function saveRecentEventsBatch() {
        if (recentEventsBatch.length === 0) return;
        try {
            const batchToSave = [...recentEventsBatch]; // Copy batch
            recentEventsBatch = []; // Clear original batch immediately
            await db.recentEvents.bulkAdd(batchToSave);
            console.log(`Saved batch of ${batchToSave.length} recent events.`);
        } catch (error) {
            console.error("Error saving recent events batch:", error);
            // Handle error - potentially retry or log failed events
            ui.displayMessage('Error saving batch of recent events. Some data might be missing.', 'error', 'dataManagementResult');
        }
    }

    // Function called after all rows are processed
    async function finishCsvProcessing() {
        console.log("Finishing CSV processing...");
        ui.displayMessage('Saving final data...', 'info', 'dataManagementResult', 0);

        // Save any remaining recent events
        await saveRecentEventsBatch();

        // Save the final aggregate user data
        try {
            await userManager.saveUsers(); // Ensure final aggregates are saved
            console.log("Final user aggregates saved.");
        } catch (error) {
            console.error("Error saving final user aggregates:", error);
            ui.displayMessage('Error saving final user aggregates.', 'error', 'dataManagementResult');
        }

        ui.hideImportProgress();
        const finalUserCount = userManager.getAllUsers().size;
        let summary = `CSV Import Complete: Processed ${rowsProcessed} rows. Updated aggregates for ${finalUserCount} users. Stored ${recentEventsBatchedCount} recent events (within ${retentionDays} days).`;
        ui.displayMessage(summary, 'success', 'dataManagementResult', 15000);
        console.log(summary);
    }

    // Start processing from the first row
    ui.showImportProgress(totalRows);
    await processRow(0);
}
// REMOVED: processUsers, processUserEvents - Logic integrated into processRow
// REMOVED: processChunk - Using async row-by-row processing with yielding instead

// Helper to create a consistent signature for duplicate checking
// REMOVED: createEventSignature - Duplicate checking logic removed/simplified for this refactor.
// If needed later, it would have to work with the recentEvents store structure.

// Helper to determine event type from transaction type
function determineEventType(transactionType) {
    switch (transactionType) {
        case 'Tip received':
            return 'tip';
        case 'Private show':
            return 'privateShow';
        case 'Spy on private show':
            return 'privateShowSpy';
        case 'Photos/videos purchased':
            return 'mediaPurchase';
        default:
            return 'other';
    }
}

// --- JSON Export/Import ---
// ... (Export/Import/Reset/Backup/Validation/Utility functions remain the same) ...
// Refactored exportData for Aggregate & Tiered Retention
export async function exportData() {
    console.log("Exporting data (Aggregates + Recent Events)...");
    ui.displayMessage('Preparing data for export...', 'info', 'dataManagementResult', 0);
    try {
        // 1. Get Aggregate User Data
        const usersMap = userManager.getAllUsers(); // Map of aggregate user objects
        const usersArray = Array.from(usersMap.values());

        // 2. Get Recent Events Data
        ui.displayMessage('Fetching recent events from database...', 'info', 'dataManagementResult', 0);
        const recentEventsArray = await db.recentEvents.toArray();
        console.log(`Fetched ${recentEventsArray.length} recent events for export.`);

        // 3. Get Settings
        const settings = configManager.getConfig();

        // 4. Construct Export Object (New Format)
        const exportObj = {
            version: CURRENT_APP_VERSION, // Use updated version
            timestamp: new Date().toISOString(),
            users: usersArray, // Contains only aggregate data
            recentEvents: recentEventsArray, // Contains detailed recent events
            settings: settings
        };

        // 5. Stringify and Encrypt (if needed)
        ui.displayMessage('Formatting data...', 'info', 'dataManagementResult', 0);
        let jsonData = JSON.stringify(exportObj, null, 2); // Pretty print JSON
        const passwordEnabled = document.getElementById('enablePassword')?.checked;
        const password = document.getElementById('dataPassword')?.value;
        let fileNameSuffix = '';
        let mimeType = 'application/json';

        if (passwordEnabled && password) {
            ui.displayMessage('Encrypting data...', 'info', 'dataManagementResult', 0);
            jsonData = CryptoJS.AES.encrypt(jsonData, password).toString();
            fileNameSuffix = '-encrypted';
            mimeType = 'text/plain'; // Encrypted data is just text
            ui.displayMessage('Data encrypted. Starting download...', 'info', 'dataManagementResult');
        } else {
            ui.displayMessage('Starting download...', 'info', 'dataManagementResult');
        }

        // 6. Create Blob and Download Link
        const blob = new Blob([jsonData], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `whale-bell-backup-${new Date().toISOString().split('T')[0]}${fileNameSuffix}.json`; // Keep .json extension for clarity
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        ui.displayMessage('Export successful!', 'success', 'dataManagementResult');
        console.log("Export successful.");

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

// Refactored processImportedJson for Aggregate & Tiered Retention (REPLACE ONLY)
async function processImportedJson(jsonData) {
    ui.displayMessage('Processing imported JSON data...', 'info', 'dataManagementResult', 0);
    try {
        let parsedData;
        const passwordEnabled = document.getElementById('enablePassword')?.checked;
        const password = document.getElementById('dataPassword')?.value;

        // --- Decryption & Parsing ---
        // (Keep decryption logic as is)
        if (passwordEnabled && !password) { ui.displayMessage('Password needed for encrypted file.', 'error', 'dataManagementResult'); return; }
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


        // --- Validation (Adapt for new format) ---
        if (!validateImportData(parsedData)) { return; } // Validation shows error

        // --- Backup ---
        // Keep backup logic as is
        await createBackup(); // Make backup async

        // --- Replace Data (Merge is Disabled) ---
        const mergeCheckbox = document.getElementById('mergeData');
        if (mergeCheckbox && mergeCheckbox.checked) {
             ui.displayMessage('Merge functionality is currently disabled in this version. Importing will REPLACE existing data.', 'warning', 'dataManagementResult', 8000);
             // Optionally uncheck the box? Or just proceed with replace.
        }

        console.log("Replacing existing data with imported data (Aggregates + Recent Events)...");
        ui.displayMessage('Replacing existing data...', 'info', 'dataManagementResult', 0);

        // Clear existing data (aggregates and recent events)
        await userManager.clearAllUsers(); // This now clears both tables

        // Import Aggregate Users
        let importedUserCount = 0;
        if (parsedData.users && Array.isArray(parsedData.users)) {
            parsedData.users.forEach(user => {
                // Use the refactored importUser which handles the aggregate structure
                userManager.importUser(user);
                importedUserCount++;
            });
            console.log(`Imported ${importedUserCount} user aggregate records.`);
        } else {
            console.warn("No 'users' array found in import data or it wasn't an array.");
        }

        // Import Recent Events
        let importedEventCount = 0;
        if (parsedData.recentEvents && Array.isArray(parsedData.recentEvents)) {
             ui.displayMessage(`Importing ${parsedData.recentEvents.length} recent events...`, 'info', 'dataManagementResult', 0);
             try {
                 // Simple bulk put is fine here as we cleared the table
                 await db.recentEvents.bulkPut(parsedData.recentEvents);
                 importedEventCount = parsedData.recentEvents.length;
                 console.log(`Imported ${importedEventCount} recent events.`);
             } catch (eventImportError) {
                 console.error("Error importing recent events:", eventImportError);
                 ui.displayMessage('Error importing recent events. Aggregate data might be imported, but recent history is incomplete.', 'error', 'dataManagementResult');
                 // Continue with saving aggregates and settings? Or halt? Let's continue for now.
             }
        } else {
            console.warn("No 'recentEvents' array found in import data or it wasn't an array.");
        }

        // --- Apply Settings & Save ---
        ui.displayMessage('Applying settings and saving...', 'info', 'dataManagementResult', 0);
        configManager.updateConfig(parsedData.settings || {}); // Use empty settings if missing
        await configManager.saveConfig(); // Make async
        ui.populateSettings(); // Update UI with new settings
        await userManager.saveUsers(); // Save the imported aggregate users

        let importSummary = `Replaced data: Imported ${importedUserCount} users and ${importedEventCount} recent events.`;
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
// REMOVED: mergeUsers - Merge functionality is disabled for this refactor as per the plan.
// The complexity of merging aggregates AND recent event lists correctly is high.


// Updated validateImportData for the new export format
function validateImportData(data) {
    if (!data || typeof data !== 'object') {
        ui.displayMessage('Invalid import file format (not an object).', 'error', 'dataManagementResult'); return false;
    }

    // Check version (allow imports from older compatible versions if needed, but warn)
    // For now, strict check against the new version. Could be relaxed later.
    if (data.version && data.version !== CURRENT_APP_VERSION) {
        ui.displayMessage(`Warning: Import file version (${data.version}) differs from app version (${CURRENT_APP_VERSION}). Data structure might be incompatible. Proceed with caution.`, 'warning', 'dataManagementResult', 10000);
        console.warn(`Import file version (${data.version}) differs from app version (${CURRENT_APP_VERSION}).`);
        // Allow import for now, but maybe block in future if versions are known incompatible.
    } else if (!data.version) {
         ui.displayMessage(`Warning: Import file missing version information. Assuming compatible structure, but proceed with caution.`, 'warning', 'dataManagementResult', 10000);
         console.warn(`Import file missing version information.`);
    }

    // Check for essential components of the new format
    if (!Array.isArray(data.users)) {
         ui.displayMessage('Invalid import data: "users" array (for aggregates) is missing or not an array.', 'error', 'dataManagementResult'); return false;
    }
    // recentEvents is optional for import (might be an older backup or user chose not to export them)
    if (data.recentEvents && !Array.isArray(data.recentEvents)) {
         ui.displayMessage('Invalid import data: "recentEvents" field exists but is not an array.', 'error', 'dataManagementResult'); return false;
    }
     if (typeof data.settings !== 'object' || data.settings === null) {
        // Allow missing settings, default will be used.
        console.warn("Import data missing 'settings' object. Default settings will be applied.");
        // ui.displayMessage('Invalid import data: "settings" object is missing or not an object.', 'error', 'dataManagementResult'); return false;
    }
    return true; // Passed validation
}

// --- Backup & Reset ---

// Updated createBackup to include recentEvents (make async)
async function createBackup() {
    console.log("Creating backup of current data (Aggregates + Recent Events)...");
    try {
        const usersMap = userManager.getAllUsers();
        const usersArray = Array.from(usersMap.values());
        const recentEventsArray = await db.recentEvents.toArray(); // Fetch events
        const settings = configManager.getConfig();
        const backupData = {
            backupTimestamp: new Date().toISOString(),
            version: CURRENT_APP_VERSION, // Use current app version for backup
            users: usersArray,
            recentEvents: recentEventsArray, // Include recent events
            settings: settings
        };
        await saveBackup(backupData); // saveBackup is already async
        console.log("Backup created successfully (including recent events).");
        ui.displayMessage('Backup of current data created before import.', 'info', 'dataManagementResult', 5000);
    } catch (error) {
        console.error("Failed to create backup:", error);
        ui.displayMessage('Warning: Failed to create backup before import.', 'error', 'dataManagementResult');
        // Re-throw? Or just log? For now, just log and show UI message.
    }
}

export async function saveBackup(backupData) {
    try {
        await db.backups.put({ id: 'currentBackup', ...backupData });
        console.log('Backup saved successfully');
    } catch (error) {
        console.error('Error saving backup:', error);
        throw error;
    }
}

export async function clearBackup() {
    try {
        await db.backups.delete('currentBackup');
        console.log('Backup cleared successfully');
    } catch (error) {
        console.error('Error clearing backup:', error);
        throw error;
    }
}

export function factoryReset() {
    console.warn("Performing factory reset!");
    if (confirm("ARE YOU SURE?\n\nThis will permanently delete ALL stored user data, configuration, and backups for Whale Bell.\n\nThis action cannot be undone.")) {
        if (confirm("FINAL WARNING:\n\nReally delete everything?")) {
            try {
                ui.displayMessage('Performing factory reset...', 'info', 'dataManagementResult', 0);

                userManager.clearAllUsers();
                configManager.resetConfig();
                clearBackup(); // Use the IndexedDB clearBackup function instead of localStorage

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

// --- Data Pruning ---

export async function pruneOldEvents() {
    try {
        const config = configManager.getConfig();
        const retentionDays = config.recentEventRetentionDays || 30;
        if (retentionDays <= 0) {
            console.log("Event pruning skipped: retention period is zero or negative.");
            return;
        }
        const cutoffTimestamp = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
        const cutoffISO = new Date(cutoffTimestamp).toISOString();

        console.log(`Pruning events older than ${retentionDays} days (before ${cutoffISO})...`);
        const deleteCount = await db.recentEvents.where('timestamp').below(cutoffISO).delete();
        console.log(`Pruned ${deleteCount} old events.`);
        if (deleteCount > 0) {
             ui.addLogEntry(`Pruned ${deleteCount} old events (older than ${retentionDays} days).`, 'info');
        }
    } catch (error) {
        console.error("Error during event pruning:", error);
        ui.addLogEntry(`Error during event pruning: ${error.message}`, 'error');
        // Optional: Add UI error message via displayMessage if needed
    }
}


// --- Utility ---

function isFileSizeValid(file, maxSizeMB = MAX_FILE_SIZE_MB) {
    return file.size <= maxSizeMB * 1024 * 1024;
}