const params = new URLSearchParams(window.location.search);
const campaignId = params.get("campaignId");
const viewerAgencyId = params.get("agencyId");

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
const startDateEl = document.getElementById("startDate");
const endDateEl = document.getElementById("endDate");
const descriptionEl = document.getElementById("description");
const objectivesEl = document.getElementById("objectives");
const attachmentList = document.getElementById("attachmentList");
const creativeRoleNote = document.getElementById("creativeRoleNote");
const creativeUploadForm = document.getElementById("creativeUploadForm");
const creativeUploadInput = document.getElementById("creativeUploadInput");
const creativeUploadBtn = document.getElementById("creativeUploadBtn");
const creativeUploadHint = document.getElementById("creativeUploadHint");
const creativeUploadMessage = document.getElementById("creativeUploadMessage");
const creativeList = document.getElementById("creativeList");
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
        dashboardBackLink.href = viewerAgencyId
            ? `create_brief.html?agencyId=${encodeURIComponent(viewerAgencyId)}`
            : "MM_dash.html";
        dashboardBackLink.textContent = viewerAgencyId ? "\u2190 Back to Agency Campaigns" : "\u2190 Back to Dashboard";
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
    creativeUploadModal.hidden = false;
}

function closeCreativeModal() {
    if (!creativeUploadModal) return;
    creativeUploadModal.hidden = true;
    creativeUploadForm?.reset();
}

function renderCreatives(creativeAssets) {
    creativeList.innerHTML = "";

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
        } else {
            creativeUploadHint.textContent = "Use Add New Creative to upload the next version with description.";
        }
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

    const isBrandManager = role === "BrandManager";
    const isMarketingManager = role === "MarketingManager";
    const canManagerComment = isBrandManager || isMarketingManager;
    const canAgencyReply = isAgencyViewer && campaignAccepted;

    const rows = sortedCreatives.map((asset) => {
        const normalizedReviewStatus = normalizeCreativeStatus(asset.reviewStatus);
        const comments = Array.isArray(asset.comments) ? asset.comments : [];
        const feedbackHtml = comments.length
            ? `<div class="feedback-thread">${comments.map(buildCommentHtml).join("")}</div>`
            : `<p class="empty-text">No feedback yet.</p>`;

        return `
            <tr data-creative-id="${escapeHtml(asset.id)}">
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
    campaignBudgetEl.textContent = campaign.budgetRange ? `Budget: ${campaign.budgetRange}` : "Budget: -";

    statusEl.textContent = displayStatus;
    statusEl.className = `status-pill ${statusClass(displayStatus)}`;
    statusDetailEl.textContent = displayStatus;

    targetAudienceEl.textContent = campaign.targetAudience || "-";
    startDateEl.textContent = formatDate(campaign.startDate);
    endDateEl.textContent = formatDate(campaign.endDate);
    campaignTimelineEl.textContent = timeline;
    campaignAudienceChipEl.textContent = campaign.targetAudience
        ? `Audience: ${campaign.targetAudience}`
        : "Audience pending";
    descriptionEl.textContent = campaign.description || "-";
    objectivesEl.textContent = campaign.objectives || "-";

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

async function submitCreativeComment(creativeId, message, messageEl, inputEl) {
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
                message: normalizedMessage
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


