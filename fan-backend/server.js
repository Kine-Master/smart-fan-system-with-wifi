// Load environment variables
require('dotenv').config();

// Import required modules
const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const http = require('http');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

// Initialize Express and HTTP server
const app = express();
const server = http.createServer(app);

// Middleware
app.use(bodyParser.json());
app.use(cors());

// CORS headers
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Database Connection
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

db.connect(err => {
    if (err) console.error("❌ Database connection error:", err);
    else console.log("✅ Connected to MySQL");
});

// FIFO: Maintain only 100 sensor entries
function maintainFIFO() {
    db.query("SELECT id FROM sensor_data ORDER BY id ASC", (err, results) => {
        if (err) return console.error("❌ FIFO Error:", err);
        if (results.length > 100) {
            let deleteCount = results.length - 100;
            let oldestIds = results.slice(0, deleteCount).map(row => row.id);
            db.query("DELETE FROM sensor_data WHERE id IN (?)", [oldestIds], () => {
                console.log("🗑️ Old sensor data removed to maintain FIFO.");
            });
        }
    });
}

// API to receive data from ESP8266
app.post("/receive-data", (req, res) => {
    console.log("📡 Incoming request to /receive-data");
    console.log("🔍 Request Body:", req.body);

    const { temperature, distance, fan_status } = req.body;

    if (temperature === undefined || distance === undefined || fan_status === undefined) {
        console.error("❌ Missing data in request");
        return res.status(400).json({ success: false, error: "Missing required data" });
    }

    console.log(`✅ Received Data -> Temp: ${temperature}, Distance: ${distance}, Fan: ${fan_status}`);

    db.query(
        "INSERT INTO sensor_data (temperature, distance, fan_status) VALUES (?, ?, ?)",
        [temperature, distance, fan_status],
        (err) => {
            if (err) return console.error("❌ DB Insert Error:", err);
            maintainFIFO(); // Maintain FIFO without WebSocket
        }
    );

    res.json({ success: true, message: "Data received successfully" });
});

// API to get the latest sensor data
app.get("/api/latest-sensor-data", (req, res) => {
    console.log("🔍 Fetching latest sensor data...");
    db.query("SELECT * FROM sensor_data ORDER BY id DESC LIMIT 1", (err, results) => {
        if (err) {
            console.error("❌ Failed to fetch data:", err);
            return res.status(500).json({ success: false, error: "Failed to fetch data" });
        }
        res.json({ success: true, data: results[0] });
    });
});

// API to fetch usage history
app.get("/api/usage-history", (req, res) => {
    console.log("📜 Fetching usage history...");
    db.query("SELECT * FROM sensor_data ORDER BY id DESC LIMIT 10", (err, results) => {
        if (err) return res.status(500).json({ success: false, error: "Failed to fetch history" });
        res.json({ success: true, history: results });
    });
});

// API to get stored settings
app.get("/api/settings", (req, res) => {
    console.log("⚙️ Fetching stored settings...");
    db.query("SELECT * FROM settings WHERE id=1", (err, results) => {
        if (err) {
            console.error("❌ Failed to fetch settings:", err);
            return res.status(500).json({ success: false, error: "Failed to fetch settings" });
        }
        if (results.length === 0) {
            console.warn("⚠️ No settings found in database!");
            return res.status(404).json({ success: false, error: "No settings found" });
        }
        res.json({ success: true, settings: results[0] });
    });
});

// API to update settings
app.post("/update-settings", (req, res) => {
    console.log("⚙️ Updating settings...");
    const { speed1_threshold, speed2_threshold, speed3_threshold, distance_threshold } = req.body;

    db.query(
        "UPDATE settings SET speed1_threshold=?, speed2_threshold=?, speed3_threshold=?, distance_threshold=? WHERE id=1",
        [speed1_threshold, speed2_threshold, speed3_threshold, distance_threshold],
        (err) => {
            if (err) return res.status(500).json({ success: false, error: "Failed to update settings" });
            res.json({ success: true, message: "Settings updated successfully" });
        }
    );
});

// Authentication Middleware
function verifyToken(req, res, next) {
    const token = req.headers["authorization"];
    if (!token) return res.status(403).json({ success: false, error: "No token provided" });
    jwt.verify(token.split(" ")[1], process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ success: false, error: "Unauthorized" });
        req.user = decoded;
        next();
    });
}

// ✅ User Registration
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (password.length < 6) return res.status(400).json({ success: false, error: "Password must be at least 6 characters" });
    bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.status(500).json({ success: false, error: "Hashing error" });
        db.query("INSERT INTO users (username, password) VALUES (?, ?)", [username, hash], (dbErr) => {
            if (dbErr) return res.status(500).json({ success: false, error: "Database error" });
            res.json({ success: true, message: "User registered successfully" });
        });
    });
});

// ✅ User Login
app.post('/login', (req, res) => {
    console.log("🔐 User attempting login...");
    const { username, password } = req.body;
    db.query("SELECT * FROM users WHERE username = ?", [username], (err, results) => {
        if (err || results.length === 0) return res.status(401).json({ success: false, error: "Invalid credentials" });
        bcrypt.compare(password, results[0].password, (compareErr, isMatch) => {
            if (isMatch) {
                const token = jwt.sign({ id: results[0].id, username }, process.env.JWT_SECRET, { expiresIn: '1h' });
                res.json({ success: true, token });
            } else {
                res.status(401).json({ success: false, error: "Invalid credentials" });
            }
        });
    });
});

// Start Server
server.listen(process.env.PORT || 3000, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://0.0.0.0:${process.env.PORT || 3000}`);
});
