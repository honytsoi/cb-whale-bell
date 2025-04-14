// Database setup and operations using Dexie.js
const db = new Dexie("WhaleBellDB");

// Define database schema
// Define database schema - Version 2 (Aggregate & Tiered Retention)
db.version(2).stores({
    config: '&id', // Keep as is (using '&id' assuming 'main' is the only ID)
    users: '&username, lastSeenTimestamp', // Store aggregates. Index username (primary key) and lastSeen.
    recentEvents: '++id, timestamp, username, [username+timestamp]', // Auto-incrementing ID, index timestamp (for pruning), index username (for lookups), compound index.
    backups: '&id' // Keep as is (using '&id' assuming 'currentBackup' is the only ID)
}).upgrade(async (tx) => { // Make upgrade function async
    console.log("Upgrading DB schema to version 2 for Aggregate/Tiered Retention.");
    console.log("Attempting to clear old tables (users, config, backups) to ensure clean upgrade...");
    try {
        // Clear tables known to have schema changes or potential conflicts
        // Need to await these operations within the async upgrade function
        await tx.table('users').clear();
        console.log("Cleared 'users' table.");
        await tx.table('config').clear(); // Clear config as primary key type might differ (&id vs id)
        console.log("Cleared 'config' table.");
        await tx.table('backups').clear(); // Clear backups as primary key type might differ (&id vs id)
        console.log("Cleared 'backups' table.");
        // The old 'events' table is implicitly dropped by Dexie since it's not in version(2).stores()
        console.log("Upgrade step completed successfully.");
    } catch (error) {
        console.error("Error during table clearing in upgrade transaction:", error);
        // Re-throw the error to ensure Dexie knows the upgrade failed
        throw error;
    }
});

// Add this after your Dexie.exists() check
db.on('ready', () => {
    console.log('Database is ready');
});

db.on('blocked', () => {
    console.warn('Database blocked - another instance may be running');
});

db.on('versionchange', (event) => {
    console.log('Database version changed:', event);
});

// Export database instance
export default db;