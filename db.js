// Database setup and operations using Dexie.js
const db = new Dexie("WhaleBellDB");

// Define database schema
// Define database schema - Version 2 (Aggregate & Tiered Retention)
db.version(2).stores({
    config: '&id', // Keep as is (using '&id' assuming 'main' is the only ID)
    users: '&username, lastSeenTimestamp', // Store aggregates. Index username (primary key) and lastSeen.
    recentEvents: '++id, timestamp, username, [username+timestamp]', // Auto-incrementing ID, index timestamp (for pruning), index username (for lookups), compound index.
    backups: '&id' // Keep as is (using '&id' assuming 'currentBackup' is the only ID)
}).upgrade(tx => {
    // Migration logic might be needed if you want to attempt to preserve
    // existing *aggregated* data from the old 'users' store.
    // For simplicity in this refactor, we might initially accept that
    // users need to re-import after this schema change.
    console.log("Upgrading DB schema to version 2 for Aggregate/Tiered Retention.");
    // Dexie automatically handles removal of the old 'events' store as it's not defined in version 2.
    // If the old 'users' store used 'id' instead of 'username', migration would be needed here.
    // Example: tx.table('users').clear(); // If starting fresh is acceptable.
});

// Export database instance
export default db;