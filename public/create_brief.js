const agencyNameEl = document.getElementById("agencyName");
const agencyDescriptionEl = document.getElementById("agencyDescription");
const agencyImageEl = document.getElementById("agencyImage");
const campaignList = document.getElementById("campaignList");
const campaignBriefModal = document.getElementById("campaignBriefModal");
const openBriefModalBtn = document.getElementById("openBriefModalBtn");
const closeBriefModalBtn = document.getElementById("closeBriefModalBtn");
const campaignBriefForm = document.getElementById("campaignBriefForm");
const briefFormMessage = document.getElementById("briefFormMessage");
const dashboardBackLink = document.getElementById("dashboardBackLink");

const params = new URLSearchParams(window.location.search);
const agencyId = params.get("agencyId");
const mmId = localStorage.getItem("userId") || "";
const userId = localStorage.getItem("userId") || "";
const role = localStorage.getItem("role") || "";
const FALLBACK_IMAGE = "/api/media/agency-image?seed=agency-brief-default&name=Agency";

if (dashboardBackLink && role === "BrandManager") {
    dashboardBackLink.href = "BM_dash.html";
}

if (role === "BrandManager") {
    openBriefModalBtn.hidden = true;
}

if (!agencyId) {
    agencyDescriptionEl.textContent = "Agency not found. Please go back to dashboard and select an agency.";
    openBriefModalBtn.disabled = true;
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function normalizeAgencyImageUrl(url) {
    if (!url) return FALLBACK_IMAGE;
    try {
        const imageUrl = new URL(url);
        if (imageUrl.hostname.includes("images.unsplash.com")) {
            imageUrl.searchParams.set("w", "1400");
            imageUrl.searchParams.set("q", "90");
            imageUrl.searchParams.set("fit", "max");
            return imageUrl.toString();
        }
        return url;
    } catch {
        return url;
    }
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

function toTimestamp(value) {
    const time = new Date(value || "").getTime();
    return Number.isNaN(time) ? 0 : time;
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

function openCampaignDetail(campaignId) {
    if (!campaignId) return;
    const detailUrl = new URL("campaign_detail.html", window.location.href);
    detailUrl.searchParams.set("campaignId", campaignId);
    if (agencyId) {
        detailUrl.searchParams.set("agencyId", agencyId);
    }
    window.location.href = detailUrl.toString();
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || "");
            const base64 = result.includes(",") ? result.split(",")[1] : "";
            resolve(base64);
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
    });
}

async function prepareAttachments() {
    const fileInput = document.getElementById("campaignAttachment");
    const files = Array.from(fileInput?.files || []);
    if (!files.length) return [];

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const maxBytes = 20 * 1024 * 1024;
    if (totalSize > maxBytes) {
        throw new Error("Total attachment size must be 20MB or less.");
    }

    const attachments = [];
    for (const file of files) {
        const dataBase64 = await fileToBase64(file);
        attachments.push({
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            dataBase64
        });
    }

    return attachments;
}

async function loadAgencyInfo() {
    if (!agencyId) return;
    try {
        const res = await fetch(`/api/agencies/${agencyId}`);
        const agency = await res.json();

        if (!res.ok) throw new Error(agency.message || "Failed to load agency");

        agencyNameEl.textContent = agency.name || "Unnamed Agency";
        agencyDescriptionEl.textContent = agency.description || "No description available.";
        agencyImageEl.src = normalizeAgencyImageUrl(agency.imageUrl);
        agencyImageEl.alt = `${agency.name || "Agency"} image`;
        agencyImageEl.addEventListener("error", () => {
            agencyImageEl.src = `/api/media/agency-image?seed=${encodeURIComponent(`agency-brief-${agency._id || agency.name || Date.now()}`)}&name=${encodeURIComponent(agency.name || "Agency")}`;
        }, { once: true });
    } catch (err) {
        console.error(err);
        agencyNameEl.textContent = "Unnamed Agency";
        agencyDescriptionEl.textContent = "Error loading agency info.";
        agencyImageEl.src = FALLBACK_IMAGE;
    }
}

function renderCampaigns(campaigns) {
    campaignList.innerHTML = "";

    if (!campaigns.length) {
        const emptyState = document.createElement("div");
        emptyState.className = "empty-campaigns";
        emptyState.textContent = role === "BrandManager"
            ? "No ongoing campaigns yet for this agency."
            : "No ongoing campaigns yet. Create a campaign brief to get started.";
        campaignList.appendChild(emptyState);
        return;
    }

    campaigns.forEach(campaign => {
        const card = document.createElement("article");
        const normalized = getDisplayStatus(campaign);
        const status = statusClass(normalized);
        const campaignDecisionStatus = normalizeCampaignStatus(campaign.status);
        card.className = "campaign-card";
        if (campaign._id) {
            card.tabIndex = 0;
            card.setAttribute("role", "button");
            card.setAttribute("aria-label", `Open ${campaign.title || "campaign"} details`);
        }
        card.innerHTML = `
            <div class="campaign-card-header">
                <span class="campaign-status ${escapeHtml(status)}">${escapeHtml(normalized)}</span>
            </div>
            <h3>${escapeHtml(campaign.title)}</h3>
            <p class="campaign-meta">Timeline: ${escapeHtml(campaign.startDate)} to ${escapeHtml(campaign.endDate)}</p>
            <p class="campaign-meta">Target audience: ${escapeHtml(campaign.targetAudience)}</p>
            <p class="campaign-meta">Budget: ${escapeHtml(campaign.budgetRange)}</p>
            <p class="campaign-description">${escapeHtml(campaign.description)}</p>
            <p class="campaign-objectives">Objectives: ${escapeHtml(campaign.objectives)}</p>
            ${campaignDecisionStatus === "Declined" && campaign.rejectionReason ? `<p class="campaign-rejection-reason"><strong>Reason:</strong> ${escapeHtml(campaign.rejectionReason)}</p>` : ""}
            <div class="campaign-card-footer">
                <span class="campaign-footer-arrow" aria-hidden="true">&rarr;</span>
            </div>
        `;
        if (campaign._id) {
            card.addEventListener("click", () => openCampaignDetail(campaign._id));
            card.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openCampaignDetail(campaign._id);
                }
            });
        }
        campaignList.appendChild(card);
    });
}

async function loadCampaigns() {
    if (!agencyId) return;
    try {
        const res = await fetch(`/api/campaigns?agencyId=${encodeURIComponent(agencyId)}`);
        const campaigns = await res.json();
        const normalizedCampaigns = Array.isArray(campaigns) ? campaigns : [];
        const visibleCampaigns = role === "BrandManager"
            ? normalizedCampaigns.filter((campaign) => normalizeCampaignStatus(campaign.status) !== "Declined")
            : normalizedCampaigns;
        renderCampaigns(visibleCampaigns);
    } catch (err) {
        console.error(err);
        renderCampaigns([]);
    }
}

function openBriefModal() {
    campaignBriefModal.style.display = "flex";
}

function closeBriefModal() {
    campaignBriefModal.style.display = "none";
    campaignBriefForm.reset();
    briefFormMessage.textContent = "";
}

openBriefModalBtn.addEventListener("click", openBriefModal);
closeBriefModalBtn.addEventListener("click", closeBriefModal);

campaignBriefForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const campaignData = {
        title: document.getElementById("campaignTitle").value.trim(),
        targetAudience: document.getElementById("targetAudience").value.trim(),
        budgetRange: document.getElementById("budgetRange").value.trim(),
        startDate: document.getElementById("startDate").value,
        endDate: document.getElementById("endDate").value,
        description: document.getElementById("campaignDescription").value.trim(),
        objectives: document.getElementById("campaignObjectives").value.trim(),
        agencyId,
        mmId
    };

    if (!campaignData.title || !campaignData.agencyId || !campaignData.mmId) {
        briefFormMessage.textContent = "Missing campaign title or user session. Please log in again.";
        briefFormMessage.className = "form-message error";
        return;
    }

    try {
        const attachments = await prepareAttachments();
        const res = await fetch("/api/campaigns", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...campaignData, attachments })
        });
        const data = await res.json();

        if (!res.ok) {
            briefFormMessage.textContent = data.message || "Error creating campaign";
            briefFormMessage.className = "form-message error";
            return;
        }

        closeBriefModal();
        loadCampaigns();
        alert(`Campaign brief "${campaignData.title}" created successfully.`);
    } catch (err) {
        console.error(err);
        briefFormMessage.textContent = err?.message || "Error creating campaign";
        briefFormMessage.className = "form-message error";
    }
});

loadAgencyInfo();
loadCampaigns();

if (window.initAgencyChat) {
    window.initAgencyChat({
        triggerId: "agencyChatTrigger",
        agencyId,
        userId,
        role
    });
}
