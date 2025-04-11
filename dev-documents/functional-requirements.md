Document 1: Functional Requirements 
1. Overview
CB Whale Bell is a client-side web application designed for Chaturbate broadcasters. Its primary purpose is to import, analyze, and monitor user tipping history to identify and provide real-time alerts for high-value tippers ("whales") entering the broadcaster's chat room. All user data processing and storage occur exclusively within the user's browser, ensuring data privacy.
2. Core Features
FR-01: Token History Import (CSV)
FR-01.1: The application MUST allow users to import their Chaturbate Token History via a standard CSV file upload.
FR-01.2: The application MUST parse CSV files containing at least the following columns (case-insensitive matching): "User", "Token change", "Timestamp", "Note", "Transaction type".
FR-01.3: The application MUST validate imported rows, ensuring the presence and basic validity of username, positive token amount, and parsable timestamp. Invalid rows should be skipped with feedback provided.
FR-01.4: The application MUST process valid rows, extracting username, token amount, timestamp, transaction type, and note.
FR-01.5: The application MUST implement logic to prevent importing duplicate transaction events based on user, timestamp, and amount.
FR-01.6: The application MUST group consecutive 'Private show' or 'Spy on private show' entries for the same user within a defined time threshold (e.g., 30 seconds) into single 'privateShow' or 'privateShowSpy' meta-events, summing the tokens.
FR-01.7: The application MUST provide feedback on the import process, including the number of rows processed, events added, users found/updated, tokens imported, duplicates skipped, and any errors encountered.
FR-01.8: The application MUST display progress updates during large CSV imports.

FR-02: Real-time Event Monitoring (Events API)
FR-02.1: The application MUST allow users to connect to the Chaturbate Events API using a provided URL.
FR-02.2: Connection MUST be possible via:
Scanning a QR code containing the Events API URL.
Manually pasting the Events API URL into an input field.
FR-02.3: The application MUST validate the provided URL format.
FR-02.4: Once connected, the application MUST continuously LONG poll (with fetch) the Events API for new events using the provided nextUrl.
FR-02.5: The application MUST process the following event types: userEnter, userLeave, tip, mediaPurchase. Processing includes extracting relevant data (username, amount, timestamp, message/item) and adding it to the corresponding user's record. Anonymous users/tips should be ignored for tracking but can be logged.
FR-02.6: The application MUST display the current connection status (Disconnected, Connecting, Connected) and the connected broadcaster's username.
FR-02.7: The application MUST handle API connection errors gracefully and implement an automatic retry mechanism with exponential backoff or fixed delay.
FR-02.8: The application MUST allow the user to manually disconnect from the Events API.

FR-03: User Data Management
FR-03.1: The application MUST store all user data (profiles, event history, calculated stats) locally within the user's browser using IndexedDB.
FR-03.2: Each user record MUST contain: username, first seen date, last seen date, online status, a limited event history (most recent N events, e.g., 1000), and calculated token statistics.
FR-03.3: Token statistics MUST include: total lifetime tokens spent, total lifetime tips, total lifetime private shows (including spy), total lifetime media purchases.
FR-03.4: Token statistics MUST include pre-calculated sums for specific recent periods (e.g., last 1 day, 7 days, 30 days) for total spend, tips, and privates.
FR-03.5: User statistics MUST be updated based on both imported CSV data and real-time events. Recalculation should be triggered after imports or data merges.

FR-04: Whale Identification & Notification
FR-04.1: The application MUST allow users to configure numerical thresholds to define a "whale". Configurable thresholds MUST include:
Minimum total lifetime spending.
Minimum total lifetime tips.
Minimum total lifetime private show spending.
Minimum spending on tips within a configurable recent timeframe (e.g., X tokens in the last Y seconds).
Minimum spending on private shows within a configurable recent timeframe.
Minimum amount for a single large tip within the recent tip timeframe.
FR-04.2: The application MUST check if a user meets any configured whale threshold upon receiving a userEnter event for that user.
FR-04.3: If a user entering the room is identified as a whale, the application MUST trigger an immediate notification.
FR-04.4: The whale notification MUST include an audible sound (a clear "bell" or similar).
FR-04.5: The whale notification MUST include a distinct visual indicator in the activity log/UI.
FR-04.6: The application MUST provide a function to suggest reasonable threshold values based on the distribution of spending within the imported user data (e.g., using percentiles).

FR-05: Configuration Management
FR-05.1: The application MUST persist configuration settings (whale thresholds, API URL, sound preferences) locally using IndexedDB or localStorage.
FR-05.2: The application MUST provide a settings interface allowing users to view and modify configurable parameters.
FR-05.3: The application MUST allow users to test the selected notification sound.
FR-06: Data Backup & Recovery
FR-06.1: The application MUST allow users to export all their stored user data and configuration settings into a single JSON file.
FR-06.2: The application MUST offer optional password-based AES encryption for the exported JSON file.
FR-06.3: The application MUST allow users to import data from a previously exported JSON file.
FR-06.4: The import function MUST support decryption if the file is password-protected.
FR-06.5: The import function MUST offer two modes:
Replace: Overwrite all existing data with the data from the imported file.
Merge: Combine the imported data with existing data, adding new users and merging event histories for existing users (avoiding duplicates).
FR-06.6: The application MUST validate the structure of the imported JSON file.
FR-06.7: The application MUST provide a "Factory Reset" option to completely clear all stored user data, configuration, and backups from the browser, after explicit user confirmation.

3. Non-Functional Requirements
NFR-01: Performance: The application MUST remain responsive during normal operation. Data import and analysis should not block the UI for extended periods. Calculations (especially getSpentInPeriod) must be optimized.
NFR-02: Security & Privacy: All user data MUST remain strictly client-side. No data should be transmitted to any external server, except for polling the Chaturbate Events API.
NFR-03: Usability: The interface should be intuitive and easy for non-technical users to understand and operate. Core functions (connecting, viewing activity, settings) should be easily accessible.
NFR-04: Browser Support: The application MUST function correctly on the latest versions of major desktop browsers (Chrome, Firefox, Edge).
NFR-05: Data Integrity: The application must handle data storage and retrieval reliably, minimizing risk of data loss or corruption during normal operation or browser closing.
