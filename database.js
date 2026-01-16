const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

// Connect to SQLite (Creates file if missing)
const dbPath = path.resolve(__dirname, 'execbrief.sqlite');
const db = new sqlite3.Database(dbPath);

const initDB = () => {
    db.serialize(() => {
        // 1. Create Users Table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            password TEXT,
            name TEXT,
            company_name TEXT,
            role TEXT DEFAULT 'admin',
            tier TEXT DEFAULT 'free', 
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // 2. Create Company Data Table (Metric Storage)
        db.run(`CREATE TABLE IF NOT EXISTS metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            data_json TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        console.log("Database initialized.");
    });
};

// Helper: Create User (Securely)
const createUser = async (email, password, name, company) => {
    const hash = await bcrypt.hash(password, 10);
    return new Promise((resolve, reject) => {
        db.run(`INSERT INTO users (email, password, name, company_name) VALUES (?, ?, ?, ?)`, 
            [email, hash, name, company], 
            function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
};

// Helper: Find User by Email
const findUserByEmail = (email) => {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};


// NEW: Find all users in a specific company
const getTeamMembers = async (companyName) => {
    // Find users who match the company name
    return await usersDB.find({ company_name: companyName }, { password: 0 }); // Exclude passwords
};

// Update exports
module.exports = { createUser, findUserByEmail, getTeamMembers };

module.exports = { db, initDB, createUser, findUserByEmail };