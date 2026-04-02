const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcrypt");

const app = express();

app.use(cors());
app.use(express.json({ limit: "30mb" }));
app.use(express.static(path.join(__dirname, "public")));

mongoose.connect("mongodb://127.0.0.1:27017/nestleDB")
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.log("MongoDB Error:", err));

const User = require("./models/user");
const Agency = require("./models/agency");
const Campaign = require("./models/campaign");
const Notification = require("./models/notification");
const LoginAudit = require("./models/loginAudit");

const ALLOWED_CAMPAIGN_STATUSES = new Set(["Accepted", "Decline"]);
const AGENCY_EMAIL_DOMAIN = "@aanestle.com";
const FAILED_LOGIN_LOG_THRESHOLD = 2;
const failedLoginAttempts = new Map();

function escapeRegex(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getClientIp(req) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
        return forwarded.split(",")[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || "unknown-ip";
}

function getLoginAttemptKey(username, req) {
    const normalizedUsername = String(username || "").trim().toLowerCase() || "unknown-user";
    const ip = getClientIp(req);
    return `${normalizedUsername}|${ip}`;
}

async function recordFailedLogin(username, req) {
    const key = getLoginAttemptKey(username, req);
    const nextAttempts = (failedLoginAttempts.get(key) || 0) + 1;
    failedLoginAttempts.set(key, nextAttempts);

    if (nextAttempts === FAILED_LOGIN_LOG_THRESHOLD) {
        const safeUsername = String(username || "").trim() || "unknown-user";
        const ip = getClientIp(req);

        console.warn(
            `[SECURITY] Failed login threshold reached | user=${safeUsername} | ip=${ip} | attempts=${nextAttempts} | time=${new Date().toISOString()}`
        );

        try {
            await LoginAudit.create({
                username: safeUsername,
                ip,
                attempts: nextAttempts,
                eventType: "failed_login_threshold"
            });
        } catch (auditErr) {
            console.log("Failed to persist login audit:", auditErr.message || auditErr);
        }
    }
}

function resetFailedLogin(username, req) {
    const key = getLoginAttemptKey(username, req);
    failedLoginAttempts.delete(key);
}

function hashString(input) {
    let hash = 0;
    const value = String(input || "");
    for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) - hash) + value.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function buildAgencyImageUrl(agencyName, uniqueKey) {
    const keyToken = encodeURIComponent(String(uniqueKey || Date.now()));
    const nameToken = encodeURIComponent(String(agencyName || "Agency"));
    return `/api/media/agency-image?seed=${keyToken}&name=${nameToken}`;
}

function buildCampaignImageUrl(campaignTitle, uniqueKey) {
    const keyToken = encodeURIComponent(String(uniqueKey || Date.now()));
    const titleToken = encodeURIComponent(String(campaignTitle || "Campaign"));
    return `/api/media/campaign-image?seed=${keyToken}&title=${titleToken}`;
}

function normalizeCampaignStatus(status) {
    const value = String(status || "").trim().toLowerCase();
    if (value === "accepted") return "Accepted";
    if (value === "decline" || value === "declined") return "Decline";
    return "Pending";
}

app.get("/", (req, res) => {
    res.send("API is working");
});

app.get("/api/media/agency-image", (req, res) => {
    const seed = req.query.seed || Date.now();
    const name = req.query.name || "Agency Partner";
    const sig = hashString(`agency-${seed}-${name}`);
    res.redirect(`https://picsum.photos/seed/agency-${sig}/1200/700`);
});

app.get("/api/media/campaign-image", (req, res) => {
    const seed = req.query.seed || Date.now();
    const title = req.query.title || "Campaign Brief";
    const sig = hashString(`campaign-${seed}-${title}`);
    res.redirect(`https://picsum.photos/seed/campaign-${sig}/1200/700`);
});

app.post("/api/login", async (req, res) => {
    try {
        const username = String(req.body?.username || "").trim();
        const password = String(req.body?.password || "");

        const user = await User.findOne({ username });
        if (!user) {
            await recordFailedLogin(username, req);
            return res.status(401).json({ message: "Invalid login" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            await recordFailedLogin(username, req);
            return res.status(401).json({ message: "Invalid login" });
        }

        resetFailedLogin(username, req);

        res.json({
            message: "Login successful",
            userId: String(user._id),
            role: user.role,
            agencyId: user.agencyId || null
        });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server error" });
    }
});

app.post("/api/agencies", async (req, res) => {
    try {
        const {
            name,
            username,
            password,
            contactPerson,
            phoneNumber = "",
            description = "",
            imageUrl = ""
        } = req.body;

        if (!name || !username || !contactPerson || !password) {
            return res.status(400).json({ message: "All fields required" });
        }

        const normalizedName = String(name).trim();
        const normalizedContactPerson = String(contactPerson).trim();

        const normalizedUsername = String(username).trim().toLowerCase();
        if (!normalizedUsername.endsWith(AGENCY_EMAIL_DOMAIN)) {
            return res.status(400).json({
                message: `Agency email must end with ${AGENCY_EMAIL_DOMAIN}`
            });
        }

        const duplicateAgency = await Agency.findOne({
            name: { $regex: `^${escapeRegex(normalizedName)}$`, $options: "i" },
            contactPerson: { $regex: `^${escapeRegex(normalizedContactPerson)}$`, $options: "i" }
        });
        if (duplicateAgency) {
            return res.status(400).json({ message: "Agency is already registered" });
        }

        const exists = await User.findOne({ username: normalizedUsername });
        if (exists) return res.status(400).json({ message: "Username already exists" });

        const hashedPassword = await bcrypt.hash(password, 10);

        const resolvedImageUrl = imageUrl || buildAgencyImageUrl(name, `${name}-${Date.now()}`);

        const newAgency = await Agency.create({
            name: normalizedName,
            username: normalizedUsername,
            contactPerson: normalizedContactPerson,
            phoneNumber,
            description,
            imageUrl: resolvedImageUrl
        });

        await User.create({
            username: normalizedUsername,
            password: hashedPassword,
            role: "Agency",
            agencyId: String(newAgency._id)
        });

        res.status(201).json({
            message: "Agency + Login created successfully",
            agency: newAgency
        });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error adding agency" });
    }
});

app.get("/api/agencies", async (req, res) => {
    try {
        const agencies = await Agency.find().sort({ createdAt: -1 });

        const usedImages = new Set();
        const normalized = agencies.map((agency) => {
            const json = agency.toObject();
            let nextImage = buildAgencyImageUrl(json.name, json._id);
            if (usedImages.has(nextImage)) {
                nextImage = buildAgencyImageUrl(json.name, `${json._id}-${Date.now()}`);
            }

            usedImages.add(nextImage);
            return { ...json, imageUrl: nextImage };
        });

        res.json(normalized);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error fetching agencies" });
    }
});

app.get("/api/agencies/:id", async (req, res) => {
    try {
        const agency = await Agency.findById(req.params.id);
        if (!agency) return res.status(404).json({ message: "Agency not found" });

        const json = agency.toObject();
        json.imageUrl = buildAgencyImageUrl(json.name, json._id);

        res.json(json);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error fetching agency" });
    }
});

app.post("/api/campaigns", async (req, res) => {
    try {
        const {
            title,
            targetAudience = "",
            budgetRange = "",
            startDate = "",
            endDate = "",
            description = "",
            objectives = "",
            attachments = [],
            agencyId,
            mmId
        } = req.body;

        if (!title || !agencyId || !mmId) {
            return res.status(400).json({ message: "title, agencyId and mmId are required" });
        }

        const agency = await Agency.findById(agencyId);
        if (!agency) return res.status(404).json({ message: "Agency not found" });

        const campaign = await Campaign.create({
            title,
            targetAudience,
            budgetRange,
            startDate,
            endDate,
            description,
            objectives,
            attachments: Array.isArray(attachments) ? attachments.map((file) => ({
                fileName: String(file.fileName || ""),
                mimeType: String(file.mimeType || "application/octet-stream"),
                size: Number(file.size || 0),
                dataBase64: String(file.dataBase64 || "")
            })) : [],
            agencyId,
            mmId,
            status: "Pending"
        });

        await Notification.create({
            userId: String(agency._id),
            fromUserId: mmId,
            type: "campaign_request",
            message: `New campaign request: "${campaign.title}"`,
            campaignId: String(campaign._id),
            campaignTitle: campaign.title,
            status: "Pending"
        });

        res.status(201).json(campaign);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error creating campaign" });
    }
});

app.get("/api/campaigns", async (req, res) => {
    try {
        const { agencyId, status } = req.query;
        const filters = {};
        if (agencyId) filters.agencyId = agencyId;
        if (status) filters.status = normalizeCampaignStatus(status);

        const campaigns = await Campaign.find(filters)
            .select("-attachments.dataBase64")
            .sort({ createdAt: -1 });
        const normalized = campaigns.map((campaign) => {
            const json = campaign.toObject();
            json.status = normalizeCampaignStatus(json.status);
            return json;
        });
        res.json(normalized);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error fetching campaigns" });
    }
});

app.get("/api/campaigns/:id", async (req, res) => {
    try {
        const campaign = await Campaign.findById(req.params.id);
        if (!campaign) return res.status(404).json({ message: "Campaign not found" });

        const json = campaign.toObject();
        json.status = normalizeCampaignStatus(json.status);
        res.json(json);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error fetching campaign details" });
    }
});

app.patch("/api/campaigns/:id/status", async (req, res) => {
    try {
        const { status, agencyId } = req.body;
        const normalizedStatus = normalizeCampaignStatus(status);
        if (!ALLOWED_CAMPAIGN_STATUSES.has(normalizedStatus)) {
            return res.status(400).json({ message: "Invalid status" });
        }

        const campaign = await Campaign.findById(req.params.id);
        if (!campaign) return res.status(404).json({ message: "Campaign not found" });

        if (agencyId && campaign.agencyId !== agencyId) {
            return res.status(403).json({ message: "Campaign does not belong to this agency" });
        }

        campaign.status = normalizedStatus;
        await campaign.save();

        const agency = await Agency.findById(campaign.agencyId);
        const agencyName = agency?.name || "Agency";
        const statusText = normalizedStatus;

        await Notification.create({
            userId: campaign.mmId,
            fromUserId: campaign.agencyId,
            type: "campaign_reply",
            message: `${agencyName} ${statusText} campaign "${campaign.title}"`,
            campaignId: String(campaign._id),
            campaignTitle: campaign.title,
            status: normalizedStatus
        });

        await Notification.updateMany(
            {
                userId: campaign.agencyId,
                campaignId: String(campaign._id),
                type: "campaign_request"
            },
            { $set: { status: normalizedStatus, read: true } }
        );

        res.json({ message: `Campaign ${statusText}`, campaign });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error updating campaign status" });
    }
});

app.post("/api/notifications", async (req, res) => {
    try {
        const notification = await Notification.create(req.body);
        res.json(notification);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error sending notification" });
    }
});

app.get("/api/notifications", async (req, res) => {
    try {
        const { userId, unreadOnly } = req.query;
        if (!userId) return res.status(400).json({ message: "userId is required" });

        const filters = { userId };
        if (unreadOnly === "true") filters.read = false;

        const notes = await Notification.find(filters).sort({ createdAt: -1 });
        const normalized = notes.map((note) => {
            const json = note.toObject();
            if (json.type === "campaign_request" || json.type === "campaign_reply") {
                json.status = normalizeCampaignStatus(json.status);
            }
            return json;
        });
        res.json(normalized);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error fetching notifications" });
    }
});

app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
        const updated = await Notification.findByIdAndUpdate(
            req.params.id,
            { read: true },
            { new: true }
        );
        if (!updated) return res.status(404).json({ message: "Notification not found" });
        res.json(updated);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error updating notification" });
    }
});

app.patch("/api/notifications/read-all", async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ message: "userId is required" });

        await Notification.updateMany({ userId, read: false }, { $set: { read: true } });
        res.json({ message: "Notifications marked as read" });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error updating notifications" });
    }
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});


