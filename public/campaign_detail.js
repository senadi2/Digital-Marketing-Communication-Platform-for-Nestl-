const params = new URLSearchParams(window.location.search);
const campaignId = params.get("campaignId");

const titleEl = document.getElementById("campaignTitle");
const statusEl = document.getElementById("campaignStatus");
const targetAudienceEl = document.getElementById("targetAudience");
const budgetRangeEl = document.getElementById("budgetRange");
const startDateEl = document.getElementById("startDate");
const endDateEl = document.getElementById("endDate");
const descriptionEl = document.getElementById("description");
const objectivesEl = document.getElementById("objectives");
const attachmentList = document.getElementById("attachmentList");

function formatBytes(bytes) {
    if (!bytes || Number.isNaN(bytes)) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeStatus(status) {
    const value = String(status || "").toLowerCase();
    if (value === "accepted") return "Accepted";
    if (value === "decline" || value === "declined") return "Decline";
    return "Pending";
}

function statusClass(status) {
    return normalizeStatus(status).toLowerCase();
}

function downloadAttachment(file) {
    const blob = new Blob(
        [Uint8Array.from(atob(file.dataBase64 || ""), c => c.charCodeAt(0))],
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
                <p class="attachment-name">${file.fileName || "Attachment"}</p>
                <p class="attachment-size">${formatBytes(file.size)}</p>
            </div>
            <button type="button" class="download-btn">Download</button>
        `;

        item.querySelector(".download-btn").addEventListener("click", () => downloadAttachment(file));
        attachmentList.appendChild(item);
    });
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

        titleEl.textContent = campaign.title || "Campaign Detail";
        const normalizedStatus = normalizeStatus(campaign.status);
        statusEl.textContent = normalizedStatus;
        statusEl.className = `status-pill ${statusClass(campaign.status)}`;

        targetAudienceEl.textContent = campaign.targetAudience || "-";
        budgetRangeEl.textContent = campaign.budgetRange || "-";
        startDateEl.textContent = campaign.startDate || "-";
        endDateEl.textContent = campaign.endDate || "-";
        descriptionEl.textContent = campaign.description || "-";
        objectivesEl.textContent = campaign.objectives || "-";

        renderAttachments(campaign.attachments || []);
    } catch (err) {
        titleEl.textContent = "Campaign not found";
        descriptionEl.textContent = err.message || "Could not load campaign details.";
    }
}

loadCampaignDetails();
