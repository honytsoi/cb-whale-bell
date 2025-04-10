Instead of using localStorage use indexdb.

Using dexi like this:

```html <script src="https://unpkg.com/dexie@3.2.4/dist/dexie.min.js"></script> ``` 

Find the places that localStorage is used and instead do something like this with indexdeb.

First, identify all uses of localstorage and list them here:

List of places localstorage is used :

1.  **dataManager.js**:
    *   Line 564: `localStorage.setItem(BACKUP_KEY, JSON.stringify(backupData));` (Saving backup data)
    *   Line 585: `localStorage.removeItem(BACKUP_KEY);` (Removing backup data)
2.  **config.js**:
    *   Line 28: `localStorage.getItem(CONFIG_KEY);` (Loading configuration)
    *   Line 64: `localStorage.setItem(CONFIG_KEY, JSON.stringify(currentConfig));` (Saving configuration)
    *   Line 89: `localStorage.removeItem(CONFIG_KEY);` (Removing configuration)
3.  **userManager.js**:
    *   Line 18: `localStorage.getItem(USERS_KEY);` (Loading user data)
    *   Line 78: `localStorage.setItem(USERS_KEY, JSON.stringify(usersArray));` (Saving user data)

Then decide how to replace this with indexdeb. Do we just use a big blob? Or keys per user or what?

**Revised Plan for IndexedDB Implementation (Including Event History):**

**Core Idea:** Replace `localStorage` with structured IndexedDB object stores. Introduce a dedicated store for event history to support future analysis requirements.

1.  **Library Inclusion:** Add Dexie.js library to `index.html`.
    ```html
    <script src="https://unpkg.com/dexie@3.2.4/dist/dexie.min.js"></script>
    ```
2.  **Database Definition:** Create a database named `WhaleBellDB` and define the necessary object stores with appropriate indexes. This should likely happen in a central place, perhaps `dataManager.js` or a new `db.js` module.
    ```javascript
    const db = new Dexie("WhaleBellDB");
    // Increment version number if schema changes from previous version
    db.version(1).stores({
      config: 'id',          // Primary key 'id'. Stores single config object with id='main'.
      users: 'id',           // Primary key 'id' (username). Stores individual user objects. Indexed by username.
      backups: 'id',         // Primary key 'id'. Stores single backup object with id='currentBackup'.
      events: '++, [userId+timestamp], userId, type' // Auto-incrementing PK '++', Compound index for user+time queries, separate indexes for user and type lookups.
    });
    ```
    *   **`events` Store Rationale:** A separate `events` store is chosen over embedding events in the `user` object. This allows efficient querying of event history using IndexedDB indexes (e.g., finding events for a specific user within a date range) and scales better as history grows, supporting future analysis needs.

3.  **Replacement & Enhancement Strategy:**
    *   **Configuration (`config.js`):**
        *   **Load:** Replace `localStorage.getItem` with `await db.config.get('main')`. Handle `undefined` case.
        *   **Save:** Replace `localStorage.setItem` with `await db.config.put({ id: 'main', ...currentConfig })`.
        *   **Remove:** Replace `localStorage.removeItem` with `await db.config.delete('main')`.
    *   **User Data (`userManager.js`):**
        *   **Load:** Replace `localStorage.getItem` logic. Fetch all users using `await db.users.toArray()`. Reconstruct the `users` Map.
        *   **Save:** Replace `localStorage.setItem` logic. Convert `users` Map to an array (`Array.from(users.values())`) and save using `await db.users.bulkPut(usersArray)`.
    *   **Backup Data (`dataManager.js`):**
        *   **Save:** Replace `localStorage.setItem` with `await db.backups.put({ id: 'currentBackup', ...backupData })`. (Note: Consider if backups should *also* include the `events` table data. This could significantly increase backup size and complexity. Initially, backups might only include `users` and `config`).
        *   **Remove:** Replace `localStorage.removeItem` with `await db.backups.delete('currentBackup')`.
    *   **Event Handling (`userManager.addEvent`):**
        *   **Enhance:** In addition to updating in-memory user stats (via `updateTokenStats`), this function must now also persist the event to the database.
        ```javascript
        // Inside userManager.addEvent, after creating the 'event' object:
        async function storeEvent(username, type, timestamp, eventData) {
          try {
            // Use the correct userId (username) and structure the event data as needed
            const eventToStore = {
              userId: username, // Assuming 'username' is the user identifier
              type: type,
              timestamp: timestamp, // Ensure this is a valid ISO string or Date object
              data: { ...eventData } // Store relevant details from the event
            };
            await db.events.add(eventToStore);
            console.log(`Event '${type}' for user '${username}' stored.`);
          } catch (error) {
            console.error(`Failed to store event '${type}' for user '${username}':`, error);
            // Decide on error handling - log, notify user?
          }
        }
        // Call storeEvent within addEvent:
        // await storeEvent(username, type, timestamp, eventData);

        // The rest of the function (calling updateTokenStats, etc.) remains.
        ```

4.  **Querying Event History:** (Examples for future use)
    *   To get all events for a user, sorted by time:
        ```javascript
        async function getUserEventHistory(username) {
          return await db.events.where({ userId: username }).sortBy('timestamp');
        }
        ```
    *   To get events for a user within a specific time range (e.g., for calculating spending):
        ```javascript
        async function getUserEventsInRange(username, startDate, endDate) {
          // Ensure startDate and endDate are in a format Dexie understands (e.g., Date objects or ISO strings)
          return await db.events
            .where('[userId+timestamp]')
            .between([username, startDate], [username, endDate], true, true) // true, true for inclusive range
            .toArray();
        }
        ```
    *   To get specific types of events for a user:
        ```javascript
        async function getUserEventsByType(username, eventType) {
            return await db.events.where({ userId: username, type: eventType }).toArray();
        }
        ```

5.  **Data Migration (One-time):**
NO DATA MIGRATION - THERE IS NO PRODUCTION DATA AS THIS APP IS STILL IN INITIAL DEVELOPMENT