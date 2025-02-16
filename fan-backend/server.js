// Load environment variables
require('dotenv').config();

// Import required modules
const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');
const WebSocket = require('ws');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

// Initialize Express and HTTP server
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});
const wss = new WebSocket.Server({ server });

// Middleware
app.use(bodyParser.json());
app.use(require('cors')());

// CORS headers
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*'); // Allow all origins
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
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
    if (err) console.error("Database connection error:", err);
    else console.log("Connected to MySQL");
});

// FIFO: Maintain only 100 sensor entries
function maintainFIFO() {
    db.query("SELECT id FROM sensor_data ORDER BY id ASC", (err, results) => {
        if (err) console.error(err);
        else if (results.length > 100) {
            let deleteCount = results.length - 100;
            let oldestIds = results.slice(0, deleteCount).map(row => row.id);
            db.query("DELETE FROM sensor_data WHERE id IN (?)", [oldestIds]);
        }
    });
}

// Function to broadcast data to WebSocket clients
function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// API to receive data from ESP8266 and broadcast updates
app.post("/receive-data", (req, res) => {
    const { temperature, distance, fan_status, oscillation_status } = req.body;

    db.query("INSERT INTO sensor_data (temperature, distance, fan_status, oscillation_status) VALUES (?, ?, ?, ?)", 
        [temperature, distance, fan_status, oscillation_status], (err) => {
            if (!err) maintainFIFO(); // Maintain FIFO structure

            // Broadcast real-time sensor data to WebSocket clients
            broadcast({
                type: "sensor_update",
                temperature,
                distance,
                fan_status,
                oscillation_status
            });
        }
    );

    res.json({ success: true, message: "Data received successfully" });
});

// API to get latest sensor data
app.get("/api/latest-sensor-data", (req, res) => {
    db.query("SELECT * FROM sensor_data ORDER BY id DESC LIMIT 1", (err, results) => {
        if (err) res.status(500).json({ success: false, error: "Failed to fetch data" });
        else res.json({ success: true, data: results[0] });
    });
});

app.get("/api/usage-history", (req, res) => {
    db.query("SELECT * FROM sensor_data ORDER BY id DESC LIMIT 10", (err, results) => {
        if (err) res.status(500).json({ success: false, error: "Failed to fetch history" });
        else res.json({ success: true, history: results });
    });
});


// API to update thresholds & oscillation
app.post("/update-settings", (req, res) => {
    const { speed1_threshold, speed2_threshold, speed3_threshold, distance_threshold, oscillation_status } = req.body;
    
    db.query("UPDATE settings SET speed1_threshold=?, speed2_threshold=?, speed3_threshold=?, distance_threshold=?, oscillation_status=? WHERE id=1", 
        [speed1_threshold, speed2_threshold, speed3_threshold, distance_threshold, oscillation_status], (err) => {
            if (!err) {
                broadcast({ type: "settings_update", speed1_threshold, speed2_threshold, speed3_threshold, distance_threshold, oscillation_status });
                res.json({ success: true, message: "Settings updated successfully" });
            } else {
                res.status(500).json({ success: false, error: "Failed to update settings" });
            }
        }
    );
});


app.post("/update-oscillation", (req, res) => {
    const { oscillation_status } = req.body;
    db.query("UPDATE settings SET oscillation_status=? WHERE id=1", 
        [oscillation_status], (err) => {
            if (!err) {
                broadcast({ type: "oscillation_update", oscillation_status });
                res.json({ success: true, message: "Oscillation status updated successfully" });
            } else {
                res.status(500).json({ success: false, error: "Database error" });
            }
        }
    );
});

// API to get settings
app.get("/api/settings", (req, res) => {
    db.query("SELECT * FROM settings WHERE id=1", (err, results) => {
        if (err) res.status(500).json({ success: false, error: "Failed to fetch settings" });
        else res.json({ success: true, settings: results[0] });
    });
});

app.get("/api/oscillation", (req, res) => {
    db.query("SELECT oscillation_status FROM settings WHERE id=1", (err, results) => {
        if (err) {
            res.status(500).json({ success: false, error: "Failed to fetch oscillation status" });
        } else {
            res.json({ success: true, oscillation_status: results[0].oscillation_status });
        }
    });
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


// WebSocket Connection (For ESP8266 & Frontend)
wss.on("connection", ws => {
    console.log("New WebSocket connection");
    ws.on("message", message => console.log("Received:", message));
});

// Start Server
server.listen(process.env.PORT, () => {
    console.log(`Server running on http://localhost:${process.env.PORT}`);
});
