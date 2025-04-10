// Database setup and operations using Dexie.js
const db = new Dexie("WhaleBellDB");

// Define database schema
db.version(1).stores({
    config: 'id',          // Primary key 'id'. Stores single config object with id='main'
    users: 'id',           // Primary key 'id' (username)
    backups: 'id',         // Primary key 'id'. Stores single backup object with id='currentBackup'
    events: '++id, [userId+timestamp], userId, type' // Auto-incrementing PK, compound index for user+time queries
});

// Export database instance
export default db;