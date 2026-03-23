// ================= IMPORTS =================
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcrypt");

// ================= INIT APP =================
const app = express();

// ================= MIDDLEWARE =================
app.use(cors());
app.use(express.json());

// ✅ Serve frontend
app.use(express.static(path.join(__dirname, "public")));

// ================= DATABASE =================
mongoose.connect("mongodb://127.0.0.1:27017/nestleDB")
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.log("❌ MongoDB Error:", err));

// ================= MODELS =================
const User = require("./models/User");
const Agency = require("./models/Agency");
const Campaign = require("./models/Campaign");
const Notification = require("./models/Notification");

// ================= ROUTES =================
// Test route
app.get("/", (req, res) => {
    res.send("API is working 🚀");
});

// ================= LOGIN API =================
app.post("/api/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = await User.findOne({ username });

        if (!user) {
            return res.status(401).json({ message: "Invalid login" });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid login" });
        }

        res.json({
            message: "Login successful",
            role: user.role,
            agencyId: user.agencyId || null
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server error" });
    }
});


// ================= AGENCY API =================

// Add agency (Marketing Manager only)
app.post("/api/agencies", async (req, res) => {
    try {
        const { name, username, password, contactPerson } = req.body;

        // Check required fields
        if (!name || !username || !contactPerson || !password) {
            return res.status(400).json({ message: "All fields required" });
        }

        // Check if username already exists
        const exists = await User.findOne({ username });
        if (exists) return res.status(400).json({ message: "Username already exists" });

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create Agency
        const newAgency = new Agency({
            name,
            username,
            contactPerson
        });
        await newAgency.save();

        // Create User login for agency
        const newUser = new User({
            username,
            password: hashedPassword,
            role: "Agency",
            agencyId: newAgency._id
        });
        await newUser.save();

        res.status(201).json({ message: "Agency + Login created successfully" });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error adding agency" });
    }
});

// Get all agencies
app.get("/api/agencies", async (req, res) => {
    try {
        const agencies = await Agency.find();
        res.json(agencies);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error fetching agencies" });
    }
});

// ================= CAMPAIGN API =================

// Create campaign
app.post("/api/campaigns", async (req, res) => {
    try {
        const campaign = new Campaign(req.body);
        await campaign.save();

        res.json({ message: "Campaign created" });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error creating campaign" });
    }
});

// Get campaigns by agency
app.get("/api/campaigns", async (req, res) => {
    try {
        const { agencyId } = req.query;
        const campaigns = await Campaign.find({ agencyId });
        res.json(campaigns);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error fetching campaigns" });
    }
});

// ================= NOTIFICATION API =================

// Send notification
app.post("/api/notifications", async (req, res) => {
    try {
        const notification = new Notification(req.body);
        await notification.save();

        res.json({ message: "Notification sent" });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error sending notification" });
    }
});

// Get notifications
app.get("/api/notifications", async (req, res) => {
    try {
        const { userId } = req.query;
        const notes = await Notification.find({ userId });
        res.json(notes);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error fetching notifications" });
    }
});

// ================= START SERVER =================
app.listen(3000, () => {
    console.log("🚀 Server running on http://localhost:3000");
});