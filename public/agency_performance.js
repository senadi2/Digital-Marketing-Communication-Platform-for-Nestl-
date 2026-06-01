const role = localStorage.getItem("role") || "";
const userId = localStorage.getItem("userId") || "";
const agencyScoreboardBody = document.getElementById("agencyScoreboardBody");
const periodFilter = document.getElementById("periodFilter");

let agencies = [];
let campaigns = [];
let selectedPeriodMonths = 1;

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

function toTimestamp(value) {
    const time = new Date(value || "").getTime();
    return Number.isNaN(time) ? 0 : time;
}

function campaignPeriodTimestamp(campaign) {
    return toTimestamp(campaign?.endDate) || toTimestamp(campaign?.startDate) || toTimestamp(campaign?.createdAt);
}

function periodStartDate(months) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setMonth(start.getMonth() - Number(months || 1));
    return start.getTime();
}

function campaignsForSelectedPeriod() {
    const startTime = periodStartDate(selectedPeriodMonths);
    return campaigns.filter((campaign) => {
        const timestamp = campaignPeriodTimestamp(campaign);
        return timestamp >= startTime;
    });
}

function objectiveRate(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "yes") return 100;
    if (normalized === "partial") return 50;
    if (normalized === "no") return 0;
    return null;
}

function campaignSuccessRate(campaign) {
    const metrics = campaign?.successMetrics || {};
    const targetReached = Number(metrics.targetReached);
    const actualReached = Number(metrics.actualReached);
    const objective = objectiveRate(metrics.objectiveAchieved);

    if (!Number.isFinite(targetReached) || targetReached <= 0) return null;
    if (!Number.isFinite(actualReached) || actualReached < 0) return null;
    if (objective === null) return null;

    const reachRate = (actualReached / targetReached) * 100;
    return Math.max(0, Math.min(100, (reachRate + objective) / 2));
}

function briefAlignmentRate(campaign) {
    const rating = Number(campaign?.briefAlignmentRating?.rating);
    if (!Number.isFinite(rating) || rating < 0 || rating > 100) return null;
    return rating;
}

function firstAgencySubmissionDate(campaign) {
    const creativeAssets = Array.isArray(campaign?.creativeAssets) ? campaign.creativeAssets : [];
    const uploadTimes = creativeAssets
        .map((asset) => toTimestamp(asset.uploadedAt))
        .filter((time) => time > 0)
        .sort((a, b) => a - b);

    return uploadTimes[0] || 0;
}

function onTimeDeliveryScore(campaign) {
    const dueTime = toTimestamp(campaign?.endDate);
    const submittedTime = firstAgencySubmissionDate(campaign);

    if (!submittedTime) return 0;
    if (!dueTime) return null;

    const dayMs = 24 * 60 * 60 * 1000;
    const dueDay = new Date(dueTime);
    const submittedDay = new Date(submittedTime);
    dueDay.setHours(0, 0, 0, 0);
    submittedDay.setHours(0, 0, 0, 0);

    const daysDifference = Math.round((dueDay.getTime() - submittedDay.getTime()) / dayMs);
    if (daysDifference >= 3) return 100;
    if (daysDifference === 2) return 95;
    if (daysDifference === 1) return 90;
    if (daysDifference === 0) return 80;
    if (daysDifference === -1) return 65;
    if (daysDifference === -2) return 50;
    if (daysDifference === -3) return 35;
    return 20;
}

function finalCampaignScore(campaign) {
    const success = campaignSuccessRate(campaign);
    const alignment = briefAlignmentRate(campaign);
    const delivery = onTimeDeliveryScore(campaign);

    if (success === null || alignment === null || delivery === null) return null;
    return (success * 0.5) + (alignment * 0.3) + (delivery * 0.2);
}

function scoreClass(score) {
    if (score === null) return "not-ready";
    if (score >= 85) return "excellent";
    if (score >= 70) return "strong";
    if (score >= 50) return "developing";
    return "low";
}

function buildAgencyScores() {
    const periodCampaigns = campaignsForSelectedPeriod();

    return agencies.map((agency) => {
        const agencyCampaigns = periodCampaigns.filter((campaign) => String(campaign.agencyId || "") === String(agency._id || ""));
        const campaignScores = agencyCampaigns
            .map((campaign) => finalCampaignScore(campaign))
            .filter((score) => Number.isFinite(score));
        const agencyScore = campaignScores.length
            ? campaignScores.reduce((sum, score) => sum + score, 0) / campaignScores.length
            : null;

        return {
            agencyId: agency._id,
            agencyName: agency.name || "Unnamed Agency",
            description: agency.description || "Agency partner",
            campaignCount: agencyCampaigns.length,
            evaluatedCount: campaignScores.length,
            agencyScore
        };
    }).sort((a, b) => {
        if (a.agencyScore === null && b.agencyScore === null) return a.agencyName.localeCompare(b.agencyName);
        if (a.agencyScore === null) return 1;
        if (b.agencyScore === null) return -1;
        if (b.agencyScore !== a.agencyScore) return b.agencyScore - a.agencyScore;
        return b.evaluatedCount - a.evaluatedCount;
    });
}

function openAgency(agencyId) {
    if (!agencyId) return;
    window.location.href = `create_brief.html?agencyId=${encodeURIComponent(agencyId)}`;
}

function renderScoreboard() {
    const scores = buildAgencyScores();

    if (!scores.length) {
        agencyScoreboardBody.innerHTML = `<tr><td colspan="3"><div class="empty-state">No agencies are registered yet.</div></td></tr>`;
        return;
    }

    agencyScoreboardBody.innerHTML = "";
    scores.forEach((score, index) => {
        const hasScore = score.agencyScore !== null;
        const row = document.createElement("tr");
        row.className = "scoreboard-row";
        row.tabIndex = 0;
        row.setAttribute("role", "button");
        row.innerHTML = `
            <td><span class="rank-pill ${index < 3 && hasScore ? "top-rank" : ""}">#${index + 1}</span></td>
            <td>
                <div class="agency-name-cell">
                    <strong>${escapeHtml(score.agencyName)}</strong>
                    <span>${escapeHtml(score.description)}</span>
                </div>
            </td>
            <td>
                <span class="agency-score-pill ${escapeHtml(scoreClass(score.agencyScore))}">
                    ${hasScore ? `${score.agencyScore.toFixed(1)}%` : "Not ready"}
                </span>
            </td>
        `;
        row.addEventListener("click", () => openAgency(score.agencyId));
        row.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openAgency(score.agencyId);
            }
        });
        agencyScoreboardBody.appendChild(row);
    });
}

if (periodFilter) {
    periodFilter.addEventListener("change", () => {
        selectedPeriodMonths = Number(periodFilter.value || 1);
        renderScoreboard();
    });
}

async function loadAgencyScoreboard() {
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

        agencies = Array.isArray(agencyData) ? agencyData : [];
        campaigns = Array.isArray(campaignData) ? campaignData : [];
        renderScoreboard();
    } catch (err) {
        agencyScoreboardBody.innerHTML = `<tr><td colspan="3"><div class="empty-state">${escapeHtml(err.message || "Could not load agency scoreboard.")}</div></td></tr>`;
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
    loadAgencyScoreboard();
}
