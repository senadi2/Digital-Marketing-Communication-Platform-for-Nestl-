const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const bcrypt = require("bcrypt");
const ffmpegPath = require("ffmpeg-static");
const { getDb } = require("./firebase");

const USERS_COLLECTION = "users";
const AGENCIES_COLLECTION = "agencies";
const PRODUCTS_COLLECTION = "products";
const CAMPAIGNS_COLLECTION = "campaigns";
const NOTIFICATIONS_COLLECTION = "notifications";
const LOGIN_AUDITS_COLLECTION = "loginAudits";
const AGENCY_CHAT_COLLECTION = "agencyChats";
const CREATIVE_UPLOAD_DIR = path.join(__dirname, "public", "uploads", "creatives");

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
const VIDEO_VARIANT_FILL_MODE = "blank-fill";

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

async function deleteDocument(collectionName, id) {
    if (!id) return false;

    const docRef = db.collection(collectionName).doc(String(id));
    const existing = await docRef.get();
    if (!existing.exists) return false;

    await docRef.delete();
    return true;
}

async function deleteCampaignNotifications(campaignId) {
    const notifications = await listDocuments(NOTIFICATIONS_COLLECTION);
    const matchingNotifications = notifications.filter((note) => String(note.campaignId || "") === String(campaignId || ""));

    await Promise.all(matchingNotifications.map((note) => (
        db.collection(NOTIFICATIONS_COLLECTION).doc(String(note._id)).delete()
    )));
}

async function deleteCampaignCreativeFiles(campaignId) {
    const campaignDir = path.resolve(CREATIVE_UPLOAD_DIR, String(campaignId || ""));
    const uploadRoot = path.resolve(CREATIVE_UPLOAD_DIR);

    if (!campaignId || !campaignDir.startsWith(uploadRoot)) return;
    await fs.promises.rm(campaignDir, { recursive: true, force: true });
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

function stripUndefined(value) {
    if (Array.isArray(value)) {
        return value
            .map((item) => stripUndefined(item))
            .filter((item) => item !== undefined);
    }

    if (value && typeof value === "object") {
        return Object.entries(value).reduce((cleaned, [key, item]) => {
            const nextValue = stripUndefined(item);
            if (nextValue !== undefined) {
                cleaned[key] = nextValue;
            }
            return cleaned;
        }, {});
    }

    return value === undefined ? null : value;
}

function sanitizeStoredFile(file) {
    return {
        fileName: String(file?.fileName || ""),
        mimeType: String(file?.mimeType || "application/octet-stream"),
        size: Number(file?.size || 0),
        dataBase64: String(file?.dataBase64 || ""),
        fileUrl: String(file?.fileUrl || ""),
        storagePath: String(file?.storagePath || ""),
        description: String(file?.description || "").trim(),
        component: String(file?.component || "").trim(),
        version: Math.max(1, Number(file?.version || 1) || 1)
    };
}

function safeUploadFileName(fileName) {
    const ext = path.extname(String(fileName || "")).slice(0, 16);
    const base = path.basename(String(fileName || "creative"), ext)
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 70) || "creative";
    return `${base}${ext}`;
}

function safeGeneratedFileName(fileName) {
    return safeUploadFileName(fileName)
        .replace(/\.[^.]+$/, "")
        .replace(/-+$/g, "") || "creative";
}

async function storeCreativeUploadFile(campaignId, creativeId, file) {
    const dataBase64 = String(file?.dataBase64 || "");
    if (!dataBase64) {
        return {
            fileUrl: String(file?.fileUrl || ""),
            storagePath: String(file?.storagePath || "")
        };
    }

    const campaignDir = path.join(CREATIVE_UPLOAD_DIR, String(campaignId));
    await fs.promises.mkdir(campaignDir, { recursive: true });

    const fileName = `${creativeId}-${safeUploadFileName(file?.fileName)}`;
    const absolutePath = path.join(campaignDir, fileName);
    await fs.promises.writeFile(absolutePath, Buffer.from(dataBase64, "base64"));

    return {
        fileUrl: `/uploads/creatives/${encodeURIComponent(String(campaignId))}/${encodeURIComponent(fileName)}`,
        storagePath: absolutePath
    };
}

function sanitizeCreativeComment(comment, fallback = {}) {
    const message = String(comment?.message || fallback.message || "").trim();
    if (!message) return null;
    const rawTimestamp = comment?.timestampSeconds ?? fallback.timestampSeconds;
    const timestampSeconds = rawTimestamp === "" || rawTimestamp === null || rawTimestamp === undefined
        ? null
        : Math.max(0, Number(rawTimestamp) || 0);

    return {
        id: String(comment?.id || fallback.id || createId("comment")),
        authorRole: String(comment?.authorRole || fallback.authorRole || ""),
        authorUserId: String(comment?.authorUserId || fallback.authorUserId || ""),
        authorAgencyId: String(comment?.authorAgencyId || fallback.authorAgencyId || ""),
        message,
        timestampSeconds,
        createdAt: String(comment?.createdAt || fallback.createdAt || nowIso())
    };
}

const POST_CREATIVE_VARIANTS = [
    { channel: "Instagram Feed", width: 1080, height: 1080, aspectRatio: "1:1", format: "PNG" },
    { channel: "Instagram Story", width: 1080, height: 1920, aspectRatio: "9:16", format: "PNG" },
    { channel: "Facebook Feed", width: 1080, height: 1080, aspectRatio: "1:1", format: "PNG" },
    { channel: "Google Ads Landscape", width: 1200, height: 628, aspectRatio: "1.91:1", format: "PNG" },
    { channel: "Google Ads Square", width: 1200, height: 1200, aspectRatio: "1:1", format: "PNG" },
    { channel: "LinkedIn Feed Landscape", width: 1200, height: 628, aspectRatio: "1.91:1", format: "PNG" },
    { channel: "LinkedIn Feed Square", width: 1200, height: 1200, aspectRatio: "1:1", format: "PNG" }
];

const VIDEO_CREATIVE_VARIANTS = [
    { channel: "Instagram Reels", width: 1080, height: 1920, aspectRatio: "9:16", format: "MP4/MOV" },
    { channel: "Instagram Story", width: 1080, height: 1920, aspectRatio: "9:16", format: "MP4/MOV" },
    { channel: "YouTube Landscape", width: 1920, height: 1080, aspectRatio: "16:9", format: "MP4/MOV" },
    { channel: "Facebook Video Feed", width: 1080, height: 1080, aspectRatio: "1:1", format: "MP4/MOV" },
    { channel: "TikTok Vertical", width: 1080, height: 1920, aspectRatio: "9:16", format: "MP4/MOV" }
];

function normalizeVariantChannel(channel) {
    const value = String(channel || "");
    if (value === "Google Display Landscape") return "Google Ads Landscape";
    if (value === "Google Display Square") return "Google Ads Square";
    return value;
}

function isVideoCampaignType(campaign) {
    return String(campaign?.campaignType || "").trim().toLowerCase() === "video";
}

function isImageCreativeAsset(creative) {
    return String(creative?.mimeType || "").toLowerCase().startsWith("image/");
}

function sanitizeCreativeVariant(variant, fallback = {}) {
    const width = Math.max(1, Number(variant?.width || fallback.width || 0) || 0);
    const height = Math.max(1, Number(variant?.height || fallback.height || 0) || 0);
    if (!width || !height) return null;

    return {
        id: String(variant?.id || fallback.id || createId("variant")),
        channel: normalizeVariantChannel(variant?.channel || fallback.channel || "Platform Variant"),
        width,
        height,
        aspectRatio: String(variant?.aspectRatio || fallback.aspectRatio || `${width}:${height}`),
        format: String(variant?.format || fallback.format || "PNG"),
        status: String(variant?.status || fallback.status || "Ready"),
        variantType: String(variant?.variantType || fallback.variantType || "image"),
        sourceCreativeId: String(variant?.sourceCreativeId || fallback.sourceCreativeId || ""),
        sourceFileName: String(variant?.sourceFileName || fallback.sourceFileName || ""),
        sourceFileUrl: String(variant?.sourceFileUrl || fallback.sourceFileUrl || ""),
        sourceMimeType: String(variant?.sourceMimeType || fallback.sourceMimeType || ""),
        fileName: String(variant?.fileName || fallback.fileName || ""),
        fileUrl: String(variant?.fileUrl || fallback.fileUrl || ""),
        storagePath: String(variant?.storagePath || fallback.storagePath || ""),
        fillMode: String(variant?.fillMode || fallback.fillMode || ""),
        generatedAt: String(variant?.generatedAt || fallback.generatedAt || nowIso())
    };
}

function buildApprovedCreativeVariants(campaign, creative) {
    if (!isVideoCampaignType(campaign) && !isImageCreativeAsset(creative)) {
        return [];
    }

    const baseVariants = isVideoCampaignType(campaign) ? VIDEO_CREATIVE_VARIANTS : POST_CREATIVE_VARIANTS;
    const variantType = isVideoCampaignType(campaign) ? "video-spec" : "image";
    const generatedAt = nowIso();

    return baseVariants.map((variant) => sanitizeCreativeVariant(null, {
        ...variant,
        id: createId("variant"),
        status: "Ready",
        variantType,
        fillMode: variantType === "video-spec" ? VIDEO_VARIANT_FILL_MODE : "safe-fit",
        sourceCreativeId: String(creative?.id || ""),
        sourceFileName: String(creative?.fileName || ""),
        sourceFileUrl: String(creative?.fileUrl || ""),
        sourceMimeType: String(creative?.mimeType || ""),
        generatedAt
    })).filter(Boolean);
}

function runFfmpeg(args) {
    return new Promise((resolve, reject) => {
        if (!ffmpegPath) {
            reject(new Error("FFmpeg binary is unavailable."));
            return;
        }

        const child = spawn(ffmpegPath, args, { windowsHide: true });
        let stderr = "";

        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });
        child.on("error", reject);
        child.on("close", (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(stderr || `FFmpeg exited with code ${code}`));
        });
    });
}

async function generateVideoCreativeVariants(campaignId, campaign, creative, variants) {
    if (!isVideoCampaignType(campaign) || !String(creative?.mimeType || "").toLowerCase().startsWith("video/")) {
        return variants;
    }

    const inputPath = String(creative?.storagePath || "");
    if (!inputPath || !fs.existsSync(inputPath)) {
        return variants;
    }

    const variantDir = path.join(CREATIVE_UPLOAD_DIR, String(campaignId), "variants", String(creative.id || "approved"));
    await fs.promises.mkdir(variantDir, { recursive: true });

    const baseName = safeGeneratedFileName(creative.fileName || "approved-video");
    const generated = [];

    for (const variant of variants) {
        const fileName = `${safeUploadFileName(`${baseName}-${variant.channel}-${variant.width}x${variant.height}.mp4`)}`;
        const outputPath = path.join(variantDir, fileName);
        const width = Number(variant.width || 0);
        const height = Number(variant.height || 0);
        const filter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:white,setsar=1`;

        await runFfmpeg([
            "-y",
            "-i", inputPath,
            "-vf", filter,
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "23",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "128k",
            "-movflags", "+faststart",
            outputPath
        ]);

        generated.push(sanitizeCreativeVariant({
            ...variant,
            fileName,
            fileUrl: `/uploads/creatives/${encodeURIComponent(String(campaignId))}/variants/${encodeURIComponent(String(creative.id || "approved"))}/${encodeURIComponent(fileName)}`,
            storagePath: outputPath,
            fillMode: VIDEO_VARIANT_FILL_MODE,
            status: "Ready"
        }));
    }

    return generated;
}

function approvedVideoNeedsVariantFiles(campaign, creative) {
    if (!isVideoCampaignType(campaign)) return false;
    if (String(creative?.reviewStatus || "") !== "Approved") return false;
    if (!String(creative?.mimeType || "").toLowerCase().startsWith("video/")) return false;

    const variants = Array.isArray(creative?.variants) ? creative.variants : [];
    if (!variants.length) return true;
    if (variants.some((variant) => variant.fillMode !== VIDEO_VARIANT_FILL_MODE)) return true;
    return variants.some((variant) => !variant.fileUrl || !variant.storagePath);
}

async function ensureApprovedVideoVariantFiles(campaignId, campaign, creativeAssets) {
    let changed = false;
    const nextAssets = [];

    for (const creative of creativeAssets) {
        if (!approvedVideoNeedsVariantFiles(campaign, creative)) {
            nextAssets.push(creative);
            continue;
        }

        const baseVariants = buildApprovedCreativeVariants(campaign, creative);
        const generatedVariants = await generateVideoCreativeVariants(campaignId, campaign, creative, baseVariants);
        nextAssets.push({
            ...creative,
            variants: generatedVariants
        });
        changed = true;
    }

    if (!changed) return { changed: false, creativeAssets };
    return { changed: true, creativeAssets: nextAssets };
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
        fileUrl: uploadedFile.fileUrl,
        storagePath: uploadedFile.storagePath,
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
            : [],
        variants: Array.isArray(asset?.variants)
            ? asset.variants
                .map((variant) => sanitizeCreativeVariant(variant))
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
    res.sendFile(path.join(__dirname, "public", "LOGIN.html"));
});

app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
        return next();
    }
    res.sendFile(path.join(__dirname, "public", "LOGIN.html"));
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

app.post("/api/products", async (req, res) => {
    try {
        if (!requireDb(res)) return;

        const {
            name,
            category = ""
        } = req.body;

        const normalizedName = String(name || "").trim();
        const normalizedCategory = String(category || "").trim();
        if (!normalizedName || !normalizedCategory) {
            return res.status(400).json({ message: "Product name and category are required" });
        }

        const products = await listDocuments(PRODUCTS_COLLECTION);
        const duplicate = products.find((product) => (
            String(product.name || "").trim().toLowerCase() === normalizedName.toLowerCase()
        ));
        if (duplicate) {
            return res.status(400).json({ message: "Product is already registered" });
        }

        const product = await createDocument(PRODUCTS_COLLECTION, {
            name: normalizedName,
            category: normalizedCategory
        });

        res.status(201).json({ message: "Product registered successfully", product });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error adding product" });
    }
});

app.get("/api/products", async (req, res) => {
    try {
        if (!requireDb(res)) return;

        const products = await listDocuments(PRODUCTS_COLLECTION);
        const campaigns = await listDocuments(CAMPAIGNS_COLLECTION);
        const normalized = products.map((product) => {
            const productCampaigns = campaigns.filter((campaign) => campaign.productId === product._id);
            const totalBudget = productCampaigns.reduce((sum, campaign) => {
                const amount = Number(String(campaign.budgetRange || "").replace(/[^\d.]/g, ""));
                return Number.isFinite(amount) ? sum + amount : sum;
            }, 0);
            return {
                ...product,
                campaignCount: productCampaigns.length,
                activeCampaignCount: productCampaigns.filter((campaign) => normalizeCampaignStatus(campaign.status) !== "Decline").length,
                totalBudget
            };
        });

        res.json(normalized);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error fetching products" });
    }
});

app.get("/api/products/:id", async (req, res) => {
    try {
        if (!requireDb(res)) return;

        const product = await getDocumentById(PRODUCTS_COLLECTION, req.params.id);
        if (!product) return res.status(404).json({ message: "Product not found" });

        const campaigns = (await listDocuments(CAMPAIGNS_COLLECTION))
            .filter((campaign) => campaign.productId === String(product._id || ""));
        const agencies = await listDocuments(AGENCIES_COLLECTION);
        const agencyIds = new Set(campaigns.map((campaign) => campaign.agencyId).filter(Boolean));
        const productAgencies = agencies.filter((agency) => agencyIds.has(agency._id));

        res.json({
            ...product,
            campaigns: campaigns.map((campaign) => ({
                ...campaign,
                status: normalizeCampaignStatus(campaign.status),
                agencyName: agencies.find((agency) => agency._id === campaign.agencyId)?.name || ""
            })),
            agencies: productAgencies,
            performance: {
                totalCampaigns: campaigns.length,
                activeCampaigns: campaigns.filter((campaign) => normalizeCampaignStatus(campaign.status) !== "Decline").length,
                totalBudget: campaigns.reduce((sum, campaign) => {
                    const amount = Number(String(campaign.budgetRange || "").replace(/[^\d.]/g, ""));
                    return Number.isFinite(amount) ? sum + amount : sum;
                }, 0)
            }
        });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error fetching product" });
    }
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
            productId,
            productName = "",
            campaignGoal = "",
            campaignType = "",
            platforms = "",
            expectedKpi = "",
            agencyId,
            mmId
        } = req.body;

        if (!title || !productId || !agencyId || !mmId) {
            return res.status(400).json({ message: "title, productId, agencyId and mmId are required" });
        }

        const product = await getDocumentById(PRODUCTS_COLLECTION, productId);
        if (!product) return res.status(404).json({ message: "Product not found" });

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
            productId,
            productName: productName || product.name || "",
            campaignGoal,
            campaignType,
            platforms,
            expectedKpi,
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
            message: `Campaign "${campaign.title}" for ${product.name || "a product"} has been assigned to your agency.`,
            campaignId: String(campaign._id || ""),
            campaignTitle: campaign.title,
            productId: String(product._id || ""),
            productName: product.name || "",
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

        const { agencyId, productId, status } = req.query;
        const campaigns = await listDocuments(CAMPAIGNS_COLLECTION);
        const filters = campaigns.filter((campaign) => {
            if (agencyId && campaign.agencyId !== agencyId) return false;
            if (productId && campaign.productId !== productId) return false;
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
        let creativeAssets = Array.isArray(json.creativeAssets)
            ? json.creativeAssets.map((asset) => sanitizeCreativeAsset(asset))
            : [];
        const repaired = await ensureApprovedVideoVariantFiles(req.params.id, json, creativeAssets);
        if (repaired.changed) {
            await updateDocument(CAMPAIGNS_COLLECTION, req.params.id, {
                creativeAssets: stripUndefined(repaired.creativeAssets)
            });
            creativeAssets = repaired.creativeAssets;
        }
        json.creativeAssets = creativeAssets;
        res.json(json);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error fetching campaign details" });
    }
});

app.patch("/api/campaigns/:id", async (req, res) => {
    try {
        if (!requireDb(res)) return;

        const {
            role,
            userId,
            title,
            targetAudience = "",
            budgetRange = "",
            campaignType = "",
            startDate = "",
            endDate = "",
            description = "",
            objectives = "",
            campaignGoal = "",
            platforms = "",
            expectedKpi = ""
        } = req.body;

        if (role !== "MarketingManager") {
            return res.status(403).json({ message: "Only the marketing manager can edit campaign details" });
        }

        const user = userId ? await findUserById(userId) : null;
        if (userId && user?.role !== "MarketingManager") {
            return res.status(403).json({ message: "Invalid marketing manager account" });
        }

        const campaign = await getDocumentById(CAMPAIGNS_COLLECTION, req.params.id);
        if (!campaign) return res.status(404).json({ message: "Campaign not found" });

        const normalizedTitle = String(title || "").trim();
        const normalizedTargetAudience = String(targetAudience || "").trim();
        const normalizedBudgetRange = String(budgetRange || "").trim();
        const normalizedCampaignType = String(campaignType || "").trim();
        const normalizedStartDate = String(startDate || "").trim();
        const normalizedEndDate = String(endDate || "").trim();
        const normalizedDescription = String(description || "").trim();
        const normalizedObjectives = String(objectives || campaignGoal || "").trim();

        if (
            !normalizedTitle
            || !normalizedTargetAudience
            || !normalizedBudgetRange
            || !normalizedCampaignType
            || !normalizedStartDate
            || !normalizedEndDate
            || !normalizedDescription
            || !normalizedObjectives
        ) {
            return res.status(400).json({ message: "All campaign fields are required" });
        }

        const startTime = new Date(normalizedStartDate).getTime();
        const endTime = new Date(normalizedEndDate).getTime();
        if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
            return res.status(400).json({ message: "Campaign timeline dates are invalid" });
        }
        if (endTime < startTime) {
            return res.status(400).json({ message: "End date cannot be earlier than start date" });
        }

        const updatedCampaign = await updateDocument(CAMPAIGNS_COLLECTION, req.params.id, {
            title: normalizedTitle,
            targetAudience: normalizedTargetAudience,
            budgetRange: normalizedBudgetRange,
            campaignType: normalizedCampaignType,
            startDate: normalizedStartDate,
            endDate: normalizedEndDate,
            description: normalizedDescription,
            objectives: normalizedObjectives,
            campaignGoal: normalizedObjectives,
            platforms: String(platforms || campaign.platforms || "").trim(),
            expectedKpi: String(expectedKpi || campaign.expectedKpi || "").trim(),
            editedBy: String(userId || ""),
            editedAt: nowIso()
        });

        res.json(updatedCampaign);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error updating campaign details" });
    }
});

app.delete("/api/campaigns/:id", async (req, res) => {
    try {
        if (!requireDb(res)) return;

        const { role, userId } = req.body || {};
        if (role !== "MarketingManager") {
            return res.status(403).json({ message: "Only the marketing manager can delete campaigns" });
        }

        const user = userId ? await findUserById(userId) : null;
        if (userId && user?.role !== "MarketingManager") {
            return res.status(403).json({ message: "Invalid marketing manager account" });
        }

        const campaign = await getDocumentById(CAMPAIGNS_COLLECTION, req.params.id);
        if (!campaign) return res.status(404).json({ message: "Campaign not found" });

        const deleted = await deleteDocument(CAMPAIGNS_COLLECTION, req.params.id);
        if (!deleted) return res.status(404).json({ message: "Campaign not found" });

        await Promise.all([
            deleteCampaignNotifications(req.params.id),
            deleteCampaignCreativeFiles(req.params.id)
        ]);

        res.json({
            message: "Campaign deleted successfully",
            campaignId: String(req.params.id)
        });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error deleting campaign" });
    }
});

app.patch("/api/campaigns/:id/success-metrics", async (req, res) => {
    try {
        if (!requireDb(res)) return;

        const { role, userId, targetReached, actualReached, objectiveAchieved } = req.body;
        if (role !== "MarketingManager") {
            return res.status(403).json({ message: "Only the marketing manager can update success data" });
        }

        const user = userId ? await findUserById(userId) : null;
        if (userId && user?.role !== "MarketingManager") {
            return res.status(403).json({ message: "Invalid marketing manager account" });
        }

        const campaign = await getDocumentById(CAMPAIGNS_COLLECTION, req.params.id);
        if (!campaign) return res.status(404).json({ message: "Campaign not found" });

        const normalizeMetricNumber = (value, label) => {
            if (value === null || value === undefined || value === "") return null;
            const numberValue = Number(value);
            if (!Number.isFinite(numberValue) || numberValue < 0) {
                throw new Error(`${label} must be a valid number`);
            }
            return Math.round(numberValue);
        };

        const normalizedObjective = String(objectiveAchieved || "").trim();
        if (normalizedObjective && !["Yes", "Partial", "No"].includes(normalizedObjective)) {
            return res.status(400).json({ message: "Objective Achieved must be Yes, Partial, or No" });
        }

        const successMetrics = {
            targetReached: normalizeMetricNumber(targetReached, "Target Reached"),
            actualReached: normalizeMetricNumber(actualReached, "Actual Reached"),
            objectiveAchieved: normalizedObjective,
            updatedBy: String(userId || ""),
            updatedAt: nowIso()
        };

        const updatedCampaign = await updateDocument(CAMPAIGNS_COLLECTION, req.params.id, {
            successMetrics
        });

        res.json(updatedCampaign);
    } catch (err) {
        console.log(err);
        res.status(400).json({ message: err.message || "Error updating success data" });
    }
});

app.patch("/api/campaigns/:id/brief-alignment-rating", async (req, res) => {
    try {
        if (!requireDb(res)) return;

        const { role, userId, rating } = req.body;
        if (role !== "BrandManager") {
            return res.status(403).json({ message: "Only the brand manager can update brief alignment rating" });
        }

        const user = userId ? await findUserById(userId) : null;
        if (userId && user?.role !== "BrandManager") {
            return res.status(403).json({ message: "Invalid brand manager account" });
        }

        const campaign = await getDocumentById(CAMPAIGNS_COLLECTION, req.params.id);
        if (!campaign) return res.status(404).json({ message: "Campaign not found" });

        const numericRating = Number(rating);
        if (!Number.isFinite(numericRating) || numericRating < 0 || numericRating > 100) {
            return res.status(400).json({ message: "Rating must be a number from 0 to 100" });
        }

        const updatedCampaign = await updateDocument(CAMPAIGNS_COLLECTION, req.params.id, {
            briefAlignmentRating: {
                rating: Math.round(numericRating),
                updatedBy: String(userId || ""),
                updatedAt: nowIso()
            }
        });

        res.json(updatedCampaign);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error updating brief alignment rating" });
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

app.patch("/api/campaigns/:id/reassign-agency", async (req, res) => {
    try {
        if (!requireDb(res)) return;

        const { role, userId, agencyId } = req.body;
        if (role !== "MarketingManager") {
            return res.status(403).json({ message: "Only the marketing manager can share campaigns with another agency" });
        }

        const user = userId ? await findUserById(userId) : null;
        if (userId && user?.role !== "MarketingManager") {
            return res.status(403).json({ message: "Invalid marketing manager account" });
        }

        const campaign = await getDocumentById(CAMPAIGNS_COLLECTION, req.params.id);
        if (!campaign) return res.status(404).json({ message: "Campaign not found" });

        if (normalizeCampaignStatus(campaign.status) !== "Declined") {
            return res.status(400).json({ message: "Only rejected campaigns can be shared with another agency" });
        }

        const newAgencyId = String(agencyId || "").trim();
        if (!newAgencyId) {
            return res.status(400).json({ message: "Please select an agency" });
        }
        if (newAgencyId === String(campaign.agencyId || "")) {
            return res.status(400).json({ message: "Select a different agency" });
        }

        const agency = await getDocumentById(AGENCIES_COLLECTION, newAgencyId);
        if (!agency) return res.status(404).json({ message: "Agency not found" });

        const previousAgencyId = String(campaign.agencyId || "");
        const previousHistory = Array.isArray(campaign.reassignmentHistory) ? campaign.reassignmentHistory : [];
        const updatedCampaign = await updateDocument(CAMPAIGNS_COLLECTION, req.params.id, {
            agencyId: newAgencyId,
            status: "Pending",
            rejectionReason: "",
            creativeAssets: [],
            reassignmentHistory: [
                ...previousHistory,
                {
                    fromAgencyId: previousAgencyId,
                    toAgencyId: newAgencyId,
                    reassignedBy: String(userId || ""),
                    reassignedAt: nowIso()
                }
            ]
        });

        await createDocument(NOTIFICATIONS_COLLECTION, {
            userId: String(agency._id || ""),
            fromUserId: String(userId || campaign.mmId || ""),
            type: "campaign_request",
            message: `Campaign "${campaign.title}" for ${campaign.productName || "a product"} has been shared with your agency.`,
            campaignId: String(campaign._id || ""),
            campaignTitle: campaign.title,
            productId: String(campaign.productId || ""),
            productName: campaign.productName || "",
            status: "Pending"
        });

        res.json(updatedCampaign);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Error sharing campaign with another agency" });
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

        const isVideoCampaign = String(campaign.campaignType || "").trim().toLowerCase() === "video";
        const hasInvalidFileType = files.some((file) => {
            const mimeType = String(file?.mimeType || "").toLowerCase();
            return isVideoCampaign ? !mimeType.startsWith("video/") : mimeType.startsWith("video/");
        });
        if (hasInvalidFileType) {
            return res.status(400).json({
                message: isVideoCampaign
                    ? "Video campaigns only accept video creative files."
                    : "Post campaigns only accept non-video creative files."
            });
        }

        const existingCreatives = Array.isArray(campaign.creativeAssets) ? campaign.creativeAssets.map(sanitizeCreativeAsset) : [];
        const migratedExistingCreatives = await Promise.all(existingCreatives.map(async (asset) => {
            if (!asset.dataBase64 || asset.fileUrl) return asset;
            const storedFile = await storeCreativeUploadFile(req.params.id, asset.id, asset);
            return {
                ...asset,
                dataBase64: "",
                ...storedFile
            };
        }));
        const hasApprovedCreative = migratedExistingCreatives.some((asset) => String(asset.reviewStatus || "").trim().toLowerCase() === "approved");
        if (hasApprovedCreative) {
            return res.status(400).json({ message: "Creative uploads are locked after approval." });
        }

        function getCreativeVersion() {
            if (!migratedExistingCreatives.length) return 1;
            const highest = migratedExistingCreatives.reduce((max, asset) => {
                const value = Number(asset.version || 1);
                return Number.isFinite(value) && value > max ? value : max;
            }, 1);
            return highest + 1;
        }
        const uploadedCreatives = await Promise.all(files.map(async (file) => {
            const creativeId = createId("creative");
            const storedFile = await storeCreativeUploadFile(req.params.id, creativeId, file);
            return sanitizeCreativeAsset({
                ...file,
                id: creativeId,
                dataBase64: "",
                ...storedFile,
                version: getCreativeVersion(),
                uploadedByAgencyId: agencyId,
                uploadedAt: nowIso(),
                reviewStatus: "Pending Review",
                reviewedAt: "",
                reviewedByUserId: "",
                comments: []
            });
        }));
        const nextCreatives = migratedExistingCreatives.concat(uploadedCreatives);

        const updatedCampaign = await updateDocument(CAMPAIGNS_COLLECTION, req.params.id, {
            creativeAssets: stripUndefined(nextCreatives)
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

        const { userId, role, agencyId = "", message, timestampSeconds = null } = req.body;
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
            message: normalizedMessage,
            timestampSeconds
        });

        creativeAssets[creativeIndex] = {
            ...creativeAssets[creativeIndex],
            comments: [...creativeAssets[creativeIndex].comments, nextComment]
        };

        const updatedCampaign = await updateDocument(CAMPAIGNS_COLLECTION, req.params.id, {
            creativeAssets: stripUndefined(creativeAssets)
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

        let approvedVariants = [];
        if (nextStatus === "Approved") {
            approvedVariants = buildApprovedCreativeVariants(campaign, creativeAssets[creativeIndex]);
            approvedVariants = await generateVideoCreativeVariants(
                req.params.id,
                campaign,
                creativeAssets[creativeIndex],
                approvedVariants
            );
        }

        creativeAssets[creativeIndex] = {
            ...creativeAssets[creativeIndex],
            reviewStatus: nextStatus,
            reviewedAt: nowIso(),
            reviewedByUserId: userId,
            variants: nextStatus === "Approved"
                ? approvedVariants
                : [],
            comments: reviewComment
                ? [...creativeAssets[creativeIndex].comments, reviewComment]
                : creativeAssets[creativeIndex].comments
        };

        const updatedCampaign = await updateDocument(CAMPAIGNS_COLLECTION, req.params.id, {
            creativeAssets: stripUndefined(creativeAssets)
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

const PORT = Number(process.env.PORT || 3000);

const server = app.listen(PORT);

server.once("listening", () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

server.once("error", (err) => {
    if (err.code === "EADDRINUSE") {
        console.error(`Port ${PORT} is already in use. Stop the other process or start this server with a different PORT.`);
        process.exitCode = 1;
        return;
    }

    console.error("Server failed to start:", err.message || err);
    process.exitCode = 1;
});


