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
const AGENCY_CHAT_COLLECTION = "agencyChats";

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
const ALLOWED_CREATIVE_REVIEW_STATUSES = new Set(["Pending Review", "Approved", "Changes Requested"]);

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

async function findUserById(userId) {
    return getDocumentById(USERS_COLLECTION, userId);
}

async function findUsersByRole(role) {
    const users = await listDocuments(USERS_COLLECTION);
    return users.filter((user) => String(user.role || "") === String(role || ""));
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

function createId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeStoredFile(file) {
    return {
        fileName: String(file?.fileName || ""),
        mimeType: String(file?.mimeType || "application/octet-stream"),
        size: Number(file?.size || 0),
        dataBase64: String(file?.dataBase64 || ""),
        description: String(file?.description || "").trim(),
        component: String(file?.component || "").trim(),
        version: Math.max(1, Number(file?.version || 1) || 1)
    };
}

function sanitizeCreativeComment(comment, fallback = {}) {
    const message = String(comment?.message || fallback.message || "").trim();
    if (!message) return null;

    return {
        id: String(comment?.id || fallback.id || createId("comment")),
        authorRole: String(comment?.authorRole || fallback.authorRole || ""),
        authorUserId: String(comment?.authorUserId || fallback.authorUserId || ""),
        authorAgencyId: String(comment?.authorAgencyId || fallback.authorAgencyId || ""),
        message,
        createdAt: String(comment?.createdAt || fallback.createdAt || nowIso())
    };
}

function sanitizeAgencyChatMessage(message, fallback = {}) {
    const text = String(message?.message || fallback.message || "").trim();
    if (!text) return null;

    return {
        id: String(message?.id || fallback.id || createId("agencychat")),
        agencyId: String(message?.agencyId || fallback.agencyId || ""),
        authorRole: String(message?.authorRole || fallback.authorRole || ""),
        authorUserId: String(message?.authorUserId || fallback.authorUserId || ""),
        authorAgencyId: String(message?.authorAgencyId || fallback.authorAgencyId || ""),
        authorLabel: String(message?.authorLabel || fallback.authorLabel || "Team Member"),
        message: text,
        createdAt: String(message?.createdAt || fallback.createdAt || nowIso())
    };
}

async function resolveAgencyChatAccess({ agencyId, userId, role }) {
    if (!agencyId || !userId || !role) return { ok: false, status: 400, message: "agencyId, userId and role are required" };

    const user = await findUserById(userId);
    if (!user || user.role !== role) {
        return { ok: false, status: 403, message: "You are not allowed to access this chat" };
    }

    const agency = await getDocumentById(AGENCIES_COLLECTION, agencyId);
    if (!agency) {
        return { ok: false, status: 404, message: "Agency not found" };
    }

    if (role === "Agency" && user.agencyId !== agencyId) {
        return { ok: false, status: 403, message: "You are not allowed to access this agency chat" };
    }

    if (!["Agency", "MarketingManager", "BrandManager"].includes(role)) {
        return { ok: false, status: 403, message: "You are not allowed to access this agency chat" };
    }

    const authorLabel = role === "Agency"
        ? String(agency.name || "Agency")
        : role === "MarketingManager"
            ? "Marketing Manager"
            : "Brand Manager";

    return {
        ok: true,
        user,
        agency,
        authorLabel,
        authorAgencyId: role === "Agency" ? agencyId : ""
    };
}

async function createAgencyChatNotifications({ agencyId, senderUserId, senderRole, authorLabel, messageText }) {
    const agency = await getDocumentById(AGENCIES_COLLECTION, agencyId);
    if (!agency) return;

    const snippet = String(messageText || "").trim();
    const notificationMessage = `${authorLabel} sent a message in ${agency.name || "Agency"} chat: ${snippet}`;
    const recipients = [];

    if (senderRole !== "Agency") {
        recipients.push(agencyId);
    }

    if (senderRole !== "MarketingManager") {
        const campaigns = await listDocuments(CAMPAIGNS_COLLECTION);
        const mmIds = [...new Set(
            campaigns
                .filter((campaign) => campaign.agencyId === agencyId && campaign.mmId)
                .map((campaign) => String(campaign.mmId || ""))
                .filter(Boolean)
        )];
        recipients.push(...mmIds);
    }

    const brandManagers = await findUsersByRole("BrandManager");
    recipients.push(...brandManagers
        .map((brandManager) => String(brandManager._id || ""))
        .filter((brandManagerId) => brandManagerId && brandManagerId !== String(senderUserId || "")));

    const uniqueRecipients = [...new Set(recipients)].filter((recipientId) => recipientId && recipientId !== String(senderUserId || ""));

    await Promise.all(uniqueRecipients.map((recipientId) => (
        createDocument(NOTIFICATIONS_COLLECTION, {
            userId: recipientId,
            fromUserId: senderRole === "Agency" ? agencyId : senderUserId,
            type: "agency_chat",
            message: notificationMessage,
            agencyId,
            agencyName: String(agency.name || "Agency")
        })
    )));
}

function sanitizeCreativeAsset(asset) {
    const uploadedFile = sanitizeStoredFile(asset);
    return {
        id: String(asset?.id || createId("creative")),
        fileName: uploadedFile.fileName,
        mimeType: uploadedFile.mimeType,
        size: uploadedFile.size,
        dataBase64: uploadedFile.dataBase64,
        description: uploadedFile.description,
        component: uploadedFile.component,
        version: uploadedFile.version,
        uploadedByAgencyId: String(asset?.uploadedByAgencyId || ""),
        uploadedAt: String(asset?.uploadedAt || nowIso()),
        reviewStatus: ALLOWED_CREATIVE_REVIEW_STATUSES.has(String(asset?.reviewStatus || ""))
            ? String(asset.reviewStatus)
            : "Pending Review",
        reviewedAt: String(asset?.reviewedAt || ""),
        reviewedByUserId: String(asset?.reviewedByUserId || ""),
        comments: Array.isArray(asset?.comments)
            ? asset.comments
                .map((comment) => sanitizeCreativeComment(comment))
                .filter(Boolean)
            : []
    };
}

function sanitizeCreativeAssetForList(asset) {
    const sanitized = sanitizeCreativeAsset(asset);
    return {
        ...sanitized,
        dataBase64: undefined
    };
}

function buildCreativeCommentNotificationMessage(authorRole, campaignTitle, creativeFileName, commentMessage) {
    const snippet = String(commentMessage || "").trim();
    if (authorRole === "BrandManager") {
        return `Brand manager commented on "${creativeFileName}" for "${campaignTitle}": ${snippet}`;
    }
    if (authorRole === "MarketingManager") {
        return `Marketing manager commented on "${creativeFileName}" for "${campaignTitle}": ${snippet}`;
    }

    return `Agency replied on "${creativeFileName}" for "${campaignTitle}": ${snippet}`;
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

app.get("/api/agencies/:id/chat", async (req, res) => {
    try {
        if (!requireDb(res)) return;

        const { userId, role } = req.query;
        const access = await resolveAgencyChatAccess({
            agencyId: String(req.params.id || ""),
            userId: String(userId || ""),
            role: String(role || "")
        });

        if (!access.ok) {
            return res.status(access.status).json({ message: access.message });
        }

        const messages = await listDocuments(AGENCY_CHAT_COLLECTION);
        const chatHistory = messages
            .filter((entry) => entry.agencyId === String(req.params.id || ""))
            .map((entry) => sanitizeAgencyChatMessage(entry))
            .filter(Boolean)
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        res.json({
            agency: {
                _id: String(access.agency._id || ""),
                name: String(access.agency.name || "Agency")
            },
            messages: chatHistory
        });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error fetching agency chat" });
    }
});

app.post("/api/agencies/:id/chat", async (req, res) => {
    try {
        if (!requireDb(res)) return;

        const { userId, role, message } = req.body;
        const access = await resolveAgencyChatAccess({
            agencyId: String(req.params.id || ""),
            userId: String(userId || ""),
            role: String(role || "")
        });

        if (!access.ok) {
            return res.status(access.status).json({ message: access.message });
        }

        const normalizedMessage = String(message || "").trim();
        if (!normalizedMessage) {
            return res.status(400).json({ message: "Message is required" });
        }

        const nextMessage = sanitizeAgencyChatMessage(null, {
            agencyId: String(req.params.id || ""),
            authorRole: role,
            authorUserId: userId,
            authorAgencyId: access.authorAgencyId,
            authorLabel: access.authorLabel,
            message: normalizedMessage
        });

        const created = await createDocument(AGENCY_CHAT_COLLECTION, nextMessage);
        await createAgencyChatNotifications({
            agencyId: String(req.params.id || ""),
            senderUserId: userId,
            senderRole: role,
            authorLabel: access.authorLabel,
            messageText: normalizedMessage
        });
        res.status(201).json({
            message: "Chat message sent",
            chatMessage: sanitizeAgencyChatMessage(created)
        });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error sending chat message" });
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
            rejectionReason: "",
            creativeAssets: []
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
            if (Array.isArray(json.creativeAssets)) {
                json.creativeAssets = json.creativeAssets.map((asset) => sanitizeCreativeAssetForList(asset));
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
        json.creativeAssets = Array.isArray(json.creativeAssets)
            ? json.creativeAssets.map((asset) => sanitizeCreativeAsset(asset))
            : [];
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

        if (normalizedStatus === "Accepted") {
            const brandManagers = await findUsersByRole("BrandManager");

            await Promise.all(brandManagers.map((brandManager) => (
                createDocument(NOTIFICATIONS_COLLECTION, {
                    userId: String(brandManager._id || ""),
                    fromUserId: campaign.agencyId,
                    type: "campaign_reply",
                    message: `${agencyName} accepted the "${campaign.title}" campaign.`,
                    campaignId: String(campaign._id || ""),
                    campaignTitle: campaign.title,
                    status: normalizedStatus,
                    rejectionReason: ""
                })
            )));
        }

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

app.post("/api/campaigns/:id/creatives", async (req, res) => {
    try {
        if (!requireDb(res)) return;

        const { userId, agencyId, files = [] } = req.body;
        const user = await findUserById(userId);
        if (!user || user.role !== "Agency") {
            return res.status(403).json({ message: "Only agencies can upload creative files" });
        }

        const campaign = await getDocumentById(CAMPAIGNS_COLLECTION, req.params.id);
        if (!campaign) return res.status(404).json({ message: "Campaign not found" });

        if (!agencyId || campaign.agencyId !== agencyId || user.agencyId !== agencyId) {
            return res.status(403).json({ message: "This campaign does not belong to your agency" });
        }

        if (normalizeCampaignStatus(campaign.status) !== "Accepted") {
            return res.status(400).json({ message: "Creative can only be uploaded after the campaign is accepted" });
        }

        if (!Array.isArray(files) || !files.length) {
            return res.status(400).json({ message: "At least one creative file is required" });
        }

        const existingCreatives = Array.isArray(campaign.creativeAssets) ? campaign.creativeAssets.map(sanitizeCreativeAsset) : [];
        const hasApprovedCreative = existingCreatives.some((asset) => String(asset.reviewStatus || "").trim().toLowerCase() === "approved");
        if (hasApprovedCreative) {
            return res.status(400).json({ message: "Creative uploads are locked after approval." });
        }

        function getCreativeVersion() {
            if (!existingCreatives.length) return 1;
            const highest = existingCreatives.reduce((max, asset) => {
                const value = Number(asset.version || 1);
                return Number.isFinite(value) && value > max ? value : max;
            }, 1);
            return highest + 1;
        }
        const nextCreatives = existingCreatives.concat(
            files.map((file) => sanitizeCreativeAsset({
                ...file,
                id: createId("creative"),
                version: getCreativeVersion(),
                uploadedByAgencyId: agencyId,
                uploadedAt: nowIso(),
                reviewStatus: "Pending Review",
                reviewedAt: "",
                reviewedByUserId: "",
                comments: []
            }))
        );

        const updatedCampaign = await updateDocument(CAMPAIGNS_COLLECTION, req.params.id, {
            creativeAssets: nextCreatives
        });

        const brandManagers = await findUsersByRole("BrandManager");
        await Promise.all(brandManagers.map((brandManager) => (
            createDocument(NOTIFICATIONS_COLLECTION, {
                userId: String(brandManager._id || ""),
                fromUserId: agencyId,
                type: "creative_upload",
                message: `${files.length} creative file(s) uploaded for "${campaign.title}".`,
                campaignId: String(campaign._id || ""),
                campaignTitle: campaign.title,
                status: "Pending Review"
            })
        )));

        if (campaign.mmId) {
            await createDocument(NOTIFICATIONS_COLLECTION, {
                userId: campaign.mmId,
                fromUserId: agencyId,
                type: "creative_upload",
                message: `${files.length} creative file(s) uploaded for "${campaign.title}".`,
                campaignId: String(campaign._id || ""),
                campaignTitle: campaign.title,
                status: "Pending Review"
            });
        }

        res.status(201).json({
            message: "Creative uploaded successfully",
            creativeAssets: Array.isArray(updatedCampaign?.creativeAssets)
                ? updatedCampaign.creativeAssets.map((asset) => sanitizeCreativeAsset(asset))
                : []
        });
    } catch (err) {
        console.log("Creative upload error:", err);
        res.status(500).json({ message: err?.message || "Error uploading creative files" });
    }
});

app.post("/api/campaigns/:id/creatives/:creativeId/comments", async (req, res) => {
    try {
        if (!requireDb(res)) return;

        const { userId, role, agencyId = "", message } = req.body;
        const user = await findUserById(userId);
        if (!user || user.role !== role) {
            return res.status(403).json({ message: "You are not allowed to comment on this creative" });
        }

        if (!["BrandManager", "MarketingManager", "Agency"].includes(role)) {
            return res.status(403).json({ message: "Only brand managers, marketing managers, and agencies can comment" });
        }

        const normalizedMessage = String(message || "").trim();
        if (!normalizedMessage) {
            return res.status(400).json({ message: "Comment message is required" });
        }

        const campaign = await getDocumentById(CAMPAIGNS_COLLECTION, req.params.id);
        if (!campaign) return res.status(404).json({ message: "Campaign not found" });

        if (role === "Agency" && (!agencyId || campaign.agencyId !== agencyId || user.agencyId !== agencyId)) {
            return res.status(403).json({ message: "This campaign does not belong to your agency" });
        }

        const creativeAssets = Array.isArray(campaign.creativeAssets) ? campaign.creativeAssets.map(sanitizeCreativeAsset) : [];
        const creativeIndex = creativeAssets.findIndex((asset) => asset.id === req.params.creativeId);
        if (creativeIndex === -1) {
            return res.status(404).json({ message: "Creative file not found" });
        }

        const nextComment = sanitizeCreativeComment(null, {
            authorRole: role,
            authorUserId: userId,
            authorAgencyId: role === "Agency" ? agencyId : "",
            message: normalizedMessage
        });

        creativeAssets[creativeIndex] = {
            ...creativeAssets[creativeIndex],
            comments: [...creativeAssets[creativeIndex].comments, nextComment]
        };

        const updatedCampaign = await updateDocument(CAMPAIGNS_COLLECTION, req.params.id, {
            creativeAssets
        });

        if (role === "BrandManager" || role === "MarketingManager") {
            await createDocument(NOTIFICATIONS_COLLECTION, {
                userId: campaign.agencyId,
                fromUserId: userId,
                type: "creative_comment",
                message: buildCreativeCommentNotificationMessage(
                    role,
                    campaign.title,
                    creativeAssets[creativeIndex].fileName,
                    normalizedMessage
                ),
                campaignId: String(campaign._id || ""),
                campaignTitle: campaign.title,
                creativeId: creativeAssets[creativeIndex].id
            });

            if (role !== "MarketingManager" && campaign.mmId) {
                await createDocument(NOTIFICATIONS_COLLECTION, {
                    userId: campaign.mmId,
                    fromUserId: userId,
                    type: "creative_comment",
                    message: buildCreativeCommentNotificationMessage(
                        role,
                        campaign.title,
                        creativeAssets[creativeIndex].fileName,
                        normalizedMessage
                    ),
                    campaignId: String(campaign._id || ""),
                    campaignTitle: campaign.title,
                    creativeId: creativeAssets[creativeIndex].id
                });
            }
        }

        if (role === "Agency") {
            const brandManagers = await findUsersByRole("BrandManager");
            await Promise.all(brandManagers.map((brandManager) => (
                createDocument(NOTIFICATIONS_COLLECTION, {
                    userId: String(brandManager._id || ""),
                    fromUserId: agencyId,
                    type: "creative_reply",
                    message: buildCreativeCommentNotificationMessage(
                        role,
                        campaign.title,
                        creativeAssets[creativeIndex].fileName,
                        normalizedMessage
                    ),
                    campaignId: String(campaign._id || ""),
                    campaignTitle: campaign.title,
                    creativeId: creativeAssets[creativeIndex].id
                })
            )));

            await createDocument(NOTIFICATIONS_COLLECTION, {
                userId: campaign.mmId,
                fromUserId: agencyId,
                type: "creative_reply",
                message: buildCreativeCommentNotificationMessage(
                    role,
                    campaign.title,
                    creativeAssets[creativeIndex].fileName,
                    normalizedMessage
                ),
                campaignId: String(campaign._id || ""),
                campaignTitle: campaign.title,
                creativeId: creativeAssets[creativeIndex].id
            });
        }

        res.status(201).json({
            message: "Comment added successfully",
            creativeAssets: Array.isArray(updatedCampaign?.creativeAssets)
                ? updatedCampaign.creativeAssets.map((asset) => sanitizeCreativeAsset(asset))
                : []
        });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error adding comment" });
    }
});

app.patch("/api/campaigns/:id/creatives/:creativeId/review", async (req, res) => {
    try {
        if (!requireDb(res)) return;

        const { userId, role, decision, comment = "" } = req.body;
        const user = await findUserById(userId);
        if (!user || user.role !== "BrandManager" || role !== "BrandManager") {
            return res.status(403).json({ message: "Only brand managers can review creative files" });
        }

        const nextStatus = decision === "Approved"
            ? "Approved"
            : decision === "Changes Requested"
                ? "Changes Requested"
                : "";
        if (!nextStatus) {
            return res.status(400).json({ message: "Invalid review decision" });
        }

        const campaign = await getDocumentById(CAMPAIGNS_COLLECTION, req.params.id);
        if (!campaign) return res.status(404).json({ message: "Campaign not found" });

        const creativeAssets = Array.isArray(campaign.creativeAssets) ? campaign.creativeAssets.map(sanitizeCreativeAsset) : [];
        const creativeIndex = creativeAssets.findIndex((asset) => asset.id === req.params.creativeId);
        if (creativeIndex === -1) {
            return res.status(404).json({ message: "Creative file not found" });
        }

        let reviewComment = null;
        if (String(comment || "").trim()) {
            reviewComment = sanitizeCreativeComment(null, {
                authorRole: "BrandManager",
                authorUserId: userId,
                authorAgencyId: "",
                message: String(comment || "").trim()
            });
        }

        creativeAssets[creativeIndex] = {
            ...creativeAssets[creativeIndex],
            reviewStatus: nextStatus,
            reviewedAt: nowIso(),
            reviewedByUserId: userId,
            comments: reviewComment
                ? [...creativeAssets[creativeIndex].comments, reviewComment]
                : creativeAssets[creativeIndex].comments
        };

        const updatedCampaign = await updateDocument(CAMPAIGNS_COLLECTION, req.params.id, {
            creativeAssets
        });

        await createDocument(NOTIFICATIONS_COLLECTION, {
            userId: campaign.agencyId,
            fromUserId: userId,
            type: "creative_review",
            message: nextStatus === "Approved"
                ? `Brand manager approved "${creativeAssets[creativeIndex].fileName}" for "${campaign.title}".`
                : `Brand manager requested changes for "${creativeAssets[creativeIndex].fileName}" on "${campaign.title}".`,
            campaignId: String(campaign._id || ""),
            campaignTitle: campaign.title,
            creativeId: creativeAssets[creativeIndex].id,
            status: nextStatus
        });

        await createDocument(NOTIFICATIONS_COLLECTION, {
            userId: campaign.mmId,
            fromUserId: userId,
            type: "creative_review",
            message: nextStatus === "Approved"
                ? `Brand manager approved "${creativeAssets[creativeIndex].fileName}" for "${campaign.title}".`
                : `Brand manager requested changes for "${creativeAssets[creativeIndex].fileName}" on "${campaign.title}".`,
            campaignId: String(campaign._id || ""),
            campaignTitle: campaign.title,
            creativeId: creativeAssets[creativeIndex].id,
            status: nextStatus
        });

        res.json({
            message: `Creative ${nextStatus.toLowerCase()}`,
            creativeAssets: Array.isArray(updatedCampaign?.creativeAssets)
                ? updatedCampaign.creativeAssets.map((asset) => sanitizeCreativeAsset(asset))
                : []
        });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error reviewing creative file" });
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


