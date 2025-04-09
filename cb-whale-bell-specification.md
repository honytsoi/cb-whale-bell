## Chaturbate Whale Bell - Detailed Specification v1.1

**1. Overview**

Chaturbate Whale Bell is a client-side, static web application designed to alert Chaturbate broadcasters when a potentially high-spending user ("Whale") enters their room. The app leverages historical spending data imported from a Chaturbate `token history.csv` file, processes real-time data from the Chaturbate Events API, and uses broadcaster-defined thresholds to identify these whales. Upon detection of a whale entering the room, the application triggers an audible bell sound. All application state and user data are stored locally in the browser's `localStorage`.

**2. Target Audience**

Chaturbate Broadcasters seeking an audible, real-time notification for the arrival of significant past or potential spenders in their chat room.

**3. Core Technologies & Libraries**

*   **HTML5:** Structure of the application.
*   **CSS3:** Styling the application. (Consider using a simple framework or the existing `main.css` structure).
*   **JavaScript (ES6+ Modules):** Application logic.
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
*   **Processing Logic (Derived from `user-manager.js::importTokenHistory`):**
    *   **Duplicate Prevention:** Before adding an event from the CSV, check if an event with the *exact same* `username`, `timestamp`, and `amount` already exists in the target user's `eventHistory` in `localStorage`. If it does, skip the CSV row to prevent duplication.
    *   **Private Show Grouping:**
        *   Identify potential private/spy show token changes by checking if the `note` contains "Private" or "Spy".
        *   Group consecutive token changes for the *same user* where the `note` indicates a private/spy show and the time gap between consecutive entries is less than a defined threshold (e.g., 30 seconds).
        *   For each identified show group, create a single *meta-event* of type `privateShow` or `privateShowSpy`.
        *   This meta-event should store: `username`, `type` (`privateShow` or `privateShowSpy`), `timestamp` (start time of the show), and `data` containing `startTime`, `endTime`, `duration` (in seconds), `tokens` (total tokens for the show), and crucially `amount` (also total tokens, for consistency with `updateTokenStats`).
    *   **Regular Tips:** Token changes *not* identified as part of a private/spy show sequence are treated as regular tips. Create events of type `tip` with `username`, `timestamp`, and `data` containing `amount` and `note`.
    *   **Event Addition:** Add all generated `tip`, `privateShow`, and `privateShowSpy` events to the respective user's data using the core `addEvent` logic (see 4.3). Ensure events are added chronologically based on their original `timestamp`.
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
*   **Storage:**
    *   Use `localStorage` to persist user data.
    *   **Key:** Use a specific key like `'whaleBellUsers'`.
    *   **Format:** Store data as a JSON string representing a Map or an array of `[username, userObject]` pairs: `JSON.stringify(Array.from(this.users.entries()))`.
*   **User Object Structure (`localStorage`):**
    ```javascript
    {
        username: "string", // Primary key
        firstSeenDate: "string | null", // ISO 8601 timestamp
        lastSeenDate: "string | null", // ISO 8601 timestamp
        // Deprecate or repurpose: mostRecentlySaidThings: [],
        // Deprecate: amountTippedTotal, mostRecentTipAmount, mostRecentTipDatetime (use eventHistory/tokenStats instead)
        // Deprecate: realName, realLocation, preferences, interests, numberOfPrivateShowsTaken (not needed for Whale Bell)
        isOnline: false, // Transient state, reset on load
        eventHistory: [ // Array of event objects, newest first
            // {
            //     username: "string",
            //     type: "string", // e.g., 'tip', 'userEnter', 'privateShow', 'privateShowSpy', 'mediaPurchase' (if tracked)
            //     timestamp: "string", // ISO 8601
            //     data: { // Event-specific data
            //         note: "string | null",
            //         amount: "number | null", // Tokens for this specific event
            //         content: "string | null", // e.g., chat message
            //         isPrivate: "boolean | null",
            //         item: "string | null", // e.g., media set name
            //         // For privateShow/privateShowSpy meta-events:
            //         duration: "number | null", // seconds
            //         tokens: "number | null", // total tokens for the show
            //         startTime: "string | null", // ISO 8601
            //         endTime: "string | null" // ISO 8601
            //     }
            // }
        ],
        tokenStats: { // Aggregated stats, calculated from eventHistory
            username: "string",
            totalSpent: 0, // Lifetime tokens spent (tips + privates + media)
            lastUpdated: "string", // ISO 8601 of last calculation
            // Simplified time periods relevant to Whale Bell:
            timePeriods: {
                day7: { tips: 0, privates: 0, media: 0 }, // Example period
                day30: { tips: 0, privates: 0, media: 0 }, // Example period
                // Add others as needed or calculate on the fly
            }
        },
        maxHistory: 1000 // Max events to store per user
    }
    ```
*   **Core Methods:**
    *   `addUser(username)`: Adds a new user if they don't exist, initializing with default structure.
    *   `getUser(username)`: Retrieves a user object.
    *   `addEvent(username, type, data)`:
        *   The central method for recording interactions (from CSV or live feed).
        *   Ensures user exists (calls `addUser` if not).
        *   Updates `user.firstSeenDate` and `user.lastSeenDate` based on event `timestamp`.
        *   Creates the event object (including original `timestamp`).
        *   Adds the event to the *beginning* of `user.eventHistory`.
        *   Enforces `maxHistory` limit (removes oldest event if exceeded).
        *   If the event involves tokens (`data.amount`), calls `updateTokenStats`.
        *   Triggers `debouncedSave`.
    *   `updateTokenStats(user, event)`: Updates `user.tokenStats.totalSpent` and relevant `timePeriods` based on the event's `type`, `amount`, and `timestamp`.
    *   `recalculateTotals(user)`: (Optional but recommended) Recalculates all `tokenStats` from the user's full `eventHistory`. Useful after imports or for data integrity checks.
    *   `getTotalSpent(username)`: Returns `user.tokenStats.totalSpent`.
    *   `getSpentInPeriod(username, days, category)`: Calculates spending for a category ('tips', 'privates', 'media') within the last `days` by iterating through `eventHistory` (or using pre-calculated `timePeriods`).
    *   `saveUsers()`: Saves the current state of the `users` Map to `localStorage`.
    *   `loadUsers()`: Loads user data from `localStorage` on application start. Resets `isOnline` to `false` for all users.
    *   `debouncedSave()`: Uses `setTimeout` and `clearTimeout` to batch `saveUsers` calls (e.g., 1-second delay).
    *   `handleStorageError(error)`: If `error.name === 'QuotaExceededError'`, implement pruning: sort users by `lastSeenDate` (oldest first), remove a portion (e.g., 50%) of the oldest users, and retry `saveUsers`.
    *   **Whale Check Method:** `isWhale(username, thresholds)`: Takes a username and the current threshold settings. Retrieves the user's data. Calculates relevant metrics (lifetime spent, recent tips/privates within configured timeframes) using `getTotalSpent` and `getSpentInPeriod`. Compares metrics against thresholds. Returns `true` if *any* threshold is met, `false` otherwise.

**4.4. Real-time Event Processing (Adaptation of `app.js::processEvent`)**

*   For each event received from the `getEvents` polling loop:
    *   Extract `method` and `object`.
    *   **`userEnter`**:
        *   Get `username` from `object.user.username`. Ignore 'Anonymous'.
        *   Call `userManager.addEvent(username, 'userEnter', { timestamp: event.timestamp })`.
        *   Call `userManager.markUserOnline(username)` (sets `isOnline: true` and saves).
        *   **WHALE CHECK:** Call `userManager.isWhale(username, currentThresholds)`.
        *   If `isWhale` returns `true`, trigger the bell sound notification (see 4.6) and potentially a subtle visual indicator.
    *   **`userLeave`**:
        *   Get `username`. Ignore 'Anonymous'.
        *   Call `userManager.addEvent(username, 'userLeave', { timestamp: event.timestamp })`.
        *   Call `userManager.markUserOffline(username)` (sets `isOnline: false` and saves).
    *   **`tip`**:
        *   Get `username`, `tokens`, `message`, `isAnon` from `object.tip` and `object.user`. Ignore 'Anonymous' if `isAnon` is false.
        *   Call `userManager.addEvent(username, 'tip', { amount: tokens, note: message, timestamp: event.timestamp })`.
    *   **`privateMessage`**: (Optional: Track if private messages contribute to spending/whale score)
        *   Get `fromUser`, `messageText`. Ignore 'Anonymous'.
        *   Call `userManager.addEvent(fromUser, 'privateMessage', { content: messageText, isPrivate: true, timestamp: event.timestamp })`. (Note: `privateMessage` events don't inherently contain token amounts unless custom logic is added).
    *   **`mediaPurchase`**: (Optional: Track if media purchases contribute to spending)
        *   Get `username`, `mediaType`, `mediaName`, *`price`* (if available in the event payload - **verify this**) from `object.user` and `object.media`. Ignore 'Anonymous'.
        *   Call `userManager.addEvent(username, 'mediaPurchase', { item: mediaName, amount: price, timestamp: event.timestamp })`.
    *   **Other Events:** Log other events (`broadcastStart`, `broadcastStop`, `follow`, `fanclubJoin`, etc.) to an activity feed/console for debugging, but they don't typically trigger core Whale Bell logic unless configured to do so.

**4.5. Configuration Management (Adaptation of `config.js`)**

*   **Storage:**
    *   Use `localStorage`.
    *   **Key:** Use a specific key like `'whaleBellConfig'`.
    *   **Format:** Store as a JSON string.
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
        // Removed: aiModel, promptLanguage, promptDelay, preferences, sessionKey, voice settings
    }
    ```
*   **UI:**
    *   Provide a dedicated "Settings" section (toggleable, similar to `#configSection`).
    *   Include input fields (`type="number"`) for all threshold values and timeframes.
    *   Include a dropdown (`<select>`) for `bellSound`.
    *   Display `#scannedUrl` and `#broadcasterName` (read-only after connection).
    *   Include "Save Configuration" (`#saveConfig`) and "Factory Reset" (`#factoryReset`) buttons.
    *   Include Data Management buttons/options (Export, Import, Password Protection, Merge) as detailed below.
*   **Functionality:**
    *   `loadConfig()`: Load settings from `localStorage` on startup. Populate UI fields.
    *   `saveConfig()`: Read values from UI input fields. Update the settings object. Save to `localStorage`.
    *   `initConfig()`: Called on startup to load config and set up listeners.
    *   `clearLocalStorage()`: Implement factory reset to remove `'whaleBellConfig'`, `'whaleBellUsers'`, and `'whaleBellBackup'`.
    *   **Suggest Thresholds:** Implement a button that analyzes the `tokenStats` (especially `totalSpent`) across all users in `localStorage` (e.g., calculates 75th, 90th, 95th percentiles) and suggests these values for the thresholds, populating the input fields.

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
          "version": "1.1", // Whale Bell specific version
          "timestamp": "ISO 8601 date",
          "users": [ /* Array of user objects as defined in 4.3 */ ],
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
    *   **Backup:** Before importing, create a backup of the *current* user and config data using `data-manager.js::createBackup` and save it to `localStorage` under a key like `'whaleBellBackup'`.
    *   **Merge Option:** Provide a "Merge with existing data" checkbox (`#mergeData`).
        *   If checked: Use `data-manager.js::mergeUsers` logic to combine imported users with existing users (prioritizing newer data, summing relevant stats where applicable).
        *   If unchecked (default): Clear existing user data (`userManager.clearAllUsers()`) before importing.
    *   **Execution:** Iterate through `data.users` and add/update them using `userManager` methods. Update the application config with `data.settings`. Save changes.
    *   Display success/error messages. Reload the page on success to reflect changes cleanly.
*   **Factory Reset:** Button (`#factoryReset`) that calls `clearLocalStorage()`, removing config, users, and backup keys after confirmation.

**5. Non-Functional Requirements**

*   **Performance:** Prioritize efficient calculation of whale metrics, especially `getSpentInPeriod`. Avoid unnecessary loops or recalculations. Debounce saves.
*   **Storage:** Stay within reasonable `localStorage` limits (generally 5-10MB). Implement pruning (`handleStorageError`).
*   **Usability:** Simple, clear interface. Minimal clicks required for core operations. Clear status indication. Sensible defaults for thresholds.
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
    *   **Sound:** Dropdown (`#bellSound`) with sound file options. "Test Sound" button.
    *   **Data Management:** "Import Token History (.csv)" button, "Export Data (.json)" button, "Import Data (.json)" button. Checkboxes/inputs for password (`#enablePassword`, `#dataPassword`) and merge (`#mergeData`). "Factory Reset" button.
    *   **Save:** "Save Configuration" button.
    *   **Status/Error Display:** Area (`#dataManagementResult`, `#apiTestResult` - repurposed) for feedback messages.
*   **Footer:** Link to project page/developer, version info (optional).

**7. Development Considerations**

*   **Modularity:** Structure code into modules (e.g., `config.js`, `userManager.js`, `apiHandler.js`, `ui.js`, `main.js`).
*   **State Management:** Use a central state object (similar to `appState` and `configState`) to manage application status, connection details, and loaded settings.
*   **Code Reuse:** Adapt `UserManager`, `data-manager.js` utilities, `qr-scanner.js`, `displayError.js`, and `config.js` structure heavily.
*   **Testing:** Manually test with various CSV files, different whale threshold combinations, connection interruptions, and storage limits.
*   **Dependencies:** Ensure CDN links are correct and libraries load properly. Consider local fallbacks or bundling for production.
*   **localStorage Keys:** Consistently use distinct keys (`whaleBellUsers`, `whaleBellConfig`, `whaleBellBackup`) to avoid conflicts with other applications or the original Coach app.

**8. Deployment**

This will be deployed using cloudflare Pages and a github workflow.  So when a git commit is pushed to main branch it will be deplooyed to Pages and appear as: https://cb-whale-bell.adult-webcam-faq.com - however the stand alone program can by anybody who wants to clone the repo and serve the files themselves. Readme will including instructions on how to do that and explain clearly that no data is being saved to adult-webcam-faq.com, it is all local on the broadcaster's phone (and therefore if they clear the data on their phone all history is lost and they will have to do the Chaturbate export token_history.csv again)

