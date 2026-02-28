// db.js — Database connection module
// Centralizes the MySQL connection so it can be reused across files.
// Usage: const db = require('./db');

require("dotenv").config();
const mysql = require("mysql2");

// ── Create connection ──
const db = mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "document_manager",
    waitForConnections: true,
    connectTimeout: 10000,
});

// ── Connect with error handling ──
db.connect((err) => {
    if (err) {
        console.error("❌ Database connection failed:", err.message);
        console.error("Make sure MySQL is running and your .env is configured correctly.");
        process.exit(1);
    }
    console.log("✅ Connected to MySQL database:", process.env.DB_NAME || "document_manager");
});

// ── Reconnect on dropped connection ──
db.on("error", (err) => {
    console.error("MySQL error:", err);
    if (err.code === "PROTOCOL_CONNECTION_LOST" || err.code === "ECONNRESET") {
        console.log("Reconnecting to MySQL...");
        db.connect();
    } else {
        throw err;
    }
});

module.exports = db;

// ─────────────────────────────────────────────────────────────────
// SQL SETUP — Run these queries once to initialize the database.
// You can execute them manually in MySQL Workbench or via CLI.
// ─────────────────────────────────────────────────────────────────

/*

-- 1. Create the database
CREATE DATABASE IF NOT EXISTS document_manager;
USE document_manager;

-- 2. Create users table
CREATE TABLE IF NOT EXISTS users (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    full_name   VARCHAR(100)         NOT NULL,
    email       VARCHAR(150)         NOT NULL UNIQUE,
    password    VARCHAR(255)         NOT NULL,
    role        ENUM('user','admin') NOT NULL DEFAULT 'user',
    created_at  TIMESTAMP            DEFAULT CURRENT_TIMESTAMP
);

-- 3. (Optional) Seed an admin account
--    Replace the password hash below with bcrypt.hash("yourpassword", 10)
-- INSERT INTO users (full_name, email, password, role)
-- VALUES ('Admin', 'admin@documentmanager.com', '<bcrypt_hash>', 'admin');

*/
