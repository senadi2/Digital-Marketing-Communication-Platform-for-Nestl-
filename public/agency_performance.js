const role = localStorage.getItem("role") || "";
const userId = localStorage.getItem("userId") || "";

const performanceKpis = document.getElementById("performanceKpis");
const leaderboardList = document.getElementById("leaderboardList");
const insightList = document.getElementById("insightList");
const agencyCardGrid = document.getElementById("agencyCardGrid");
const updatedAt = document.getElementById("updatedAt");

let agencyMetrics = [];

if (role && role !== "MarketingManager") {
    window.location.href = role === "BrandManager" ? "BM_dash.html" : "AA_DASH.html";
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

function percent(part, total) {
    if (!total) return 0;
    return Math.round((part / total) * 100);
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function performanceLabel(metric) {
    if (!metric.submissions) return "No activity";
    if (metric.efficiencyScore >= 80) return "Excellent";
    if (metric.efficiencyScore >= 55) return "Reliable";
    return "Needs attention";
}

function labelClass(label) {
    return String(label || "")
        .toLowerCase()
        .replace(/\s+/g, "-");
}

function openAgency(metric) {
    if (!metric?.agencyId) return;
    window.location.href = `create_brief.html?agencyId=${encodeURIComponent(metric.agencyId)}`;
}

function buildAgencyMetrics(agencies, campaigns) {
    return agencies.map((agency) => {
        const agencyId = String(agency._id || "");
        const agencyCampaigns = campaigns.filter((campaign) => String(campaign.agencyId || "") === agencyId);
        const creatives = agencyCampaigns.flatMap((campaign) => Array.isArray(campaign.creativeAssets) ? campaign.creativeAssets : []);
        const submissions = creatives.length;
        const approved = creatives.filter((asset) => normalizeCreativeStatus(asset.reviewStatus) === "Approved").length;
        const changesRequested = creatives.filter((asset) => normalizeCreativeStatus(asset.reviewStatus) === "Changes Requested").length;
        const pendingReview = creatives.filter((asset) => normalizeCreativeStatus(asset.reviewStatus) === "Pending Review").length;
        const acceptedCampaigns = agencyCampaigns.filter((campaign) => normalizeCampaignStatus(campaign.status) === "Accepted").length;
        const approvalRate = percent(approved, submissions);
        const revisionRate = percent(changesRequested, submissions);
        const campaignAcceptanceRate = percent(acceptedCampaigns, agencyCampaigns.length);
        const efficiencyScore = submissions
            ? clamp(Math.round((approvalRate * 0.72) + (campaignAcceptanceRate * 0.18) - (revisionRate * 0.2) - (pendingReview * 2)), 0, 100)
            : 0;

        return {
            agencyId,
            name: agency.name || "Unnamed Agency",
            description: agency.description || "Agency partner",
            campaignsAssigned: agencyCampaigns.length,
            acceptedCampaigns,
            submissions,
            approved,
            changesRequested,
            pendingReview,
            approvalRate,
            revisionRate,
            efficiencyScore
        };
    }).sort((a, b) => {
        if (b.efficiencyScore !== a.efficiencyScore) return b.efficiencyScore - a.efficiencyScore;
        if (b.approved !== a.approved) return b.approved - a.approved;
        return b.submissions - a.submissions;
    });
}

function renderKpis() {
    const totalAgencies = agencyMetrics.length;
    const totalSubmissions = agencyMetrics.reduce((sum, metric) => sum + metric.submissions, 0);
    const totalApproved = agencyMetrics.reduce((sum, metric) => sum + metric.approved, 0);
    const activeAgencies = agencyMetrics.filter((metric) => metric.submissions > 0);
    const avgApprovalRate = activeAgencies.length
        ? Math.round(activeAgencies.reduce((sum, metric) => sum + metric.approvalRate, 0) / activeAgencies.length)
        : 0;

    updatedAt.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

    const cards = [
        ["fa-building-user", totalAgencies, "Registered Agencies"],
        ["fa-file-arrow-up", totalSubmissions, "Creative Submissions"],
        ["fa-circle-check", totalApproved, "Approved Creatives"],
        ["fa-percent", `${avgApprovalRate}%`, "Average Approval Rate"]
    ];

    performanceKpis.innerHTML = cards.map(([icon, value, label]) => `
        <article class="kpi-card">
            <i class="fa-solid ${icon}" aria-hidden="true"></i>
            <div>
                <strong>${escapeHtml(value)}</strong>
                <span>${escapeHtml(label)}</span>
            </div>
        </article>
    `).join("");
}

function renderLeaderboard() {
    const activeMetrics = agencyMetrics.filter((metric) => metric.submissions > 0).slice(0, 5);
    if (!activeMetrics.length) {
        leaderboardList.innerHTML = `<div class="empty-state">No agency submissions yet.</div>`;
        return;
    }

    leaderboardList.innerHTML = "";
    activeMetrics.forEach((metric, index) => {
        const item = document.createElement("div");
        item.className = "leaderboard-item";
        item.tabIndex = 0;
        item.setAttribute("role", "button");
        item.innerHTML = `
            <div class="rank-badge">#${index + 1}</div>
            <div class="leaderboard-name">
                <strong>${escapeHtml(metric.name)}</strong>
                <span>${escapeHtml(metric.approved)} approved from ${escapeHtml(metric.submissions)} submissions</span>
            </div>
            <div class="leaderboard-score">${escapeHtml(metric.efficiencyScore)}%</div>
        `;
        item.addEventListener("click", () => openAgency(metric));
        item.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openAgency(metric);
            }
        });
        leaderboardList.appendChild(item);
    });
}

function renderInsights() {
    const activeMetrics = agencyMetrics.filter((metric) => metric.submissions > 0);
    const topAgency = activeMetrics[0];
    const mostChanges = activeMetrics.slice().sort((a, b) => b.changesRequested - a.changesRequested)[0];
    const mostPending = activeMetrics.slice().sort((a, b) => b.pendingReview - a.pendingReview)[0];
    const inactiveCount = agencyMetrics.filter((metric) => metric.submissions === 0).length;

    const insights = [];
    if (topAgency) {
        insights.push(["fa-trophy", "Top performer", `${topAgency.name} leads with a ${topAgency.efficiencyScore}% efficiency score.`]);
    }
    if (mostChanges && mostChanges.changesRequested > 0) {
        insights.push(["fa-rotate-left", "Most revisions", `${mostChanges.name} has ${mostChanges.changesRequested} change request(s).`]);
    }
    if (mostPending && mostPending.pendingReview > 0) {
        insights.push(["fa-hourglass-half", "Pending reviews", `${mostPending.name} has ${mostPending.pendingReview} creative(s) waiting for review.`]);
    }
    if (inactiveCount > 0) {
        insights.push(["fa-circle-info", "No submissions yet", `${inactiveCount} agenc${inactiveCount === 1 ? "y has" : "ies have"} no creative submissions yet.`]);
    }

    if (!insights.length) {
        insightList.innerHTML = `<div class="empty-state">No performance insights available yet.</div>`;
        return;
    }

    insightList.innerHTML = insights.map(([icon, title, copy]) => `
        <div class="insight-item">
            <i class="fa-solid ${icon}" aria-hidden="true"></i>
            <div>
                <strong>${escapeHtml(title)}</strong>
                <span>${escapeHtml(copy)}</span>
            </div>
        </div>
    `).join("");
}

function renderAgencyCards() {
    if (!agencyMetrics.length) {
        agencyCardGrid.innerHTML = `<div class="empty-state">No agencies are registered yet.</div>`;
        return;
    }

    agencyCardGrid.innerHTML = "";
    agencyMetrics.forEach((metric) => {
        const label = performanceLabel(metric);
        const card = document.createElement("article");
        card.className = "agency-score-card";
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.innerHTML = `
            <div class="agency-card-head">
                <div>
                    <h3>${escapeHtml(metric.name)}</h3>
                    <p>${escapeHtml(metric.campaignsAssigned)} assigned campaign(s)</p>
                </div>
                <span class="performance-label ${escapeHtml(labelClass(label))}">${escapeHtml(label)}</span>
            </div>
            <div class="score-meter">
                <div class="score-meter-row">
                    <span>Efficiency score</span>
                    <strong>${escapeHtml(metric.efficiencyScore)}%</strong>
                </div>
                <div class="score-track" aria-hidden="true">
                    <div class="score-fill" style="width:${metric.efficiencyScore}%"></div>
                </div>
            </div>
            <div class="agency-card-stats">
                <div>
                    <strong>${escapeHtml(metric.submissions)}</strong>
                    <span>Submissions</span>
                </div>
                <div>
                    <strong>${escapeHtml(metric.approved)}</strong>
                    <span>Approved</span>
                </div>
                <div>
                    <strong>${escapeHtml(metric.changesRequested)}</strong>
                    <span>Changes</span>
                </div>
            </div>
        `;
        card.addEventListener("click", () => openAgency(metric));
        card.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openAgency(metric);
            }
        });
        agencyCardGrid.appendChild(card);
    });
}

function renderPage() {
    renderKpis();
    renderLeaderboard();
    renderInsights();
    renderAgencyCards();
}

async function loadPerformance() {
    try {
        const [agencyRes, campaignRes] = await Promise.all([
            fetch("/api/agencies"),
            fetch("/api/campaigns")
        ]);
        const [agencyData, campaignData] = await Promise.all([
            agencyRes.json(),
            campaignRes.json()
        ]);

        if (!agencyRes.ok) throw new Error(agencyData.message || "Failed to load agencies");
        if (!campaignRes.ok) throw new Error(campaignData.message || "Failed to load campaigns");

        agencyMetrics = buildAgencyMetrics(
            Array.isArray(agencyData) ? agencyData : [],
            Array.isArray(campaignData) ? campaignData : []
        );
        renderPage();
    } catch (err) {
        performanceKpis.innerHTML = "";
        leaderboardList.innerHTML = `<div class="empty-state">Performance data unavailable.</div>`;
        insightList.innerHTML = `<div class="empty-state">${escapeHtml(err.message || "Could not load agency performance.")}</div>`;
        agencyCardGrid.innerHTML = "";
    }
}

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
    loadPerformance();
}
