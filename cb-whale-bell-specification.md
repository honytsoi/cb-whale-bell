## Chaturbate Whale Bell - Detailed Specification v2.0 (Aggregate & Tiered Retention)

**1. Overview**

Chaturbate Whale Bell is a client-side, static web application designed to alert Chaturbate broadcasters when a potentially high-spending user ("Whale") enters their room. The app leverages historical spending data imported from a Chaturbate `token history.csv` file, processes real-time data from the Chaturbate Events API, and uses broadcaster-defined thresholds to identify these whales. Upon detection of a whale entering the room, the application triggers an audible bell sound. **To handle large datasets efficiently, the application stores lifetime aggregate spending data for all users and detailed event history only for a recent, configurable period (e.g., 30 days). All application state and user data are stored locally in the browser's `IndexedDB` database.**

**2. Target Audience**

Chaturbate Broadcasters seeking an audible, real-time notification for the arrival of significant past or potential spenders in their chat room.

**3. Core Technologies & Libraries**

*   **HTML5:** Structure of the application.
*   **CSS3:** Styling the application. (Consider using a simple framework or the existing `main.css` structure).
*   **JavaScript (ES6+ Modules):** Application logic.
*   **`Dexie.js`:** Wrapper library for simplified `IndexedDB` access.
    *   CDN: `https://unpkg.com/dexie@3.2.4/dist/dexie.min.js` (or latest v3)
*   **`jsQR`:** For scanning the Chaturbate Events API QR code.
    *   CDN: `https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js`
*   **`PapaParse`:** For robust CSV parsing of token history.
    *   CDN: `https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.0/papaparse.min.js`
*   **`CryptoJS`:** For optional password-based encryption/decryption of exported/imported data.
    *   CDN: `https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js`

**4. Functional Requirements**

**4.1. Data Import (Token History CSV)**

*   **Mechanism:** Provide a file input button (`<input type="file" accept=".csv">`) triggered by a user click on an "Import Token History" button.
*   **Parsing:**
    *   Use `PapaParse` library (`Papa.parse(csvData, { header: true })`) to parse the uploaded CSV file content. Provide a simple fallback parser (splitting lines and commas) if PapaParse fails to load, similar to `simpleCSVParse` in the source code.
    *   **Required Columns:** Validate that the CSV header contains at least: `"User"`, `"Token change"`, `"Timestamp"`, `"Note"`. Reject files missing these columns.
    *   **Data Extraction:** For each valid row, extract:
        *   `username`: From the "User" column (trim whitespace).
        *   `amount`: Parse the "Token change" column as a float. Ignore rows with non-positive amounts.
        *   `timestamp`: Parse the "Timestamp" column into an ISO 8601 string (`new Date(row.Timestamp).toISOString()`).
        *   `note`: From the "Note" column (trim whitespace, can be null/empty).
*   **Processing Logic (Refactored in `dataManager.js::processCsvData`):**
    *   Iterate through each valid row of the CSV data.
    *   For each row:
        *   Ensure the user's **aggregate record** exists in memory (using `userManager.addUser`).
        *   Update the user's **lifetime aggregate stats** (`lifetimeTotalSpent`, `lifetimeTotalTips`, etc.) based on the row's `amount` and derived `eventType`.
        *   Update the user's `firstSeenDate` and `lastSeenDate` in the aggregate record.
        *   Check the row's `timestamp` against the configured `recentEventRetentionDays` cutoff.
        *   If the event timestamp is **within** the retention period:
            *   Create a detailed event object (containing `username`, `timestamp`, `type`, `amount`, `note`).
            *   Add this detailed event object to a temporary batch array.
        *   If the timestamp is older, **do not** store the detailed event (it's already counted in the aggregates).
    *   Periodically (e.g., after processing a chunk or when the batch is full) or at the end of the import:
        *   Save the updated **aggregate user data** to the `users` IndexedDB table (using `userManager.saveUsers` or `db.users.bulkPut`).
        *   Save the batch of **recent detailed events** to the `recentEvents` IndexedDB table (using `db.recentEvents.bulkAdd`).
    *   **Removed Logic:** Duplicate event checking based on history and private/spy show grouping logic have been removed for performance.
*   **User Feedback:** Display clear success messages (e.g., "Imported X tokens across Y users.") or specific error messages (e.g., "Missing required columns", "Invalid file format", "Import failed: [error details]") using a dedicated UI element (similar to `#dataManagementResult`). Use the `displayError.js` pattern.

**4.2. Event Feed Connection (Chaturbate Events API)**

*   **Connection Method 1: QR Code Scanning (Derived from `qr-scanner.js`)**
    *   Use a `<video>` element (`#qrScanner`) and a hidden `<canvas>` (`#qrCanvas`).
    *   On "Scan QR Code" button (`#startScan`) click:
        *   Request camera access: `navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })`. Handle permissions errors.
        *   Stream video to the `<video>` element.
        *   Start a `requestAnimationFrame` loop (`scanForQRCode` function).
        *   Inside the loop: Draw the current video frame to the canvas (`context.drawImage`). Get image data (`context.getImageData`). Pass data to `jsQR(imageData.data, imageData.width, imageData.height)`.
        *   If `jsQR` returns a valid code (`code.data`):
            *   **Validation:** Check if the URL matches the pattern `https://eventsapi.chaturbate.com/events/`. Reject invalid codes.
            *   **Success:** Stop the camera stream and scanning loop. Extract the URL. Extract the `username` from the URL path (e.g., `url.split('/')[4]`). Store the URL and username in the application's configuration (see 4.5). Trigger the connection process (`connectToEventAPI`). Update UI to show connected status and the scanned URL (`#apiEndpoint`).
        *   If no code or invalid code, continue the loop.
    *   Provide a "Cancel Scan" button functionality while scanning.
*   **Connection Method 2: Manual URL Input**
    *   Provide a text input field (`#scannedUrl` or similar) where the user can paste the Events API URL.
    *   Provide a "Connect" button that triggers the connection process using the URL from the input field. Store the URL and extracted username in the config.
*   **Connection Logic (Derived from `app.js::getEvents`)**
    *   Use the `fetch` API to make GET requests to the API URL.
    *   The API returns JSON with an `events` array and a `nextUrl`.
    *   **Polling Loop:**
        1.  `fetch(currentUrl)`
        2.  On success (response.ok): Parse JSON response. Process each event in `response.events` (see 4.4). Set `currentUrl = response.nextUrl`. If `nextUrl` is missing, wait briefly (e.g., 3 seconds) and retry with the *same* `currentUrl`. Go to step 1.
        3.  On network error or non-ok status: Log the error. Update UI status to "Connection Error". Wait (e.g., 5 seconds) and retry step 1 with the *same* `currentUrl`.
*   **Disconnection:** Provide a "Disconnect" button that stops the polling loop and updates the UI status.

**4.3. User Data Management (Adaptation of `UserManager`)**

*   **Core Class:** Implement a `UserManager` class (or similar module structure) responsible for managing all user data.
*   **Storage (IndexedDB via Dexie.js):**
    *   Use `IndexedDB` for robust storage, managed via the `Dexie.js` library (`db.js`).
    *   **Database Name:** `WhaleBellDB`
    *   **Tables (Object Stores):**
        *   `config`: Stores the main application configuration object (key: `'main'`). Schema: `&id` (primary key).
        *   `users`: Stores **aggregate user data**. Schema: `&username, lastSeenTimestamp` (primary key `username`, index `lastSeenTimestamp`).
        *   `recentEvents`: Stores **detailed event information** only for the recent retention period. Schema: `++id, timestamp, username, [username+timestamp]` (auto-incrementing primary key `id`, indexes for pruning and lookups).
        *   `backups`: Stores a single backup object (key: `'currentBackup'`). Schema: `&id`.
*   **Aggregate User Object Structure (Stored in `users` table):**
    ```javascript
    {
        username: "string", // Primary key
        firstSeenDate: "string | null", // ISO 8601 timestamp
        lastSeenDate: "string | null", // ISO 8601 timestamp
        isOnline: false, // Transient state, reset on load
        // No eventHistory stored here
        tokenStats: { // Lifetime aggregate stats
            username: "string", // Reference
            lifetimeTotalSpent: 0,
            lifetimeTotalTips: 0,
            lifetimeTotalPrivates: 0,
            lifetimeTotalMedia: 0,
            lastUpdated: "string | null" // ISO 8601 of last event processed
        }
        // No maxHistory
    }
    ```
*   **Recent Event Object Structure (Stored in `recentEvents` table):**
    ```javascript
    {
        id: "number", // Auto-incrementing primary key
        username: "string", // Foreign key to users table
        timestamp: "string", // ISO 8601 timestamp (Indexed)
        type: "string", // e.g., 'tip', 'userEnter', 'privateShow', 'mediaPurchase' (Indexed)
        amount: "number", // Tokens for this specific event
        note: "string | null" // Note associated with the event
        // Other relevant details from original event if needed for queries
    }
    ```
*   **Core Methods:**
    *   `addUser(username)`: Adds a new **aggregate user record** to the in-memory map if it doesn't exist, initializing with the default aggregate structure.
    *   `getUser(username)`: Retrieves an aggregate user object from the in-memory map.
    *   `addEvent(username, type, data)` **(async)**:
        *   Ensures aggregate user record exists in memory (calls `addUser`).
        *   Updates the in-memory user's **aggregate stats** (`lifetimeTotalSpent`, etc.) based on `data.amount` and `type`.
        *   Updates `user.firstSeenDate` and `user.lastSeenDate`.
        *   Creates a detailed event record (`username`, `timestamp`, `type`, `amount`, `note`).
        *   Adds the detailed event record **directly to the `recentEvents` IndexedDB table**.
        *   Triggers `debouncedSave` for the aggregate user data.
    *   `updateTokenStats(user, event)`: **Removed.** Aggregate updates happen directly in `addEvent`.
    *   `recalculateTotals(user)`: **Removed.** Aggregation is live; recalculation from full history is not possible.
    *   `getTotalSpent(username)`: Returns `user.tokenStats.lifetimeTotalSpent` from the in-memory aggregate record. (Similarly for tips, privates, media).
    *   `getSpentInPeriod(username, days, category)` **(async)**: Queries the `recentEvents` IndexedDB table for events matching the `username`, `category` (type), and `days` timeframe. Sums the `amount` for matching events. Returns the total.
    *   `saveUsers()` **(async)**: Saves the current state of the in-memory `users` Map (aggregate data) to the `users` IndexedDB table using `db.users.bulkPut()`.
    *   `loadUsers()` **(async)**: Loads aggregate user data from the `users` IndexedDB table into the in-memory map on application start. Resets `isOnline` to `false`.
    *   `debouncedSave()`: Uses `setTimeout` and `clearTimeout` to batch `saveUsers` calls.
    *   `handleStorageError(error)`: **Removed.** Pruning is now handled by `dataManager.pruneOldEvents` which deletes old records from the `recentEvents` table based on timestamp, not by deleting users. IndexedDB handles quota errors differently than localStorage.
    *   **Whale Check Method:** `isWhale(username, thresholds)` **(async)**:
        *   Takes a username and the current threshold settings.
        *   Retrieves the user's **aggregate data** from the in-memory map (`getUser`).
        *   Checks lifetime thresholds against the aggregate stats (`lifetimeTotalSpent`, etc.).
        *   If lifetime thresholds are not met, **queries the `recentEvents` IndexedDB table** for events within the configured `recentTipTimeframe` and `recentPrivateTimeframe`.
        *   Calculates recent metrics (sum of recent tips, sum of recent privates, check for large single tip) from the queried recent events.
        *   Compares recent metrics against thresholds.
        *   Returns `true` if *any* lifetime or recent threshold is met, `false` otherwise.

**4.4. Real-time Event Processing (Adaptation of `app.js::processEvent`)**

*   For each event received from the `getEvents` polling loop:
    *   Extract `method` and `object`.
    *   **`userEnter`**:
        *   Get `username` from `object.user.username`. Ignore 'Anonymous'.
        *   `await userManager.addEvent(username, 'userEnter', { timestamp: event.timestamp })`. (Handles aggregate update and potential recent event storage).
        *   `userManager.markUserOnline(username)` (Updates in-memory aggregate, save is debounced via `addEvent`).
        *   **WHALE CHECK:** `if (await userManager.isWhale(username, currentThresholds))` (Await the async check).
        *   If `true`, trigger the bell sound notification (see 4.6) and potentially a subtle visual indicator.
    *   **`userLeave`**:
        *   Get `username`. Ignore 'Anonymous'.
        *   `await userManager.addEvent(username, 'userLeave', { timestamp: event.timestamp })`.
        *   `userManager.markUserOffline(username)` (Updates in-memory aggregate, save is debounced via `addEvent`).
    *   **`tip`**:
        *   Get `username`, `tokens`, `message`, `isAnon` from `object.tip` and `object.user`. Ignore 'Anonymous' if `isAnon` is false.
        *   `await userManager.addEvent(username, 'tip', { amount: tokens, note: message, timestamp: event.timestamp })`.
    *   **`privateMessage`**: (Optional: Track if private messages contribute to spending/whale score)
        *   Get `fromUser`, `messageText`. Ignore 'Anonymous'.
        *   `await userManager.addEvent(fromUser, 'privateMessage', { content: messageText, isPrivate: true, timestamp: event.timestamp })`. (Note: `privateMessage` events don't inherently contain token amounts unless custom logic is added).
    *   **`mediaPurchase`**: (Optional: Track if media purchases contribute to spending)
        *   Get `username`, `mediaType`, `mediaName`, *`price`* (if available in the event payload - **verify this**) from `object.user` and `object.media`. Ignore 'Anonymous'.
        *   `await userManager.addEvent(username, 'mediaPurchase', { item: mediaName, amount: price, timestamp: event.timestamp })`.
    *   **Other Events:** Log other events (`broadcastStart`, `broadcastStop`, `follow`, `fanclubJoin`, etc.) to an activity feed/console for debugging, but they don't typically trigger core Whale Bell logic unless configured to do so.

**4.5. Configuration Management (Adaptation of `config.js`)**

*   **Storage (IndexedDB via Dexie.js):**
    *   Use the `config` table in the `WhaleBellDB` IndexedDB database.
    *   **Key:** The single configuration object is stored with `id: 'main'`.
    *   **Format:** Stored as a JavaScript object.
*   **Settings Object Structure (`localStorage`):**
    ```javascript
    {
        scannedUrl: "string | null", // Last successfully connected Events API URL
        broadcasterName: "string | null", // Extracted from scannedUrl
        // Whale Thresholds:
        lifetimeSpendingThreshold: 10000, // Example: 100 USD (adjust default)
        recentTipThreshold: 1000,        // Example: 10 USD
        recentTipTimeframe: 3600,       // Example: 1 hour (in seconds)
        recentLargeTipThreshold: 5000,   // Example: 50 USD for a single recent tip
        recentPrivateThreshold: 2000,    // Example: 20 USD
        recentPrivateTimeframe: 86400,  // Example: 1 day (in seconds)
        totalPrivatesThreshold: 10000,   // Example: 100 USD lifetime privates
        totalLifetimeTipsThreshold: 5000, // Example: 50 USD lifetime tips
        // App Settings:
        bellSound: "default_bell.mp3", // Filename/ID of selected sound
        recentEventRetentionDays: 30, // Default retention period in days
        // Removed: aiModel, promptLanguage, promptDelay, preferences, sessionKey, voice settings
    }
    ```
*   **UI:**
    *   Provide a dedicated "Settings" section (toggleable, similar to `#configSection`).
    *   Include input fields (`type="number"`) for all threshold values, timeframes, and `recentEventRetentionDays`.
    *   Include a button (`<button>`) to test the bell sound (dropdown removed).
    *   Display `#scannedUrl` and `#broadcasterName` (read-only after connection).
    *   Include "Save Configuration" (`#saveConfig`) and "Factory Reset" (`#factoryReset`) buttons.
    *   Include Data Management buttons/options (Export, Import, Password Protection, Merge) as detailed below.
*   **Functionality:**
    *   `loadConfig()` **(async)**: Load settings from the `config` table in IndexedDB on startup. Populate UI fields.
    *   `saveConfig()` **(async)**: Read values from UI input fields. Update the settings object. Save to the `config` table in IndexedDB.
    *   `initConfig()`: Called on startup to load config and set up listeners.
    *   `factoryReset()`: Implement factory reset to clear the `config`, `users`, `recentEvents`, and `backups` tables in IndexedDB after confirmation.
    *   **Suggest Thresholds (async):** Implement a button that analyzes the aggregate `tokenStats` and queries `recentEvents` (using `await userManager.getSpentInPeriod`) across users to calculate and suggest threshold values, populating the input fields.

**4.6. Whale Notification**

*   **Trigger:** When `userManager.isWhale(username)` returns `true` during a `userEnter` event processing.
*   **Sound:**
    *   Use the JavaScript `Audio` object: `const sound = new Audio('sounds/' + config.bellSound); sound.play();`.
    *   Store sound files (e.g., `.mp3`, `.wav`) locally within the app structure (e.g., a `/sounds` directory).
    *   Allow selection via the settings panel.
*   **Visual (Optional):** Display a brief, non-intrusive notification on the screen (e.g., a small temporary banner or highlighting the entry in an activity log) indicating "[Username] is here! 🐳".

**4.7. Data Export/Import/Backup (Derived from `config.js` and `user-manager.js`)**

*   **Export:**
    *   Provide an "Export Data" button.
    *   Gather current config (`whaleBellConfig`) and all user data (`userManager.getAllUsers()`).
    *   Format into a JSON object:
        ```json
        {
          "version": "2.0-agg", // Updated version reflecting the refactor
          "timestamp": "ISO 8601 date",
          "users": [ /* Array of AGGREGATE user objects */ ],
          "recentEvents": [ /* Array of RECENT DETAILED event objects */ ],
          "settings": { /* Settings object as defined in 4.5 */ }
        }
        ```
    *   **Password Protection (Optional):** If enabled via a checkbox (`#enablePassword`) and password input (`#dataPassword`):
        *   Encrypt the JSON string using `CryptoJS.AES.encrypt(jsonData, password).toString()`.
    *   Create a `Blob` (`new Blob([jsonData], { type: 'application/json' })`) and trigger a download (`.json` file) using a temporary `<a>` link.
    *   Display success/error messages.
*   **Import:**
    *   Provide an "Import Data" button triggering a file input (`<input type="file" accept=".json">`).
    *   **Password Protection (Optional):** If enabled, prompt for the password. Decrypt using `CryptoJS.AES.decrypt(encryptedData, password).toString(CryptoJS.enc.Utf8)`. Handle decryption errors (likely wrong password).
    *   **Validation:** Use `data-manager.js::isFileSizeValid` (e.g., 10MB limit). Parse the JSON. Use `data-manager.js::validateImportData` (adapting required fields/version for Whale Bell structure).
    *   **Backup (async):** Before importing, create a backup of the *current* aggregate users, recent events, and config data using `dataManager.createBackup` and save it to the `backups` table in IndexedDB.
    *   **Merge Option:** The "Merge with existing data" checkbox (`#mergeData`) is **disabled**. Import always **replaces** existing data.
    *   **Execution (async):** Clear existing data (`userManager.clearAllUsers`, which clears `users` and `recentEvents` tables). Iterate through `data.users` (aggregates) and add them using `userManager.importUser`. Iterate through `data.recentEvents` and add them using `db.recentEvents.bulkPut`. Update the application config with `data.settings`. Save changes (`userManager.saveUsers`, `configManager.saveConfig`).
    *   Display success/error messages. Reload the page on success to reflect changes cleanly.
*   **Factory Reset:** Button (`#factoryReset`) that clears all relevant IndexedDB tables (`config`, `users`, `recentEvents`, `backups`) after confirmation.

**5. Non-Functional Requirements**

*   **Performance:** Prioritize efficient calculation of whale metrics, especially `getSpentInPeriod`. Avoid unnecessary loops or recalculations. Debounce saves.
*   **Storage:** Use `IndexedDB` which offers larger storage limits than `localStorage`. Implement pruning of old events from the `recentEvents` table (`dataManager.pruneOldEvents`) based on the configured retention period to manage storage space.
*   **Usability:** Simple, clear interface. Minimal clicks required for core operations. Clear status indication. Sensible defaults for thresholds and retention period.
*   **Reliability:** Graceful error handling for API connections, file operations, and data parsing. Automatic reconnection attempts for the event feed.
*   **Security:** Data is local, but offer optional password encryption for export/import using `CryptoJS`.

**6. User Interface (UI) Sketch**

*   **Header:** "Chaturbate Whale Bell", Connection Status Indicator (Green dot/text "Connected", Red dot/text "Disconnected/Error"), Settings Button (Gear Icon).
*   **Main Area:**
    *   Maybe a simple log/feed showing recent `userEnter` events, highlighting whales (e.g., "[Timestamp] User 'WhaleUser' entered! 🐳"). Limited history.
    *   Current Whale Thresholds display area (read-only view of key settings).
*   **Settings Panel (Initially Hidden):**
    *   **Connection:** QR Scanner (`#qrScanner`, `#startScan`), URL Input (`#scannedUrl`), Connect/Disconnect Button.
    *   **Whale Thresholds:** Number inputs for each threshold (`#lifetimeSpendingThreshold`, `#recentTipThreshold`, etc.) and timeframes (`#recentTipTimeframe`, etc.). "Suggest Thresholds" button.
    *   **Sound:** "Test Sound" button (sound selection removed).
    *   **Data Management:** "Import Token History (.csv)" button, "Export Data (.json)" button, "Import Data (.json)" button. Checkboxes/inputs for password (`#enablePassword`, `#dataPassword`). **Merge checkbox (`#mergeData`) is present but disabled.** Input for "Recent Event Retention (Days)" (`#recentEventRetentionDays`). "Factory Reset" button.
    *   **Save:** "Save Configuration" button.
    *   **Status/Error Display:** Area (`#dataManagementResult`, `#apiTestResult` - repurposed) for feedback messages.
*   **Footer:** Link to project page/developer, version info (optional).

**7. Development Considerations**

*   **Modularity:** Structure code into modules (e.g., `db.js`, `config.js`, `userManager.js`, `dataManager.js`, `apiHandler.js`, `ui.js`, `main.js`).
*   **State Management:** Use module-level variables and functions (like `userManager.users` map, `configManager.currentConfig`) to manage application state.
*   **Code Reuse:** Adapt `UserManager`, `data-manager.js` utilities, `qr-scanner.js`, `displayError.js`, and `config.js` structure heavily.
*   **Testing:** Manually test with various CSV files (including large ones), different whale threshold combinations, connection interruptions, import/export, and data pruning. Consider adding automated unit/integration tests.
*   **Dependencies:** Ensure CDN links (`Dexie.js`, `PapaParse`, `jsQR`, `CryptoJS`) are correct and libraries load properly. Consider local fallbacks or bundling for production.
*   **IndexedDB:** Use `Dexie.js` for managing the database schema (`db.js`) and interactions. Handle potential database errors gracefully.

**8. Deployment**

This will be deployed using cloudflare Pages and a github workflow. So when a git commit is pushed to main branch it will be deployed to Pages and appear as: https://cb-whale-bell.adult-webcam-faq.com - however the stand alone program can by anybody who wants to clone the repo and serve the files themselves. Readme will including instructions on how to do that and explain clearly that no data is being saved to adult-webcam-faq.com, it is all local in the broadcaster's browser **(using IndexedDB)** (and therefore if they clear their browser data for the site, all history is lost and they will have to do the Chaturbate export token_history.csv again).
