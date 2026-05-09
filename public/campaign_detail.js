const params = new URLSearchParams(window.location.search);
const campaignId = params.get("campaignId");
const viewerAgencyId = params.get("agencyId");
const viewerProductId = params.get("productId");

const dashboardBackLink = document.getElementById("dashboardBackLink");
const viewerLabel = document.getElementById("viewerLabel");
const heroEyebrow = document.getElementById("heroEyebrow");
const titleEl = document.getElementById("campaignTitle");
const campaignBudgetEl = document.getElementById("campaignBudget");
const statusEl = document.getElementById("campaignStatus");
const statusDetailEl = document.getElementById("statusDetail");
const campaignTimelineEl = document.getElementById("campaignTimeline");
const campaignAudienceChipEl = document.getElementById("campaignAudienceChip");
const targetAudienceEl = document.getElementById("targetAudience");
const campaignTypeEl = document.getElementById("campaignType");
const descriptionEl = document.getElementById("description");
const objectivesEl = document.getElementById("objectives");
const attachmentList = document.getElementById("attachmentList");
const creativeRoleNote = document.getElementById("creativeRoleNote");
const creativeUploadForm = document.getElementById("creativeUploadForm");
const creativeUploadModalTitle = document.getElementById("creativeUploadModalTitle");
const creativeUploadInput = document.getElementById("creativeUploadInput");
const creativeUploadBtn = document.getElementById("creativeUploadBtn");
const creativeUploadHint = document.getElementById("creativeUploadHint");
const creativeUploadMessage = document.getElementById("creativeUploadMessage");
const creativeList = document.getElementById("creativeList");
const approvedVariantPanel = document.getElementById("approvedVariantPanel");
const openCreativeModalBtn = document.getElementById("openCreativeModalBtn");
const creativeUploadModal = document.getElementById("creativeUploadModal");
const closeCreativeModalBtn = document.getElementById("closeCreativeModalBtn");
const creativeDescriptionInput = document.getElementById("creativeDescriptionInput");
const rejectionReasonSection = document.getElementById("rejectionReasonSection");
const rejectionReasonText = document.getElementById("rejectionReasonText");
const decisionCard = document.getElementById("decisionCard");
const rejectionReasonInput = document.getElementById("rejectionReasonInput");
const decisionMessage = document.getElementById("decisionMessage");
const acceptCampaignBtn = document.getElementById("acceptCampaignBtn");
const declineCampaignBtn = document.getElementById("declineCampaignBtn");

const agencyId = localStorage.getItem("agencyId") || "";
const role = localStorage.getItem("role") || "";
const userId = localStorage.getItem("userId") || "";

let currentCampaign = null;
let activeVideoUrls = [];

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

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatBytes(bytes) {
    if (!bytes || Number.isNaN(bytes)) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeCampaignStatus(status) {
    const value = String(status || "").trim().toLowerCase();
    if (value === "accepted") return "Accepted";
    if (value === "decline" || value === "declined") return "Declined";
    return "Pending";
}

function normalizeCreativeStatus(status) {
    const value = String(status || "").trim().toLowerCase();
    if (value === "approved") return "Approved";
    if (value === "changes requested") return "Changes Requested";
    return "Pending Review";
}

function getLatestCreativeStatuses(creativeAssets) {
    const latestByKey = new Map();
    const list = Array.isArray(creativeAssets) ? creativeAssets : [];

    list.forEach((asset) => {
        const key = String(asset?.fileName || "creative-file").trim().toLowerCase();
        const existing = latestByKey.get(key);
        const nextVersion = Number(asset?.version || 1) || 1;
        const nextTime = toTimestamp(asset?.uploadedAt);

        if (!existing) {
            latestByKey.set(key, asset);
            return;
        }

        const existingVersion = Number(existing?.version || 1) || 1;
        const existingTime = toTimestamp(existing?.uploadedAt);
        if (nextVersion > existingVersion || (nextVersion === existingVersion && nextTime >= existingTime)) {
            latestByKey.set(key, asset);
        }
    });

    return Array.from(latestByKey.values()).map((asset) => normalizeCreativeStatus(asset?.reviewStatus));
}

function getDisplayStatus(campaign) {
    const campaignStatus = normalizeCampaignStatus(campaign?.status);
    if (campaignStatus === "Declined") return "Declined";
    if (campaignStatus !== "Accepted") return "Pending";

    const reviewedStatuses = getLatestCreativeStatuses(campaign?.creativeAssets);
    if (!reviewedStatuses.length) return "In Progress";
    if (reviewedStatuses.every((status) => status === "Approved")) return "Approved";
    if (reviewedStatuses.includes("Changes Requested")) return "Changes Requested";
    return "In Progress";
}

function statusClass(status) {
    const normalized = String(status || "").trim().toLowerCase();
    if (normalized === "declined") return "declined";
    if (normalized === "approved") return "approved";
    if (normalized === "changes requested") return "changes-requested";
    if (normalized === "in progress") return "in-progress";
    return "pending";
}

function creativeStatusClass(status) {
    const normalized = normalizeCreativeStatus(status);
    if (normalized === "Approved") return "approved";
    if (normalized === "Changes Requested") return "changes-requested";
    return "pending-review";
}

function creativeRowStatusClass(status) {
    const normalized = normalizeCreativeStatus(status);
    if (normalized === "Approved") return "creative-row-approved";
    if (normalized === "Changes Requested") return "creative-row-changes-requested";
    return "";
}

function formatDate(dateString) {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat("en", {
        year: "numeric",
        month: "short",
        day: "numeric"
    }).format(date);
}

function formatDateTime(dateString) {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat("en", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    }).format(date);
}

function formatDateRange(startDate, endDate) {
    const start = formatDate(startDate);
    const end = formatDate(endDate);
    if (start === "-" && end === "-") return "Timeline unavailable";
    if (start === "-") return `Until ${end}`;
    if (end === "-") return `From ${start}`;
    return `${start} to ${end}`;
}

function isVideoCampaign(campaign = currentCampaign) {
    return String(campaign?.campaignType || "").trim().toLowerCase() === "video";
}

function formatTimestamp(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hrs) {
        return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return `${mins}:${String(secs).padStart(2, "0")}`;
}

function parseTimestamp(value) {
    const text = String(value || "").trim();
    if (!text) return null;
    const parts = text.split(":").map((part) => Number(part));
    if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
    if (parts.length === 1) return Math.floor(parts[0]);
    if (parts.length === 2) return Math.floor((parts[0] * 60) + parts[1]);
    if (parts.length === 3) return Math.floor((parts[0] * 3600) + (parts[1] * 60) + parts[2]);
    return null;
}

function setBackLink() {
    if (role === "BrandManager") {
        dashboardBackLink.href = viewerAgencyId
            ? `create_brief.html?agencyId=${encodeURIComponent(viewerAgencyId)}`
            : "BM_dash.html";
        dashboardBackLink.textContent = viewerAgencyId ? "\u2190 Back to Agency Campaigns" : "\u2190 Back to Dashboard";
        viewerLabel.textContent = "";
        heroEyebrow.textContent = "Brand Campaign Workspace";
        return;
    }

    if (role === "MarketingManager") {
        dashboardBackLink.href = viewerProductId
            ? `create_brief.html?productId=${encodeURIComponent(viewerProductId)}`
            : viewerAgencyId
            ? `create_brief.html?agencyId=${encodeURIComponent(viewerAgencyId)}`
            : "MM_dash.html";
        dashboardBackLink.textContent = viewerProductId ? "\u2190 Back to Product Campaigns" : viewerAgencyId ? "\u2190 Back to Agency Campaigns" : "\u2190 Back to Dashboard";
        viewerLabel.textContent = "";
        heroEyebrow.textContent = "Marketing Campaign Workspace";
        return;
    }

    dashboardBackLink.href = "AA_DASH.html";
    dashboardBackLink.textContent = "\u2190 Back to Dashboard";
    viewerLabel.textContent = "";
    heroEyebrow.textContent = "Agency Campaign Workspace";
}

function setDecisionMessage(message, type = "") {
    decisionMessage.textContent = message;
    decisionMessage.className = `decision-message ${type}`.trim();
}

function setCreativeMessage(message, type = "") {
    creativeUploadMessage.textContent = message;
    creativeUploadMessage.className = `decision-message ${type}`.trim();
}

function toggleDecisionControls(disabled) {
    acceptCampaignBtn.disabled = disabled;
    declineCampaignBtn.disabled = disabled;
    rejectionReasonInput.disabled = disabled;
}

function toggleCreativeUploadControls(disabled) {
    if (creativeUploadBtn) creativeUploadBtn.disabled = disabled;
    if (creativeUploadInput) creativeUploadInput.disabled = disabled;
}

function downloadAttachment(file) {
    if (file.fileUrl) {
        const anchor = document.createElement("a");
        anchor.href = file.fileUrl;
        anchor.download = file.fileName || "attachment";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        return;
    }

    const blob = new Blob(
        [Uint8Array.from(atob(file.dataBase64 || ""), (char) => char.charCodeAt(0))],
        { type: file.mimeType || "application/octet-stream" }
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.fileName || "attachment";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function safeFilePart(value) {
    return String(value || "creative")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "creative";
}

function getVariantSourceUrl(variant, creative) {
    return variant?.sourceFileUrl || creative?.fileUrl || "";
}

function downloadVariantFile(variant, fallbackCreative) {
    if (variant?.fileUrl) {
        const channel = normalizeVariantChannel(variant.channel);
        downloadAttachment({
            fileUrl: variant.fileUrl,
            fileName: variant.fileName || `${safeFilePart(channel)}-${variant.width}x${variant.height}.mp4`,
            mimeType: fallbackCreative?.mimeType || "application/octet-stream"
        });
        return;
    }
    downloadAttachment(fallbackCreative);
}

function isImageCreative(creative) {
    return String(creative?.mimeType || "").toLowerCase().startsWith("image/");
}

function getApprovedCreative(creativeAssets) {
    return (Array.isArray(creativeAssets) ? creativeAssets : [])
        .find((asset) => normalizeCreativeStatus(asset?.reviewStatus) === "Approved") || null;
}

function buildFallbackVariants(creative) {
    const base = isVideoCampaign() ? VIDEO_CREATIVE_VARIANTS : POST_CREATIVE_VARIANTS;
    const variantType = isVideoCampaign() ? "video-spec" : "image";
    return base.map((variant, index) => ({
        ...variant,
        channel: normalizeVariantChannel(variant.channel),
        id: `${creative?.id || "approved"}-${index}`,
        status: "Ready",
        variantType,
        sourceCreativeId: creative?.id || "",
        sourceFileName: creative?.fileName || "",
        sourceFileUrl: creative?.fileUrl || "",
        sourceMimeType: creative?.mimeType || "",
        generatedAt: creative?.reviewedAt || creative?.uploadedAt || ""
    }));
}

function imageToCanvasBlob(imageUrl, variant, mimeType = "image/png") {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = Number(variant.width || 0);
            canvas.height = Number(variant.height || 0);
            const ctx = canvas.getContext("2d");
            if (!ctx || !canvas.width || !canvas.height) {
                reject(new Error("Variant size is unavailable."));
                return;
            }

            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
            const drawWidth = image.naturalWidth * scale;
            const drawHeight = image.naturalHeight * scale;
            const drawX = (canvas.width - drawWidth) / 2;
            const drawY = (canvas.height - drawHeight) / 2;
            ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);

            canvas.toBlob((blob) => {
                if (!blob) {
                    reject(new Error("Could not generate variant."));
                    return;
                }
                resolve(blob);
            }, mimeType);
        };
        image.onerror = () => reject(new Error("Could not load approved creative for variant generation."));
        image.src = imageUrl;
    });
}

async function downloadImageVariant(variant, creative, button) {
    const imageUrl = getVariantSourceUrl(variant, creative);
    if (!imageUrl) return;

    const previousText = button?.textContent || "Download";
    try {
        if (button) {
            button.disabled = true;
            button.textContent = "Preparing...";
        }
        const blob = await imageToCanvasBlob(imageUrl, variant);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${safeFilePart(creative?.fileName)}-${safeFilePart(normalizeVariantChannel(variant.channel))}-${variant.width}x${variant.height}.png`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    } catch (err) {
        alert(err.message || "Could not download this variant.");
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = previousText;
        }
    }
}

function createFileObjectUrl(file) {
    if (file.fileUrl) {
        return file.fileUrl;
    }

    const blob = new Blob(
        [Uint8Array.from(atob(file.dataBase64 || ""), (char) => char.charCodeAt(0))],
        { type: file.mimeType || "application/octet-stream" }
    );
    const url = URL.createObjectURL(blob);
    activeVideoUrls.push(url);
    return url;
}

function revokeActiveVideoUrls() {
    activeVideoUrls.forEach((url) => URL.revokeObjectURL(url));
    activeVideoUrls = [];
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || "");
            const base64 = result.includes(",") ? result.split(",")[1] : "";
            resolve(base64);
        };
        reader.onerror = () => reject(new Error(`Failed to read ${file.name || "file"}`));
        reader.readAsDataURL(file);
    });
}

async function prepareCreativeFiles() {
    const file = creativeUploadInput?.files?.[0];
    if (!file) {
        throw new Error("Choose one creative file to upload.");
    }

    const description = String(creativeDescriptionInput?.value || "").trim();
    if (!description) {
        throw new Error("Description is required.");
    }

    const maxBytes = 20 * 1024 * 1024;
    if (file.size > maxBytes) {
        throw new Error("Creative upload size must be 20MB or less.");
    }

    const uploadingVideo = isVideoCampaign();
    if (uploadingVideo && !String(file.type || "").toLowerCase().startsWith("video/")) {
        throw new Error("Choose a video file for this video campaign.");
    }
    if (!uploadingVideo && String(file.type || "").toLowerCase().startsWith("video/")) {
        throw new Error("Choose a non-video file for this post campaign.");
    }

    const version = getNextCreativeVersion(currentCampaign?.creativeAssets || []);
    return [{
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        dataBase64: await fileToBase64(file),
        description,
        component: "",
        version
    }];
}

function renderAttachments(attachments) {
    attachmentList.innerHTML = "";

    if (!attachments?.length) {
        attachmentList.innerHTML = `<p class="empty-text">No files were uploaded for this campaign.</p>`;
        return;
    }

    attachments.forEach((file) => {
        const item = document.createElement("div");
        item.className = "attachment-item";
        item.innerHTML = `
            <div class="attachment-meta">
                <p class="attachment-name">${escapeHtml(file.fileName || "Attachment")}</p>
                <p class="attachment-size">${formatBytes(file.size)}</p>
            </div>
            <button type="button" class="download-btn">Download</button>
        `;

        item.querySelector(".download-btn").addEventListener("click", () => downloadAttachment(file));
        attachmentList.appendChild(item);
    });
}

function renderCreativeRoleCopy() {
    if (role === "BrandManager") {
        creativeRoleNote.textContent = "";
        creativeRoleNote.hidden = true;
        return;
    }

    if (role === "MarketingManager") {
        creativeRoleNote.textContent = "";
        creativeRoleNote.hidden = true;
        return;
    }

    creativeRoleNote.textContent = "";
    creativeRoleNote.hidden = true;
}

function buildCommentHtml(comment) {
    const authorLabel = comment.authorRole === "BrandManager"
        ? "Brand Manager"
        : comment.authorRole === "MarketingManager"
            ? "Marketing Manager"
        : comment.authorRole === "Agency"
            ? "Agency"
            : comment.authorRole || "Comment";
    return `
        <div class="comment-item">
            <div class="comment-header">
                <strong>${escapeHtml(authorLabel)}</strong>
                <span>${escapeHtml(formatDateTime(comment.createdAt))}</span>
            </div>
            ${comment.timestampSeconds !== null && comment.timestampSeconds !== undefined ? `
                <button type="button" class="timestamp-chip" data-timestamp="${escapeHtml(comment.timestampSeconds)}">${escapeHtml(formatTimestamp(comment.timestampSeconds))}</button>
            ` : ""}
            <p>${escapeHtml(comment.message)}</p>
        </div>
    `;
}

function getCreativeGroupKey(fileName) {
    return String(fileName || "creative-file").trim().toLowerCase();
}

function toTimestamp(value) {
    const time = new Date(value || "").getTime();
    return Number.isNaN(time) ? 0 : time;
}

function groupCreativeAssets(creativeAssets) {
    const groups = new Map();

    creativeAssets.forEach((asset) => {
        const key = getCreativeGroupKey(asset?.fileName);
        if (!groups.has(key)) {
            groups.set(key, {
                key,
                title: String(asset?.fileName || "Creative file"),
                component: String(asset?.component || "").trim(),
                versions: []
            });
        }
        groups.get(key).versions.push(asset);
    });

    const groupedList = Array.from(groups.values()).map((group) => {
        const ordered = group.versions
            .slice()
            .sort((a, b) => toTimestamp(a.uploadedAt) - toTimestamp(b.uploadedAt))
            .map((asset, index) => ({
                ...asset,
                versionNumber: index + 1
            }));

        return {
            ...group,
            versions: ordered,
            latest: ordered[ordered.length - 1]
        };
    });

    return groupedList.sort((a, b) => toTimestamp(b.latest?.uploadedAt) - toTimestamp(a.latest?.uploadedAt));
}

function getNextCreativeVersion(creativeAssets) {
    const list = Array.isArray(creativeAssets) ? creativeAssets : [];
    if (!list.length) return 1;
    const highest = list.reduce((max, asset) => {
        const value = Number(asset?.version || 1);
        return Number.isFinite(value) && value > max ? value : max;
    }, 1);
    return highest + 1;
}

function openCreativeModal() {
    if (!creativeUploadModal) return;
    const videoCampaign = isVideoCampaign();
    if (creativeUploadModalTitle) {
        creativeUploadModalTitle.textContent = videoCampaign ? "Upload Video Creative" : "Add New Creative";
    }
    if (creativeUploadInput) {
        creativeUploadInput.accept = videoCampaign ? "video/*" : "image/*,.pdf,.doc,.docx,.ppt,.pptx";
    }
    creativeUploadModal.hidden = false;
}

function closeCreativeModal() {
    if (!creativeUploadModal) return;
    creativeUploadModal.hidden = true;
    creativeUploadForm?.reset();
}

function renderVideoCreatives(creativeAssets, options) {
    revokeActiveVideoUrls();
    const list = Array.isArray(creativeAssets) ? creativeAssets : [];
    const sortedVideos = list
        .slice()
        .sort((a, b) => {
            const aVersion = Number(a?.version || 0);
            const bVersion = Number(b?.version || 0);
            if (aVersion !== bVersion) return bVersion - aVersion;
            return toTimestamp(b?.uploadedAt) - toTimestamp(a?.uploadedAt);
        });

    if (!sortedVideos.length) {
        creativeList.innerHTML = `<p class="empty-text">No video creative has been uploaded yet.</p>`;
        return;
    }

    const latestVideo = sortedVideos[0];
    const normalizedReviewStatus = normalizeCreativeStatus(latestVideo.reviewStatus);
    const comments = Array.isArray(latestVideo.comments) ? latestVideo.comments : [];
    const canComment = options.canManagerComment || options.canAgencyReply;
    const videoUrl = createFileObjectUrl(latestVideo);
    const feedbackHtml = comments.length
        ? `<div class="feedback-thread">${comments.map(buildCommentHtml).join("")}</div>`
        : `<p class="empty-text">No video feedback yet.</p>`;
    const historyHtml = sortedVideos.length > 1
        ? sortedVideos.slice(1).map((asset) => {
            const status = normalizeCreativeStatus(asset.reviewStatus);
            return `
                <div class="video-history-item" data-history-video-id="${escapeHtml(asset.id)}">
                    <div>
                        <strong>V${escapeHtml(asset.version || 1)}</strong>
                        <span>${escapeHtml(asset.fileName || "Video creative")}</span>
                        <small>${escapeHtml(formatDateTime(asset.uploadedAt))} | ${escapeHtml(status)}</small>
                    </div>
                    <div class="video-history-actions">
                        <button type="button" class="secondary-btn video-history-play-btn">Play</button>
                        <button type="button" class="secondary-btn video-history-download-btn">Download</button>
                    </div>
                </div>
            `;
        }).join("")
        : `<p class="empty-text">No older video versions yet.</p>`;

    creativeList.innerHTML = `
        <div class="video-review-panel" data-creative-id="${escapeHtml(latestVideo.id)}">
            <div class="video-player-wrap">
                <video class="creative-video-player" controls src="${escapeHtml(videoUrl)}"></video>
            </div>
            <div class="video-review-side">
                <div class="video-review-head">
                    <div>
                        <p class="section-label">Latest Video</p>
                        <h3>${escapeHtml(latestVideo.fileName || "Video creative")}</h3>
                        <p class="attachment-size">${escapeHtml(formatBytes(latestVideo.size))} | Uploaded ${escapeHtml(formatDateTime(latestVideo.uploadedAt))}</p>
                    </div>
                    <span class="creative-status ${escapeHtml(creativeStatusClass(normalizedReviewStatus))}">${escapeHtml(normalizedReviewStatus)}</span>
                </div>
                <p>${escapeHtml(latestVideo.description || "-")}</p>
                <div class="video-action-row">
                    <button type="button" class="secondary-btn video-latest-play-btn">Play</button>
                    <button type="button" class="secondary-btn creative-download-btn">Download Video</button>
                    ${options.isBrandManager && normalizedReviewStatus === "Pending Review" ? `
                        <button type="button" class="secondary-btn creative-review-btn" data-decision="Changes Requested">Request Changes</button>
                        <button type="button" class="primary-btn creative-review-btn" data-decision="Approved">Approve</button>
                    ` : ""}
                </div>
                ${options.isBrandManager && normalizedReviewStatus === "Pending Review" ? `
                    <p class="creative-inline-message review-message" aria-live="polite"></p>
                ` : ""}
            </div>
            <div class="video-history-panel">
                <div class="comment-thread-header">
                    <h3>Version History</h3>
                </div>
                <div class="video-history-list">
                    ${historyHtml}
                </div>
            </div>
            <div class="video-feedback-panel">
                <div class="comment-thread-header">
                    <h3>Video Feedback</h3>
                </div>
                <div class="video-feedback-thread">
                    ${feedbackHtml}
                </div>
                ${canComment ? `
                    <form class="comment-form video-comment-form">
                        <div class="timestamp-control">
                            <label for="videoTimestampInput">Timestamp</label>
                            <div>
                                <input id="videoTimestampInput" class="timestamp-input" type="text" placeholder="0:15 or leave blank">
                                <button type="button" class="secondary-btn use-current-time-btn">Use Current Time</button>
                            </div>
                        </div>
                        <textarea class="comment-input" rows="3" placeholder="${options.canManagerComment ? "Leave feedback for the agency" : "Reply to feedback"}"></textarea>
                        <div class="comment-form-actions">
                            <button type="submit" class="primary-btn comment-submit-btn">${options.canManagerComment ? "Post Comment" : "Reply"}</button>
                        </div>
                        <p class="creative-inline-message comment-message" aria-live="polite"></p>
                    </form>
                ` : ""}
            </div>
        </div>
    `;

    const panel = creativeList.querySelector(".video-review-panel");
    const videoEl = panel?.querySelector(".creative-video-player");
    panel?.querySelector(".video-latest-play-btn")?.addEventListener("click", () => {
        if (!videoEl) return;
        videoEl.src = createFileObjectUrl(latestVideo);
        videoEl.load();
        videoEl.play().catch(() => {});
    });
    panel?.querySelector(".creative-download-btn")?.addEventListener("click", () => downloadAttachment(latestVideo));
    panel?.querySelectorAll(".video-history-item").forEach((item) => {
        const historyVideoId = item.getAttribute("data-history-video-id") || "";
        const historyVideo = sortedVideos.find((entry) => entry.id === historyVideoId);
        if (!historyVideo) return;

        item.querySelector(".video-history-play-btn")?.addEventListener("click", () => {
            if (!videoEl) return;
            videoEl.src = createFileObjectUrl(historyVideo);
            videoEl.load();
            videoEl.play().catch(() => {});
        });

        item.querySelector(".video-history-download-btn")?.addEventListener("click", () => downloadAttachment(historyVideo));
    });
    panel?.querySelectorAll(".timestamp-chip").forEach((button) => {
        button.addEventListener("click", () => {
            if (!videoEl) return;
            videoEl.currentTime = Number(button.dataset.timestamp || 0);
            videoEl.play().catch(() => {});
        });
    });
    panel?.querySelector(".use-current-time-btn")?.addEventListener("click", () => {
        const input = panel.querySelector(".timestamp-input");
        if (input && videoEl) input.value = formatTimestamp(videoEl.currentTime);
    });
    if (options.isBrandManager) {
        const reviewMessage = panel?.querySelector(".review-message");
        panel?.querySelectorAll(".creative-review-btn").forEach((button) => {
            button.addEventListener("click", async () => {
                await submitCreativeReview(latestVideo.id, button.dataset.decision, "", reviewMessage, panel);
            });
        });
    }
    const commentForm = panel?.querySelector(".comment-form");
    if (commentForm) {
        commentForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const commentInput = commentForm.querySelector(".comment-input");
            const timestampInput = commentForm.querySelector(".timestamp-input");
            const commentMessage = commentForm.querySelector(".comment-message");
            await submitCreativeComment(
                latestVideo.id,
                commentInput?.value || "",
                commentMessage,
                commentInput,
                parseTimestamp(timestampInput?.value)
            );
            if (timestampInput) timestampInput.value = "";
        });
    }
}

function renderApprovedVariants(creativeAssets) {
    if (!approvedVariantPanel) return;
    const approvedCreative = getApprovedCreative(creativeAssets);
    if (!approvedCreative) {
        approvedVariantPanel.innerHTML = "";
        return;
    }

    const isVideo = isVideoCampaign();
    const isImage = isImageCreative(approvedCreative);
    const supportsChannelVariants = isVideo || isImage;
    const variants = supportsChannelVariants && Array.isArray(approvedCreative.variants) && approvedCreative.variants.length
        ? approvedCreative.variants.map((variant) => ({
            ...variant,
            channel: normalizeVariantChannel(variant.channel)
        }))
        : supportsChannelVariants
            ? buildFallbackVariants(approvedCreative)
            : [];
    const sourceUrl = approvedCreative.fileUrl || "";
    const canGenerateImages = !isVideo && isImage && sourceUrl;

    approvedVariantPanel.innerHTML = `
        <section class="approved-variants-card">
            <div class="section-heading variant-heading">
                <div>
                    <p class="section-label">Media Handoff</p>
                    <h2>${supportsChannelVariants ? "Approved Creative Variants" : "Approved Creative"}</h2>
                </div>
                <div class="variant-summary-wrap">
                    <p class="variant-summary">${escapeHtml(approvedCreative.fileName || "Approved creative")}${supportsChannelVariants ? ` | ${escapeHtml(variants.length)} channel format(s)` : ""}</p>
                    ${!canGenerateImages ? `<button type="button" class="primary-btn variant-source-download-btn">Download Approved Source</button>` : ""}
                </div>
            </div>
            ${supportsChannelVariants ? `
                <div class="variant-grid">
                    ${variants.map((variant) => {
                        const ratioStyle = `aspect-ratio:${Number(variant.width || 1)} / ${Number(variant.height || 1)}`;
                        return `
                            <article class="variant-card" data-variant-id="${escapeHtml(variant.id)}">
                                <div class="variant-preview" style="${escapeHtml(ratioStyle)}">
                                    ${isVideo ? `
                                        <div class="variant-video-spec">
                                            <span>${escapeHtml(variant.aspectRatio || "-")}</span>
                                            <small>${escapeHtml(variant.format || "MP4/MOV")}</small>
                                        </div>
                                    ` : canGenerateImages ? `
                                        <img src="${escapeHtml(sourceUrl)}" alt="${escapeHtml(variant.channel)} preview">
                                    ` : ""}
                                </div>
                                <div class="variant-body">
                                    <div>
                                        <h3>${escapeHtml(variant.channel)}</h3>
                                        <p>${escapeHtml(variant.width)} x ${escapeHtml(variant.height)} | ${escapeHtml(variant.aspectRatio)}</p>
                                    </div>
                                    <span class="variant-status">${escapeHtml(variant.status || "Ready")}</span>
                                </div>
                                ${canGenerateImages
                                    ? `<button type="button" class="primary-btn variant-download-btn">Download PNG</button>`
                                    : `<button type="button" class="primary-btn variant-download-btn">${variant.fileUrl ? "Download MP4" : "Download Source Video"}</button>`}
                            </article>
                        `;
                    }).join("")}
                </div>
            ` : ""}
        </section>
    `;

    approvedVariantPanel.querySelector(".variant-source-download-btn")?.addEventListener("click", () => {
        downloadAttachment(approvedCreative);
    });

    approvedVariantPanel.querySelectorAll(".variant-card").forEach((card) => {
        const variantId = card.getAttribute("data-variant-id") || "";
        const variant = variants.find((item) => String(item.id) === variantId);
        const button = card.querySelector(".variant-download-btn");
        if (!variant || !button) return;

        button.addEventListener("click", () => {
            if (canGenerateImages) {
                downloadImageVariant(variant, approvedCreative, button);
                return;
            }
            downloadVariantFile(variant, approvedCreative);
        });
    });
}

function renderCreatives(creativeAssets) {
    creativeList.innerHTML = "";
    renderApprovedVariants(creativeAssets);

    const campaignAccepted = normalizeCampaignStatus(currentCampaign?.status) === "Accepted";
    const isAgencyViewer = role === "Agency" && agencyId && currentCampaign?.agencyId === agencyId;
    const hasApprovedCreative = (Array.isArray(creativeAssets) ? creativeAssets : [])
        .some((asset) => normalizeCreativeStatus(asset?.reviewStatus) === "Approved");
    const canAgencyUpload = isAgencyViewer && campaignAccepted && !hasApprovedCreative;

    if (openCreativeModalBtn) {
        openCreativeModalBtn.hidden = !isAgencyViewer;
        openCreativeModalBtn.disabled = !canAgencyUpload;
        openCreativeModalBtn.title = hasApprovedCreative
            ? "Uploads are locked after creative approval."
            : "";
    }
    if (!canAgencyUpload) {
        closeCreativeModal();
        setCreativeMessage("");
    }
    renderCreativeRoleCopy();

    if (isAgencyViewer && creativeUploadHint) {
        if (!campaignAccepted) {
            creativeUploadHint.textContent = "Accept the campaign brief first, then upload your creative files here.";
        } else if (hasApprovedCreative) {
            creativeUploadHint.textContent = "Uploads are locked because a creative version is already approved.";
        } else if (isVideoCampaign()) {
            creativeUploadHint.textContent = "Use Add New Creative to upload a video file for review.";
        } else {
            creativeUploadHint.textContent = "Use Add New Creative to upload the next version with description.";
        }
    }

    const isBrandManager = role === "BrandManager";
    const isMarketingManager = role === "MarketingManager";
    const canManagerComment = isBrandManager || isMarketingManager;
    const canAgencyReply = isAgencyViewer && campaignAccepted;

    if (isVideoCampaign()) {
        renderVideoCreatives(creativeAssets, {
            isBrandManager,
            canManagerComment,
            canAgencyReply
        });
        return;
    }

    if (!creativeAssets?.length) {
        creativeList.innerHTML = `<p class="empty-text">No creative has been uploaded yet.</p>`;
        return;
    }

    const sortedCreatives = creativeAssets
        .slice()
        .sort((a, b) => {
            const aVersion = Number(a?.version || 0);
            const bVersion = Number(b?.version || 0);
            if (aVersion !== bVersion) return bVersion - aVersion;
            return toTimestamp(b?.uploadedAt) - toTimestamp(a?.uploadedAt);
        });

    const rows = sortedCreatives.map((asset) => {
        const normalizedReviewStatus = normalizeCreativeStatus(asset.reviewStatus);
        const comments = Array.isArray(asset.comments) ? asset.comments : [];
        const feedbackHtml = comments.length
            ? `<div class="feedback-thread">${comments.map(buildCommentHtml).join("")}</div>`
            : `<p class="empty-text">No feedback yet.</p>`;

        return `
            <tr data-creative-id="${escapeHtml(asset.id)}" class="${escapeHtml(creativeRowStatusClass(normalizedReviewStatus))}">
                <td>V${escapeHtml(asset.version || 1)}</td>
                <td>${escapeHtml(formatDateTime(asset.uploadedAt))}</td>
                <td>${escapeHtml(asset.description || "-")}</td>
                <td>
                    <div class="table-component-actions">
                        <button type="button" class="download-icon-btn creative-download-btn" aria-label="Download creative file" title="Download">
                            <img src="/Images/downloadicon.jpg" alt="" class="download-icon-img" aria-hidden="true">
                        </button>
                    </div>
                </td>
                <td>
                    <span class="creative-status ${escapeHtml(creativeStatusClass(normalizedReviewStatus))}">${escapeHtml(normalizedReviewStatus)}</span>
                    ${isBrandManager && normalizedReviewStatus === "Pending Review" ? `
                        <div class="table-review-actions">
                            <button type="button" class="secondary-btn creative-review-btn" data-decision="Changes Requested">Request Changes</button>
                            <button type="button" class="primary-btn creative-review-btn" data-decision="Approved">Approve</button>
                        </div>
                        <p class="creative-inline-message" aria-live="polite"></p>
                    ` : ""}
                </td>
                <td>
                    ${feedbackHtml}
                    ${(canManagerComment || canAgencyReply) ? `
                        <form class="comment-form table-comment-form">
                            <textarea class="comment-input" rows="2" placeholder="${canManagerComment ? "Leave feedback or comments for the agency" : "Reply to feedback"}"></textarea>
                            <div class="comment-form-actions">
                                <button type="submit" class="primary-btn comment-submit-btn">${canManagerComment ? "Post Comment" : "Reply"}</button>
                            </div>
                            <p class="creative-inline-message comment-message" aria-live="polite"></p>
                        </form>
                    ` : ""}
                </td>
            </tr>
        `;
    }).join("");

    creativeList.innerHTML = `
        <div class="creative-table-wrap">
            <table class="creative-table">
                <thead>
                    <tr>
                        <th>Version</th>
                        <th>Uploaded On</th>
                        <th>Description</th>
                        <th>Component</th>
                        <th>Status</th>
                        <th>Feedback</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;

    creativeList.querySelectorAll("tbody tr").forEach((rowEl) => {
        const creativeId = rowEl.getAttribute("data-creative-id") || "";
        const asset = sortedCreatives.find((entry) => entry.id === creativeId);
        if (!asset) return;

        rowEl.querySelector(".creative-download-btn")?.addEventListener("click", () => downloadAttachment(asset));

        if (isBrandManager) {
            const reviewMessage = rowEl.querySelector(".creative-inline-message");
            rowEl.querySelectorAll(".creative-review-btn").forEach((button) => {
                button.addEventListener("click", async () => {
                    await submitCreativeReview(asset.id, button.dataset.decision, "", reviewMessage, rowEl);
                });
            });
        }

        const commentForm = rowEl.querySelector(".comment-form");
        if (commentForm) {
            commentForm.addEventListener("submit", async (event) => {
                event.preventDefault();
                const commentInput = commentForm.querySelector(".comment-input");
                const commentMessage = commentForm.querySelector(".comment-message");
                await submitCreativeComment(asset.id, commentInput?.value || "", commentMessage, commentInput);
            });
        }

    });
}
function applyCampaignDetails(campaign) {
    const campaignDecisionStatus = normalizeCampaignStatus(campaign.status);
    const displayStatus = getDisplayStatus(campaign);
    const timeline = formatDateRange(campaign.startDate, campaign.endDate);
    const reason = String(campaign.rejectionReason || "").trim();
    const attachments = Array.isArray(campaign.attachments) ? campaign.attachments : [];
    const creativeAssets = Array.isArray(campaign.creativeAssets) ? campaign.creativeAssets : [];

    document.title = `KOALA by Nestle | ${campaign.title || "Campaign Detail"}`;

    titleEl.textContent = campaign.title || "Campaign Detail";
    campaignBudgetEl.textContent = campaign.budgetRange
        ? `Product: ${campaign.productName || "-"} | Budget: ${campaign.budgetRange}`
        : `Product: ${campaign.productName || "-"} | Budget: -`;

    statusEl.textContent = displayStatus;
    statusEl.className = `status-pill ${statusClass(displayStatus)}`;
    statusDetailEl.textContent = displayStatus;

    targetAudienceEl.textContent = campaign.targetAudience || "-";
    campaignTypeEl.textContent = campaign.campaignType || "-";
    campaignTimelineEl.textContent = timeline;
    campaignAudienceChipEl.textContent = campaign.targetAudience
        ? `Audience: ${campaign.targetAudience}`
        : "Audience pending";
    descriptionEl.textContent = campaign.description || "-";
    objectivesEl.textContent = campaign.campaignGoal || campaign.objectives || "-";

    rejectionReasonSection.hidden = !reason;
    rejectionReasonText.textContent = reason || "-";

    const isAgencyViewer = role === "Agency" && agencyId && campaign.agencyId === agencyId;
    decisionCard.hidden = !(isAgencyViewer && campaignDecisionStatus === "Pending");
    if (decisionCard.hidden) {
        setDecisionMessage("");
    } else {
        rejectionReasonInput.value = "";
        setDecisionMessage("");
    }

    renderAttachments(attachments);
    renderCreatives(creativeAssets);
}

async function loadCampaignDetails() {
    if (!campaignId) {
        titleEl.textContent = "Campaign not found";
        return;
    }

    try {
        const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`);
        const campaign = await res.json();

        if (!res.ok) {
            throw new Error(campaign.message || "Failed to load campaign");
        }

        currentCampaign = campaign;
        applyCampaignDetails(campaign);
    } catch (err) {
        titleEl.textContent = "Campaign not found";
        descriptionEl.textContent = err.message || "Could not load campaign details.";
    }
}

async function submitDecision(status) {
    if (!currentCampaign || !agencyId) return;

    const rejectionReason = String(rejectionReasonInput.value || "").trim();
    if (status === "Decline" && !rejectionReason) {
        setDecisionMessage("Please add a reason before declining this campaign.", "error");
        return;
    }

    try {
        toggleDecisionControls(true);
        setDecisionMessage("Saving your decision...");

        const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                status,
                agencyId,
                rejectionReason
            })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.message || "Failed to update campaign");
        }

        setDecisionMessage(
            status === "Accepted" ? "Campaign accepted successfully." : "Campaign declined successfully.",
            "success"
        );
        await loadCampaignDetails();
    } catch (err) {
        setDecisionMessage(err.message || "Error updating campaign.", "error");
    } finally {
        toggleDecisionControls(false);
    }
}

async function submitCreativeUpload(event) {
    event.preventDefault();

    if (!currentCampaign || role !== "Agency" || !agencyId || !userId) {
        setCreativeMessage("Only the agency can upload creative files.", "error");
        return;
    }

    const hasApprovedCreative = (Array.isArray(currentCampaign?.creativeAssets) ? currentCampaign.creativeAssets : [])
        .some((asset) => normalizeCreativeStatus(asset?.reviewStatus) === "Approved");
    if (hasApprovedCreative) {
        setCreativeMessage("Upload is locked because a creative version has already been approved.", "error");
        closeCreativeModal();
        return;
    }

    try {
        toggleCreativeUploadControls(true);
        setCreativeMessage("Uploading creative files...");
        const files = await prepareCreativeFiles();

        const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/creatives`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userId,
                agencyId,
                files
            })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.message || "Failed to upload creative files");
        }

        setCreativeMessage("Creative uploaded successfully.", "success");
        closeCreativeModal();
        await loadCampaignDetails();
    } catch (err) {
        setCreativeMessage(err.message || "Error uploading creative files.", "error");
    } finally {
        toggleCreativeUploadControls(false);
        renderCreatives(currentCampaign?.creativeAssets || []);
    }
}

async function submitCreativeComment(creativeId, message, messageEl, inputEl, timestampSeconds = null) {
    if (!currentCampaign || !creativeId || !userId) return;

    const normalizedMessage = String(message || "").trim();
    if (!normalizedMessage) {
        if (messageEl) {
            messageEl.textContent = "Please write a comment before submitting.";
            messageEl.className = "creative-inline-message error";
        }
        return;
    }

    try {
        if (messageEl) {
            messageEl.textContent = "Posting comment...";
            messageEl.className = "creative-inline-message";
        }

        const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/creatives/${encodeURIComponent(creativeId)}/comments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userId,
                role,
                agencyId,
                message: normalizedMessage,
                timestampSeconds
            })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.message || "Failed to add comment");
        }

        if (messageEl) {
            messageEl.textContent = "Comment posted.";
            messageEl.className = "creative-inline-message success";
        }
        if (inputEl) {
            inputEl.value = "";
        }

        await loadCampaignDetails();
    } catch (err) {
        if (messageEl) {
            messageEl.textContent = err.message || "Error adding comment.";
            messageEl.className = "creative-inline-message error";
        }
    }
}

async function submitCreativeReview(creativeId, decision, comment, messageEl, cardEl) {
    if (!currentCampaign || role !== "BrandManager" || !userId) return;

    const buttons = Array.from(cardEl?.querySelectorAll("button") || []);
    buttons.forEach((button) => {
        button.disabled = true;
    });

    try {
        if (messageEl) {
            messageEl.textContent = `${decision} in progress...`;
            messageEl.className = "creative-inline-message";
        }

        const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/creatives/${encodeURIComponent(creativeId)}/review`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userId,
                role,
                decision,
                comment
            })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.message || "Failed to review creative");
        }

        if (messageEl) {
            messageEl.textContent = decision === "Approved"
                ? "Creative approved."
                : "Changes requested successfully.";
            messageEl.className = "creative-inline-message success";
        }

        await loadCampaignDetails();
    } catch (err) {
        if (messageEl) {
            messageEl.textContent = err.message || "Error reviewing creative.";
            messageEl.className = "creative-inline-message error";
        }
    } finally {
        buttons.forEach((button) => {
            button.disabled = false;
        });
    }
}

acceptCampaignBtn?.addEventListener("click", () => {
    submitDecision("Accepted");
});

declineCampaignBtn?.addEventListener("click", () => {
    submitDecision("Decline");
});

openCreativeModalBtn?.addEventListener("click", openCreativeModal);
closeCreativeModalBtn?.addEventListener("click", closeCreativeModal);
creativeUploadModal?.addEventListener("click", (event) => {
    if (event.target === creativeUploadModal) {
        closeCreativeModal();
    }
});

creativeUploadForm?.addEventListener("submit", submitCreativeUpload);

setBackLink();
loadCampaignDetails();


