**Design Document: CB Whale Bell Performance Refactor (Aggregate & Tiered Retention)**

**Subject:** Refactoring CB Whale Bell for Large Dataset Performance

**1. Introduction**

The current application struggles significantly when importing large `token_history.csv` files. The browser becomes unresponsive, IndexedDB access becomes problematic, and the user experience degrades severely. This is primarily due to attempting to store and process *all* historical transaction data, particularly embedding large event histories within each user object.

This document outlines a refactoring plan based on the **Aggregate & Tiered Retention** strategy. We will prioritize performance and the core function (whale detection) by:

*   Aggregating lifetime spending metrics for all users.
*   Storing *detailed* event information only for a recent period (e.g., 30 days).
*   Actively pruning (deleting) detailed event data older than this retention period.

**2. Guiding Principles**

*   **Performance First:** Optimize for responsiveness during import and runtime checks.
*   **Relevance is Key:** Focus on data essential for whale detection (lifetime totals, recent activity).
*   **Minimize Storage:** Avoid storing unnecessary historical detail indefinitely.
*   **Asynchronous Processing:** Ensure long operations (like import) don't block the main UI thread.

**3. High-Level Implementation Steps**

I recommend tackling this in the following logical stages. **Please create separate Git branches for each major step and test thoroughly before merging.**

1.  **Update Database Schema:** Define the new `users` and `recentEvents` stores in IndexedDB.
2.  **Refactor User Data Structure:** Modify the in-memory user representation in `userManager.js` to store aggregates, removing the embedded `eventHistory`.
3.  **Update Data Import Logic:** Change `dataManager.js` to populate the new aggregate structure and only add *recent* events to a batch for the `recentEvents` store.
4.  **Update Real-time Event Handling:** Modify `apiHandler.js` and `userManager.js` (`addEvent`) to work with the new structure.
5.  **Refactor Whale Check Logic:** Update `userManager.js` (`isWhale`, `getSpentInPeriod`) to query aggregates and the `recentEvents` store.
6.  **Implement Data Pruning:** Create a new mechanism to periodically delete old events from `recentEvents`.
7.  **Update Configuration:** Add a setting for the event retention period.
8.  **Testing:** Thoroughly test with both small and large CSV files, verify whale detection accuracy, and monitor IndexedDB usage.

**4. Detailed Changes by Component**

**(Please ensure you understand the existing code before making changes. Ask questions if anything is unclear.)**

**4.1. Database Schema (`db.js`)**

*   **Modify `db.version().stores()`:**
    *   Keep the `config` and `backups` stores as they are.
    *   **Replace** the existing `users` store definition.
    *   **Add** a new `recentEvents` store.

    ```javascript
    // Example in db.js
    db.version(2).stores({ // Increment version number!
        config: '&id', // Keep as is
        users: '&username, lastSeenTimestamp', // Store aggregates. Index username (primary key) and lastSeen (for potential future use/analysis).
        recentEvents: '++id, &timestamp, username, [username+timestamp]', // Auto-incrementing ID, index timestamp (for pruning), index username (for lookups), compound index (for user-specific recent lookups).
        backups: '&id' // Keep as is
    }).upgrade(tx => {
        // Migration logic might be needed if you want to attempt to preserve
        // existing *aggregated* data from the old 'users' store.
        // For simplicity in this refactor, we might initially accept that
        // users need to re-import after this schema change. Discuss if migration is critical.
        console.log("Upgrading DB schema to version 2 for Aggregate/Tiered Retention.");
        // Example: If migrating, you'd read old users, calculate aggregates, put into new 'users'.
        // Clear out the old 'events' store if it existed implicitly via user.eventHistory.
    });
    ```

**4.2. User Data Structure & Management (`userManager.js`)**

*   **User Object Structure:**
    *   **Remove:** `eventHistory` array from the user object.
    *   **Ensure:** The `tokenStats` object exists and contains the lifetime aggregate fields (e.g., `lifetimeTotalSpent`, `lifetimeTotalTips`, `lifetimeTotalPrivates`, `lifetimeTotalMedia`, `lastUpdated`). Initialize these to 0.
    *   Keep `username`, `firstSeenDate`, `lastSeenDate`, `isOnline`.

*   **`addUser(username)`:**
    *   Should create the *new* simplified user structure with initialized aggregates (0) and metadata. No `eventHistory`.

*   **`loadUsers()`:**
    *   Should now fetch data only from the `users` IndexedDB store. These are the aggregate records.

*   **`saveUsers()` / `saveUsersDebounced()`:**
    *   Should now save the in-memory `users` map (containing *only* aggregate data) to the `users` IndexedDB store using `db.users.bulkPut()`.

*   **`addEvent(username, type, data)`:** **(CRITICAL CHANGE)**
    *   Get the user object (aggregate data) from the in-memory map using `getUser(username)`. Create if doesn't exist using `addUser`.
    *   Update the user's **aggregate** fields (`lifetimeTotalSpent`, `lifetimeTotalTips`, etc.) based on `data.amount`.
    *   Update `lastSeenDate`, `isOnline` as needed.
    *   **DO NOT** add the event to an embedded `eventHistory`.
    *   **Add the detailed event** directly to the `recentEvents` store:

        ```javascript
        // Inside addEvent, after updating aggregates:
        const eventRecord = {
            username: username,
            timestamp: parseTimestamp(data.timestamp) || new Date().toISOString(),
            type: type,
            amount: data.amount || 0, // Ensure amount is stored
            note: data.note || ''     // Store relevant notes if available
            // Add other relevant details from 'data' if needed
        };
        try {
            await db.recentEvents.add(eventRecord);
            // Trigger debounced save for the aggregate user data
            saveUsersDebounced();
        } catch (error) {
            console.error("Failed to add event to recentEvents store:", error);
            // Handle error appropriately
        }
        ```

*   **`isWhale(username, thresholds)`:** **(CRITICAL CHANGE)**
    *   Get the user's aggregate data (`user = getUser(username)`).
    *   Check lifetime thresholds directly against `user.tokenStats.lifetimeTotalSpent`, `user.tokenStats.lifetimeTotalTips`, etc.
    *   For **recent** checks (e.g., recent tips, recent privates, large single tip):
        *   Calculate the start timestamp for the required period (e.g., `Date.now() - thresholds.recentTipTimeframe * 1000`).
        *   **Query the `recentEvents` store:**

            ```javascript
            // Pseudo-code / Example Dexie query inside isWhale for recent check:
            const recentStartTimeISO = new Date(Date.now() - thresholds.recentTipTimeframe * 1000).toISOString();
            const recentUserEvents = await db.recentEvents
                .where('[username+timestamp]') // Use compound index
                .between([username, recentStartTimeISO], [username, new Date().toISOString()]) // Filter by user and time range
                .toArray();

            // Now process 'recentUserEvents' array:
            let recentTipSum = 0;
            let foundLargeTip = false;
            for (const event of recentUserEvents) {
                if (event.type === 'tip') {
                    recentTipSum += event.amount;
                    if (event.amount >= thresholds.recentLargeTipThreshold) {
                        foundLargeTip = true;
                    }
                }
                // Add similar logic for recent privates if needed
            }

            // Check thresholds against calculated recentTipSum, foundLargeTip etc.
            if (recentTipSum >= thresholds.recentTipThreshold) return true;
            if (foundLargeTip) return true;
            // ... other recent checks
            ```

*   **`getSpentInPeriod(username, days, category = 'total')`:**
    *   Refactor this to query the `recentEvents` store similar to the `isWhale` recent check logic, summing amounts for the specified category within the `days` range.

*   **`recalculateTotals(user, shouldSave)` / `recalculateAllUserStats()`:**
    *   This function becomes problematic as we no longer store the *full* history.
    *   **Recommendation:** Remove these functions for now. Aggregation happens live during import and event processing. If a recalculation *from recent events only* is ever needed, it can be added later, but the primary aggregation should be correct by design.

**4.3. Data Import (`dataManager.js`)**

*   **`processCsvData` / `processChunk`:**
    *   Keep the chunk processing approach using `PapaParse`.
    *   **Inside the loop processing each `row`:**
        1.  Get/create the user's aggregate record **in memory** (e.g., in a temporary map or directly in `userManager.users` if careful).
        2.  Update the user's **lifetime aggregates** based on the row's `amount` and `type`.
        3.  Update `firstSeen`/`lastSeen` in the aggregate record.
        4.  **Check row timestamp:** Get `configManager.getConfig().recentEventRetentionDays`. Calculate the cutoff date.
        5.  If `row.Timestamp` is **within** the retention period:
            *   Create a detailed event object (like `eventRecord` in `userManager.addEvent`).
            *   Add this object to a **temporary batch array** (`recentEventsBatch`).
        6.  If the timestamp is older, **do nothing** with the details (it's counted in aggregates).
    *   **After processing a chunk (or the whole file):**
        1.  Use `userManager.saveUsers()` or `db.users.bulkPut()` to save the updated **aggregate user data**.
        2.  Use `db.recentEvents.bulkAdd(recentEventsBatch)` to add the batch of recent events. Clear the batch array.
    *   **Progress Reporting (`ui.updateImportProgress`):** Update to reflect stages like "Aggregating row X/Y" and "Saving batch Z".

*   **`exportData()`:**
    *   Should export data from the `users` store (aggregates) and potentially the `recentEvents` store (current recent events). Define the export format clearly. It will be different from the old format.

*   **`handleDataImport()` / `processImportedJson()`:**
    *   Needs to handle the **new** import format.
    *   **Merge Logic (`mergeUsers`):** This becomes significantly more complex. Merging aggregates is easy, but merging recent event lists requires careful duplicate checking based on timestamp/type/amount.
    *   **Recommendation:** For the initial refactor, simplify import to **replace** existing data. If merge is essential, it can be tackled as a separate task later. Clearly communicate this limitation. Update the UI checkbox/text accordingly.

**4.4. Real-time Event Handling (`apiHandler.js`)**

*   **`processEvent(event)`:**
    *   Ensure it calls the refactored `userManager.addEvent(username, type, object)`.
    *   The core logic here remains similar (switch statement), but the downstream effect in `userManager.addEvent` is now different (updates aggregates, adds to `recentEvents`).

**4.5. Configuration (`config.js`)**

*   **`defaultConfig`:** Add `recentEventRetentionDays: 30`.
*   **`loadConfig()`:** Load this new setting.
*   **`saveConfig()`:** Read the value from a new input field in the UI and save it.
*   **UI (`ui.js`, `index.html`):** Add an input field in the settings panel for "Recent Event Retention (Days)". Update `ui.populateSettings` to display/set this value.

**4.6. New Functionality: Data Pruning**

*   Create a new function, e.g., `pruneOldEvents()`.
*   **Logic:**
    1.  Get `retentionDays` from config.
    2.  Calculate `cutoffTimestamp = Date.now() - retentionDays * 24 * 60 * 60 * 1000;`
    3.  Convert to ISO string: `cutoffISO = new Date(cutoffTimestamp).toISOString();`
    4.  Perform the deletion:
        ```javascript
        async function pruneOldEvents() {
            try {
                const config = configManager.getConfig();
                const retentionDays = config.recentEventRetentionDays || 30;
                const cutoffTimestamp = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
                const cutoffISO = new Date(cutoffTimestamp).toISOString();

                console.log(`Pruning events older than ${retentionDays} days (before ${cutoffISO})...`);
                const deleteCount = await db.recentEvents.where('timestamp').below(cutoffISO).delete();
                console.log(`Pruned ${deleteCount} old events.`);
                // Optional: Add UI log entry via ui.addLogEntry
            } catch (error) {
                console.error("Error during event pruning:", error);
                // Optional: Add UI error message
            }
        }
        ```
*   **Triggering:**
    *   Call `pruneOldEvents()` once on application startup (`main.js: initApp`).
    *   Consider calling it periodically (e.g., every few hours or on reconnect) using `setInterval` or `requestIdleCallback` for ongoing maintenance. Start simple with just calling it on load.

**5. Implementation Guidance & Testing**

*   **Work Incrementally:** Tackle one major step from section 3 at a time.
*   **Use Git:** Create branches (`feature/db-schema`, `feature/import-refactor`, etc.). Commit frequently.
*   **Test Each Step:**
    *   After schema change: Verify stores exist in DevTools > Application > IndexedDB.
    *   After import refactor: Import a small CSV. Verify aggregates in `users` store and recent events in `recentEvents` store. Import a large CSV – monitor performance and check data sanity. Check for UI blocking.
    *   After whale check refactor: Test `isWhale` with users who meet lifetime criteria and users who *only* meet recent criteria. Verify accuracy.
    *   After pruning: Check that old events are actually deleted from `recentEvents`.
*   **Browser Dev Tools are Crucial:** Constantly inspect IndexedDB contents, check the console for errors, and use the Performance tab if needed to identify bottlenecks.
*   **Ask Questions:** Don't hesitate to ask for clarification if any part of this plan is unclear.

**6. Expected Outcome**

Upon successful completion, the application should:

*   Import large `token_history.csv` files without significant browser unresponsiveness.
*   Maintain a responsive UI during normal operation.
*   Use significantly less IndexedDB storage space.
*   Accurately detect whales based on both lifetime aggregates and recent activity.
*   Successfully prune old, detailed event data.

---

Please review this plan carefully. Let's discuss any questions before you begin implementation. Good luck!