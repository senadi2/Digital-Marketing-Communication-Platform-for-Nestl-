const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcrypt");
const { getDb } = require("./firebase");

const USERS_COLLECTION = "users";
const AGENCIES_COLLECTION = "agencies";
const CAMPAIGNS_COLLECTION = "campaigns";
const NOTIFICATIONS_COLLECTION = "notifications";
const LOGIN_AUDITS_COLLECTION = "loginAudits";

const app = express();

app.use(cors());
app.use(express.json({ limit: "30mb" }));
app.use(express.static(path.join(__dirname, "public")));

let db = null;
let dbInitializationError = null;

try {
    db = getDb();
    console.log("Firestore Connected");
} catch (err) {
    dbInitializationError = err;
    console.log("Firebase Error:", err.message || err);
}

const ALLOWED_CAMPAIGN_STATUSES = new Set(["Accepted", "Decline"]);
const AGENCY_EMAIL_DOMAIN = "@aanestle.com";
const FAILED_LOGIN_LOG_THRESHOLD = 2;
const failedLoginAttempts = new Map();

function requireDb(res) {
    if (db) return true;

    const details = dbInitializationError?.message || "Missing Firebase credentials";
    res.status(500).json({
        message: "Firebase is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH before starting the server.",
        details
    });
    return false;
}

function nowIso() {
    return new Date().toISOString();
}

function mapDoc(doc) {
    return {
        _id: doc.id,
        ...doc.data()
    };
}

async function createDocument(collectionName, data) {
    const timestamp = nowIso();
    const payload = {
        ...data,
        createdAt: data.createdAt || timestamp,
        updatedAt: timestamp
    };

    const docRef = await db.collection(collectionName).add(payload);
    return { _id: docRef.id, ...payload };
}

async function getDocumentById(collectionName, id) {
    if (!id) return null;

    const doc = await db.collection(collectionName).doc(String(id)).get();
    if (!doc.exists) return null;

    return mapDoc(doc);
}

async function listDocuments(collectionName) {
    const snapshot = await db.collection(collectionName).orderBy("createdAt", "desc").get();
    return snapshot.docs.map(mapDoc);
}

async function updateDocument(collectionName, id, updates) {
    const docRef = db.collection(collectionName).doc(String(id));
    const existing = await docRef.get();

    if (!existing.exists) return null;

    const nextPayload = {
        ...updates,
        updatedAt: nowIso()
    };

    await docRef.set(nextPayload, { merge: true });
    const updated = await docRef.get();
    return mapDoc(updated);
}

async function findUserByUsername(username) {
    const users = await listDocuments(USERS_COLLECTION);
    return users.find((user) => String(user.username || "") === String(username || "")) || null;
}

async function findAgencyByNameAndContact(name, contactPerson) {
    const normalizedName = String(name || "").trim().toLowerCase();
    const normalizedContact = String(contactPerson || "").trim().toLowerCase();
    const agencies = await listDocuments(AGENCIES_COLLECTION);

    return agencies.find((agency) => (
        String(agency.name || "").trim().toLowerCase() === normalizedName
        && String(agency.contactPerson || "").trim().toLowerCase() === normalizedContact
    )) || null;
}

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
            await createDocument(LOGIN_AUDITS_COLLECTION, {
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
        if (!requireDb(res)) return;

        const username = String(req.body?.username || "").trim();
        const password = String(req.body?.password || "");

        const user = await findUserByUsername(username);
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
            userId: String(user._id || ""),
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
        if (!requireDb(res)) return;

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

        const duplicateAgency = await findAgencyByNameAndContact(normalizedName, normalizedContactPerson);
        if (duplicateAgency) {
            return res.status(400).json({ message: "Agency is already registered" });
        }

        const exists = await findUserByUsername(normalizedUsername);
        if (exists) return res.status(400).json({ message: "Username already exists" });

        const hashedPassword = await bcrypt.hash(password, 10);

        const resolvedImageUrl = imageUrl || buildAgencyImageUrl(name, `${name}-${Date.now()}`);

        const newAgency = await createDocument(AGENCIES_COLLECTION, {
            name: normalizedName,
            username: normalizedUsername,
            contactPerson: normalizedContactPerson,
            phoneNumber,
            description,
            imageUrl: resolvedImageUrl
        });

        await createDocument(USERS_COLLECTION, {
            username: normalizedUsername,
            password: hashedPassword,
            role: "Agency",
            agencyId: String(newAgency._id || "")
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
        if (!requireDb(res)) return;

        const agencies = await listDocuments(AGENCIES_COLLECTION);

        const usedImages = new Set();
        const normalized = agencies.map((agency) => {
            const json = { ...agency };
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
        if (!requireDb(res)) return;

        const agency = await getDocumentById(AGENCIES_COLLECTION, req.params.id);
        if (!agency) return res.status(404).json({ message: "Agency not found" });

        const json = { ...agency };
        json.imageUrl = buildAgencyImageUrl(json.name, json._id);

        res.json(json);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error fetching agency" });
    }
});

app.post("/api/campaigns", async (req, res) => {
    try {
        if (!requireDb(res)) return;

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

        const agency = await getDocumentById(AGENCIES_COLLECTION, agencyId);
        if (!agency) return res.status(404).json({ message: "Agency not found" });

        const campaign = await createDocument(CAMPAIGNS_COLLECTION, {
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
            status: "Pending",
            rejectionReason: ""
        });

        await createDocument(NOTIFICATIONS_COLLECTION, {
            userId: String(agency._id || ""),
            fromUserId: mmId,
            type: "campaign_request",
            message: `Campaign "${campaign.title}" has been assigned to your agency.`,
            campaignId: String(campaign._id || ""),
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
        if (!requireDb(res)) return;

        const { agencyId, status } = req.query;
        const campaigns = await listDocuments(CAMPAIGNS_COLLECTION);
        const filters = campaigns.filter((campaign) => {
            if (agencyId && campaign.agencyId !== agencyId) return false;
            if (status && campaign.status !== normalizeCampaignStatus(status)) return false;
            return true;
        });
        const normalized = filters.map((campaign) => {
            const json = { ...campaign };
            json.status = normalizeCampaignStatus(json.status);
            if (Array.isArray(json.attachments)) {
                json.attachments = json.attachments.map((file) => ({
                    fileName: file.fileName,
                    mimeType: file.mimeType,
                    size: file.size
                }));
            }
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
        if (!requireDb(res)) return;

        const campaign = await getDocumentById(CAMPAIGNS_COLLECTION, req.params.id);
        if (!campaign) return res.status(404).json({ message: "Campaign not found" });

        const json = { ...campaign };
        json.status = normalizeCampaignStatus(json.status);
        res.json(json);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error fetching campaign details" });
    }
});

app.patch("/api/campaigns/:id/status", async (req, res) => {
    try {
        if (!requireDb(res)) return;

        const { status, agencyId, rejectionReason = "" } = req.body;
        const normalizedStatus = normalizeCampaignStatus(status);
        if (!ALLOWED_CAMPAIGN_STATUSES.has(normalizedStatus)) {
            return res.status(400).json({ message: "Invalid status" });
        }

        const normalizedRejectionReason = String(rejectionReason || "").trim();
        if (normalizedStatus === "Decline" && !normalizedRejectionReason) {
            return res.status(400).json({ message: "Rejection reason is required when declining a campaign" });
        }

        const campaign = await getDocumentById(CAMPAIGNS_COLLECTION, req.params.id);
        if (!campaign) return res.status(404).json({ message: "Campaign not found" });

        if (agencyId && campaign.agencyId !== agencyId) {
            return res.status(403).json({ message: "Campaign does not belong to this agency" });
        }

        const updatedCampaign = await updateDocument(CAMPAIGNS_COLLECTION, req.params.id, {
            status: normalizedStatus,
            rejectionReason: normalizedStatus === "Decline" ? normalizedRejectionReason : ""
        });

        const agency = await getDocumentById(AGENCIES_COLLECTION, campaign.agencyId);
        const agencyName = agency?.name || "Agency";
        const statusText = normalizedStatus;
        const managerMessage = normalizedStatus === "Decline"
            ? `${agencyName} declined campaign "${campaign.title}". Reason: ${normalizedRejectionReason}`
            : `${agencyName} accepted campaign "${campaign.title}"`;

        await createDocument(NOTIFICATIONS_COLLECTION, {
            userId: campaign.mmId,
            fromUserId: campaign.agencyId,
            type: "campaign_reply",
            message: managerMessage,
            campaignId: String(campaign._id || ""),
            campaignTitle: campaign.title,
            status: normalizedStatus,
            rejectionReason: normalizedStatus === "Decline" ? normalizedRejectionReason : ""
        });

        const notifications = await listDocuments(NOTIFICATIONS_COLLECTION);
        const matchingNotifications = notifications.filter((note) => (
            note.userId === campaign.agencyId
            && note.campaignId === String(campaign._id || "")
            && note.type === "campaign_request"
        ));

        await Promise.all(matchingNotifications.map((note) => (
            updateDocument(NOTIFICATIONS_COLLECTION, note._id, {
                status: normalizedStatus,
                read: true
            })
        )));

        res.json({ message: `Campaign ${statusText}`, campaign: updatedCampaign });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error updating campaign status" });
    }
});

app.post("/api/notifications", async (req, res) => {
    try {
        if (!requireDb(res)) return;

        const notification = await createDocument(NOTIFICATIONS_COLLECTION, req.body);
        res.json(notification);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error sending notification" });
    }
});

app.get("/api/notifications", async (req, res) => {
    try {
        if (!requireDb(res)) return;

        const { userId, unreadOnly } = req.query;
        if (!userId) return res.status(400).json({ message: "userId is required" });

        const notes = await listDocuments(NOTIFICATIONS_COLLECTION);
        const filteredNotes = notes.filter((note) => {
            if (note.userId !== userId) return false;
            if (unreadOnly === "true" && note.read) return false;
            return true;
        });
        const normalized = filteredNotes.map((note) => {
            const json = { ...note };
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
        if (!requireDb(res)) return;

        const updated = await updateDocument(NOTIFICATIONS_COLLECTION, req.params.id, { read: true });
        if (!updated) return res.status(404).json({ message: "Notification not found" });
        res.json(updated);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error updating notification" });
    }
});

app.patch("/api/notifications/read-all", async (req, res) => {
    try {
        if (!requireDb(res)) return;

        const { userId } = req.body;
        if (!userId) return res.status(400).json({ message: "userId is required" });

        const notifications = await listDocuments(NOTIFICATIONS_COLLECTION);
        const unreadNotes = notifications.filter((note) => note.userId === userId && !note.read);

        await Promise.all(unreadNotes.map((note) => (
            updateDocument(NOTIFICATIONS_COLLECTION, note._id, { read: true })
        )));

        res.json({ message: "Notifications marked as read" });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error updating notifications" });
    }
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});


