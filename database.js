const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const bcrypt = require("bcryptjs");

// Connect to SQLite
const dbPath = path.resolve(__dirname, "execbrief.sqlite");
const db = new sqlite3.Database(dbPath);

/* ===========================
   INIT & SAFE MIGRATIONS
=========================== */
const initDB = () => {
  db.serialize(() => {
    // Users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password TEXT,
        name TEXT,
        company_name TEXT,
        role TEXT DEFAULT 'admin',
        tier TEXT DEFAULT 'free',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Metrics / Reports table (base)
    db.run(`
      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        data_json TEXT,
        state TEXT DEFAULT 'draft',
        parent_report_id INTEGER,
        reviewed_at DATETIME,
        finalized_at DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Safe column migration
    migrateMetricsColumns();

    console.log("✅ Database initialized safely");
  });
};

/* ===========================
   SAFE COLUMN MIGRATION
=========================== */
function migrateMetricsColumns() {
  db.all(`PRAGMA table_info(metrics)`, (err, columns) => {
    if (err || !columns) return;

    const existing = columns.map(c => c.name);

    const addColumn = (name, sql) => {
      if (!existing.includes(name)) {
        db.run(sql, err => {
          if (err) console.error(`❌ Failed adding column ${name}`, err);
          else console.log(`➕ Added column: ${name}`);
        });
      }
    };

    addColumn(
      "state",
      `ALTER TABLE metrics ADD COLUMN state TEXT DEFAULT 'draft'`
    );
    addColumn(
      "parent_report_id",
      `ALTER TABLE metrics ADD COLUMN parent_report_id INTEGER`
    );
    addColumn(
      "reviewed_at",
      `ALTER TABLE metrics ADD COLUMN reviewed_at DATETIME`
    );
    addColumn(
      "finalized_at",
      `ALTER TABLE metrics ADD COLUMN finalized_at DATETIME`
    );
    addColumn(
      "created_at",
      `ALTER TABLE metrics ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`
    );
  });
}

/* ===========================
   HELPERS
=========================== */

// Create user
const createUser = async (email, password, name, company) => {
  const hash = await bcrypt.hash(password, 10);
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO users (email, password, name, company_name)
       VALUES (?, ?, ?, ?)`,
      [email, hash, name, company],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
};

// Find user by email
const findUserByEmail = email =>
  new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM users WHERE email = ?`,
      [email],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });

// Team members
const getTeamMembers = companyName =>
  new Promise((resolve, reject) => {
    db.all(
      `
      SELECT id, email, name, company_name, role, tier, created_at
      FROM users
      WHERE company_name = ?
      `,
      [companyName],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });

module.exports = {
  db,
  initDB,
  createUser,
  findUserByEmail,
  getTeamMembers
};
