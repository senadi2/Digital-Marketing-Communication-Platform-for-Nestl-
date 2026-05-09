const role = localStorage.getItem("role") || "";
const userId = localStorage.getItem("userId") || "";

const summaryStats = document.getElementById("summaryStats");
const statusBars = document.getElementById("statusBars");
const actionList = document.getElementById("actionList");
const campaignTableBody = document.getElementById("campaignTableBody");
const updatedAt = document.getElementById("updatedAt");
const filterButtons = document.querySelectorAll(".filter-btn");

let campaigns = [];
let activeFilter = "All";

if (role && role !== "BrandManager") {
    window.location.href = role === "MarketingManager" ? "MM_dash.html" : "AA_DASH.html";
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
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

function formatDateTime(dateString) {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    }).format(date);
}

function latestCreativeAssets(creativeAssets) {
    const latestByKey = new Map();
    const list = Array.isArray(creativeAssets) ? creativeAssets : [];

    list.forEach((asset) => {
        const key = String(asset?.fileName || asset?.id || "creative").trim().toLowerCase();
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

    return Array.from(latestByKey.values());
}

function reviewState(campaign) {
    const campaignStatus = normalizeCampaignStatus(campaign.status);
    if (campaignStatus === "Declined") {
        return {
            status: "Declined",
            summary: "Campaign declined",
            latestUpload: "-",
            nextAction: "No brand review needed"
        };
    }

    if (campaignStatus !== "Accepted") {
        return {
            status: "No Creative",
            summary: "Awaiting agency acceptance",
            latestUpload: "-",
            nextAction: "Wait for agency response"
        };
    }

    const latestCreatives = latestCreativeAssets(campaign.creativeAssets);
    const allCreatives = Array.isArray(campaign.creativeAssets) ? campaign.creativeAssets : [];
    const approvedCount = allCreatives.filter((asset) => normalizeCreativeStatus(asset.reviewStatus) === "Approved").length;
    if (approvedCount > 0) {
        const latestApprovedUpload = allCreatives
            .filter((asset) => normalizeCreativeStatus(asset.reviewStatus) === "Approved")
            .slice()
            .sort((a, b) => toTimestamp(b.reviewedAt || b.uploadedAt) - toTimestamp(a.reviewedAt || a.uploadedAt))[0]?.uploadedAt;
        return {
            status: "Approved",
            summary: `${approvedCount} creative(s) approved`,
            latestUpload: formatDateTime(latestApprovedUpload),
            nextAction: "Reviewed and approved"
        };
    }

    if (!latestCreatives.length) {
        return {
            status: "No Creative",
            summary: "No creative uploaded",
            latestUpload: "-",
            nextAction: "Wait for creative upload"
        };
    }

    const statuses = latestCreatives.map((asset) => normalizeCreativeStatus(asset.reviewStatus));
    const latestUpload = latestCreatives
        .slice()
        .sort((a, b) => toTimestamp(b.uploadedAt) - toTimestamp(a.uploadedAt))[0]?.uploadedAt;

    if (statuses.includes("Pending Review")) {
        return {
            status: "Awaiting Review",
            summary: `${statuses.filter((status) => status === "Pending Review").length} creative(s) pending`,
            latestUpload: formatDateTime(latestUpload),
            nextAction: "Review uploaded creative"
        };
    }

    if (statuses.includes("Changes Requested")) {
        return {
            status: "Changes Requested",
            summary: `${statuses.filter((status) => status === "Changes Requested").length} creative(s) need revision`,
            latestUpload: formatDateTime(latestUpload),
            nextAction: "Track revised upload"
        };
    }

    return {
        status: "Approved",
        summary: `${approvedCount}/${statuses.length} creative(s) approved`,
        latestUpload: formatDateTime(latestUpload),
        nextAction: "Reviewed and approved"
    };
}

function statusClass(status) {
    const normalized = String(status || "")
        .toLowerCase()
        .replace(/\s+/g, "-");
    if (normalized === "awaiting-review") return "in-progress";
    return normalized;
}

function countByStatus() {
    return campaigns.reduce((counts, campaign) => {
        const state = reviewState(campaign);
        counts[state.status] = (counts[state.status] || 0) + 1;
        return counts;
    }, {});
}

function openCampaign(campaign) {
    if (!campaign?._id) return;
    const url = new URL("campaign_detail.html", window.location.href);
    url.searchParams.set("campaignId", campaign._id);
    if (campaign.productId) url.searchParams.set("productId", campaign.productId);
    if (campaign.agencyId) url.searchParams.set("agencyId", campaign.agencyId);
    window.location.href = url.toString();
}

function enrichCampaigns(rawCampaigns, products, agencies) {
    const productMap = new Map(products.map((product) => [String(product._id || ""), product]));
    const agencyMap = new Map(agencies.map((agency) => [String(agency._id || ""), agency]));

    return rawCampaigns.map((campaign) => {
        const product = productMap.get(String(campaign.productId || ""));
        const agency = agencyMap.get(String(campaign.agencyId || ""));
        return {
            ...campaign,
            productName: campaign.productName || product?.name || "-",
            agencyName: campaign.agencyName || agency?.name || "-"
        };
    }).sort((a, b) => toTimestamp(b.updatedAt || b.createdAt) - toTimestamp(a.updatedAt || a.createdAt));
}

function renderSummary() {
    const counts = countByStatus();
    const reviewed = (counts.Approved || 0) + (counts["Changes Requested"] || 0);
    updatedAt.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

    const cards = [
        ["fa-clock", counts["Awaiting Review"] || 0, "Awaiting Review"],
        ["fa-rotate-left", counts["Changes Requested"] || 0, "Changes Requested"],
        ["fa-circle-check", counts.Approved || 0, "Approved Campaigns"],
        ["fa-clipboard-check", reviewed, "Reviewed Campaigns"]
    ];

    summaryStats.innerHTML = cards.map(([icon, value, label]) => `
        <article class="summary-card">
            <i class="fa-solid ${icon}" aria-hidden="true"></i>
            <strong>${escapeHtml(value)}</strong>
            <span>${escapeHtml(label)}</span>
        </article>
    `).join("");
}

function renderStatusBars() {
    const labels = ["Awaiting Review", "Changes Requested", "Approved", "No Creative"];
    const counts = countByStatus();
    const total = Math.max(campaigns.length, 1);

    statusBars.innerHTML = labels.map((label) => {
        const count = counts[label] || 0;
        const pct = Math.round((count / total) * 100);
        return `
            <div class="status-row">
                <span>${escapeHtml(label)}</span>
                <div class="bar-track" aria-hidden="true">
                    <div class="bar-fill ${escapeHtml(statusClass(label))}" style="width:${pct}%"></div>
                </div>
                <span>${count}</span>
            </div>
        `;
    }).join("");
}

function renderActions() {
    const items = campaigns
        .map((campaign) => ({ campaign, state: reviewState(campaign) }))
        .filter((item) => item.state.status === "Awaiting Review" || item.state.status === "Changes Requested")
        .slice(0, 6);

    if (!items.length) {
        actionList.innerHTML = `<div class="empty-state">No brand review follow-up needed.</div>`;
        return;
    }

    actionList.innerHTML = "";
    items.forEach(({ campaign, state }) => {
        const item = document.createElement("div");
        item.className = "action-item";
        item.tabIndex = 0;
        item.setAttribute("role", "button");
        item.innerHTML = `
            <div>
                <strong>${escapeHtml(campaign.title || "Untitled Campaign")}</strong>
                <span>${escapeHtml(state.nextAction)}</span>
            </div>
            <small>${escapeHtml(state.status)}</small>
        `;
        item.addEventListener("click", () => openCampaign(campaign));
        item.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openCampaign(campaign);
            }
        });
        actionList.appendChild(item);
    });
}

function renderCampaignTable() {
    const visible = campaigns.filter((campaign) => {
        if (activeFilter === "All") return true;
        return reviewState(campaign).status === activeFilter;
    });

    if (!visible.length) {
        campaignTableBody.innerHTML = `<tr><td colspan="6"><div class="empty-state">No campaigns found for this review status.</div></td></tr>`;
        return;
    }

    campaignTableBody.innerHTML = "";
    visible.forEach((campaign) => {
        const state = reviewState(campaign);
        const row = document.createElement("tr");
        row.className = "campaign-row";
        row.innerHTML = `
            <td>
                <div class="campaign-title">
                    <strong>${escapeHtml(campaign.title || "Untitled Campaign")}</strong>
                    <span>${escapeHtml(campaign.campaignType || "Campaign")}</span>
                </div>
            </td>
            <td>${escapeHtml(campaign.productName || "-")}</td>
            <td>${escapeHtml(campaign.agencyName || "-")}</td>
            <td><span class="status-pill ${escapeHtml(statusClass(state.status))}">${escapeHtml(state.status)}</span></td>
            <td>
                <div class="approval-stack">
                    <span>${escapeHtml(state.summary)}</span>
                    <span>${escapeHtml(state.nextAction)}</span>
                </div>
            </td>
            <td class="muted-cell">${escapeHtml(state.latestUpload)}</td>
        `;
        row.addEventListener("click", () => openCampaign(campaign));
        campaignTableBody.appendChild(row);
    });
}

function renderPage() {
    renderSummary();
    renderStatusBars();
    renderActions();
    renderCampaignTable();
}

async function loadReviewOverview() {
    try {
        const [campaignRes, productRes, agencyRes] = await Promise.all([
            fetch("/api/campaigns"),
            fetch("/api/products"),
            fetch("/api/agencies")
        ]);
        const [campaignData, productData, agencyData] = await Promise.all([
            campaignRes.json(),
            productRes.json(),
            agencyRes.json()
        ]);

        if (!campaignRes.ok) throw new Error(campaignData.message || "Failed to load campaigns");

        campaigns = enrichCampaigns(
            Array.isArray(campaignData) ? campaignData : [],
            Array.isArray(productData) ? productData : [],
            Array.isArray(agencyData) ? agencyData : []
        );
        renderPage();
    } catch (err) {
        campaignTableBody.innerHTML = `<tr><td colspan="6"><div class="empty-state">${escapeHtml(err.message || "Could not load brand review overview.")}</div></td></tr>`;
        summaryStats.innerHTML = "";
        statusBars.innerHTML = "";
        actionList.innerHTML = `<div class="empty-state">Review overview unavailable.</div>`;
    }
}

filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
        activeFilter = button.dataset.filter || "All";
        filterButtons.forEach((item) => item.classList.toggle("active", item === button));
        renderCampaignTable();
    });
});

window.logout = () => {
    if (window.AppSession?.logout) {
        window.AppSession.logout("manual");
        return;
    }
    localStorage.clear();
    window.location.href = "/LOGIN.html";
};

if (!userId) {
    window.location.href = "LOGIN.html";
} else {
    loadReviewOverview();
}
