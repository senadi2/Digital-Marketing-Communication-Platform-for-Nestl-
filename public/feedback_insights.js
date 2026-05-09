const agencyId = localStorage.getItem("agencyId") || "";
const role = localStorage.getItem("role") || "";
const userId = localStorage.getItem("userId") || "";

const themeList = document.getElementById("themeList");
const tipList = document.getElementById("tipList");
const agencyScoreboard = document.getElementById("agencyScoreboard");
const updatedAt = document.getElementById("updatedAt");
const logoutBtn = document.querySelector(".logout");

const THEME_RULES = [
    {
        id: "brand-colors",
        label: "Brand Colors",
        icon: "fa-palette",
        keywords: ["color", "colour", "red", "blue", "green", "tone", "contrast", "brand color"],
        tip: "Check Nestle brand colors before submitting and avoid overpowering product colors."
    },
    {
        id: "logo-usage",
        label: "Logo Usage",
        icon: "fa-copyright",
        keywords: ["logo", "brand mark", "placement", "bigger", "smaller"],
        tip: "Keep the logo visible, correctly placed, and proportional to the creative layout."
    },
    {
        id: "text-clarity",
        label: "Text Clarity",
        icon: "fa-align-left",
        keywords: ["text", "words", "copy", "crowded", "read", "font", "caption", "headline"],
        tip: "Reduce copy, keep headlines readable, and leave enough spacing around text."
    },
    {
        id: "call-to-action",
        label: "Call To Action",
        icon: "fa-bullseye",
        keywords: ["cta", "call to action", "button", "action", "clear message"],
        tip: "Make the campaign action clear so the audience knows what to do next."
    },
    {
        id: "product-visibility",
        label: "Product Visibility",
        icon: "fa-box-open",
        keywords: ["product", "pack", "packshot", "visible", "show", "focus"],
        tip: "Make the product easy to notice and keep it connected to the campaign message."
    },
    {
        id: "brief-alignment",
        label: "Brief Alignment",
        icon: "fa-clipboard-check",
        keywords: ["brief", "objective", "audience", "target", "goal", "align", "direction"],
        tip: "Recheck the campaign objective, audience, and required deliverables before upload."
    },
    {
        id: "visual-quality",
        label: "Visual Quality",
        icon: "fa-wand-magic-sparkles",
        keywords: ["quality", "resolution", "blur", "pixel", "image", "layout", "nice", "clean"],
        tip: "Use high-quality assets and check spacing, sharpness, and overall polish."
    },
    {
        id: "video-timing",
        label: "Video Timing",
        icon: "fa-clock",
        keywords: ["second", "timestamp", "timing", "duration", "frame", "scene", "video"],
        tip: "Review the exact timestamp feedback and adjust pacing, frames, or scene timing."
    }
];

const OTHER_THEME = {
    id: "other",
    label: "Other Feedback",
    icon: "fa-comment-dots",
    tip: "Review uncategorized comments manually and look for repeated manager expectations."
};

if (!agencyId || role !== "Agency") {
    window.location.href = "/LOGIN.html";
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatDateTime(dateString) {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    }).format(date);
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

function getThemeForMessage(message) {
    const text = String(message || "").toLowerCase();
    return THEME_RULES.find((theme) => theme.keywords.some((keyword) => text.includes(keyword))) || OTHER_THEME;
}

function collectFeedback(campaigns) {
    const feedback = [];

    campaigns.forEach((campaign) => {
        const creativeAssets = Array.isArray(campaign.creativeAssets) ? campaign.creativeAssets : [];
        creativeAssets.forEach((asset) => {
            const comments = Array.isArray(asset.comments) ? asset.comments : [];
            comments.forEach((comment) => {
                if (!["BrandManager", "MarketingManager"].includes(comment.authorRole)) return;
                const theme = getThemeForMessage(comment.message);
                feedback.push({
                    campaignId: campaign._id,
                    campaignTitle: campaign.title || "Untitled Campaign",
                    creativeName: asset.fileName || "Creative file",
                    authorRole: comment.authorRole,
                    message: comment.message || "",
                    createdAt: comment.createdAt || "",
                    timestampSeconds: comment.timestampSeconds,
                    theme
                });
            });
        });
    });

    return feedback.sort((a, b) => new Date(b.createdAt || "").getTime() - new Date(a.createdAt || "").getTime());
}

function summarizeThemes(feedback) {
    const map = new Map();
    feedback.forEach((item) => {
        const existing = map.get(item.theme.id) || {
            ...item.theme,
            count: 0,
            campaigns: new Set(),
            examples: []
        };
        existing.count += 1;
        existing.campaigns.add(item.campaignTitle);
        if (existing.examples.length < 2) existing.examples.push(item.message);
        map.set(item.theme.id, existing);
    });

    return Array.from(map.values())
        .map((theme) => ({
            ...theme,
            campaignCount: theme.campaigns.size,
            campaigns: Array.from(theme.campaigns)
        }))
        .sort((a, b) => b.count - a.count);
}

function summarizeCampaigns(feedback) {
    const map = new Map();
    feedback.forEach((item) => {
        const existing = map.get(item.campaignId) || {
            campaignId: item.campaignId,
            campaignTitle: item.campaignTitle,
            count: 0,
            themes: new Set(),
            latestAt: item.createdAt
        };
        existing.count += 1;
        existing.themes.add(item.theme.label);
        if (new Date(item.createdAt || "").getTime() > new Date(existing.latestAt || "").getTime()) {
            existing.latestAt = item.createdAt;
        }
        map.set(item.campaignId, existing);
    });

    return Array.from(map.values())
        .map((campaign) => ({
            ...campaign,
            themes: Array.from(campaign.themes)
        }))
        .sort((a, b) => b.count - a.count);
}

function buildAgencyMetrics(agencies, campaigns) {
    return agencies.map((agency) => {
        const metricAgencyId = String(agency._id || "");
        const agencyCampaigns = campaigns.filter((campaign) => String(campaign.agencyId || "") === metricAgencyId);
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
            agencyId: metricAgencyId,
            name: agency.name || "Your Agency",
            campaignsAssigned: agencyCampaigns.length,
            acceptedCampaigns,
            submissions,
            approved,
            changesRequested,
            pendingReview,
            approvalRate,
            efficiencyScore
        };
    }).sort((a, b) => {
        if (b.efficiencyScore !== a.efficiencyScore) return b.efficiencyScore - a.efficiencyScore;
        if (b.approved !== a.approved) return b.approved - a.approved;
        return b.submissions - a.submissions;
    });
}

function renderThemes(themes) {
    if (!themes.length) {
        themeList.innerHTML = `<div class="empty-state">No repeated manager feedback yet. Feedback themes will appear after managers comment on creative submissions.</div>`;
        return;
    }

    themeList.innerHTML = themes.slice(0, 6).map((theme) => `
        <div class="theme-item">
            <div class="theme-icon"><i class="fa-solid ${escapeHtml(theme.icon)}" aria-hidden="true"></i></div>
            <div class="theme-copy">
                <strong>${escapeHtml(theme.label)}</strong>
                <span>${escapeHtml(theme.campaignCount)} campaign(s) affected</span>
            </div>
            <div class="theme-count">
                <strong>${escapeHtml(theme.count)}</strong>
                <span>mentions</span>
            </div>
        </div>
    `).join("");
}

function renderTips(themes) {
    const activeThemes = themes.length ? themes.slice(0, 5) : THEME_RULES.slice(0, 4);
    tipList.innerHTML = activeThemes.map((theme) => `
        <div class="tip-item">
            <i class="fa-solid ${escapeHtml(theme.icon)}" aria-hidden="true"></i>
            <div class="tip-copy">
                <strong>${escapeHtml(theme.label)}</strong>
                <span>${escapeHtml(theme.tip)}</span>
            </div>
        </div>
    `).join("");
}

function renderAgencyScoreboard(metrics) {
    const ownMetric = metrics.find((metric) => metric.agencyId === agencyId);
    if (!ownMetric) {
        agencyScoreboard.innerHTML = `<div class="empty-state">Your agency score is unavailable.</div>`;
        return;
    }

    const activeMetrics = metrics.filter((metric) => metric.submissions > 0);
    const rank = activeMetrics.findIndex((metric) => metric.agencyId === agencyId) + 1;
    const label = performanceLabel(ownMetric);
    const topMessage = rank > 0 && rank <= 3
        ? `You are in the top ${rank} agenc${rank === 1 ? "y" : "ies"} by efficiency.`
        : rank > 0
            ? `Current private rank: #${rank} of ${activeMetrics.length} active agencies.`
            : "Submit creatives to start building your agency score.";

    agencyScoreboard.innerHTML = `
        <div class="scoreboard-head">
            <div>
                <strong>${escapeHtml(ownMetric.efficiencyScore)}%</strong>
                <span>Efficiency score</span>
            </div>
            <span class="score-label ${escapeHtml(labelClass(label))}">${escapeHtml(label)}</span>
        </div>
        <div class="score-track" aria-hidden="true">
            <div class="score-fill" style="width:${ownMetric.efficiencyScore}%"></div>
        </div>
        <p class="score-rank">${escapeHtml(topMessage)}</p>
        <div class="score-metrics">
            <div>
                <strong>${escapeHtml(ownMetric.submissions)}</strong>
                <span>Submissions</span>
            </div>
            <div>
                <strong>${escapeHtml(ownMetric.approved)}</strong>
                <span>Approved</span>
            </div>
            <div>
                <strong>${escapeHtml(ownMetric.changesRequested)}</strong>
                <span>Changes</span>
            </div>
            <div>
                <strong>${escapeHtml(ownMetric.approvalRate)}%</strong>
                <span>Approval Rate</span>
            </div>
        </div>
    `;
}

function renderPage(ownCampaigns, allAgencies, allCampaigns) {
    const feedback = collectFeedback(ownCampaigns);
    const themes = summarizeThemes(feedback);
    const metrics = buildAgencyMetrics(allAgencies, allCampaigns);

    updatedAt.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    renderThemes(themes);
    renderAgencyScoreboard(metrics);
    renderTips(themes);
}

async function loadFeedbackInsights() {
    try {
        const [ownCampaignRes, agencyRes, campaignRes] = await Promise.all([
            fetch(`/api/campaigns?agencyId=${encodeURIComponent(agencyId)}`),
            fetch("/api/agencies"),
            fetch("/api/campaigns")
        ]);
        const [ownCampaignData, agencyData, campaignData] = await Promise.all([
            ownCampaignRes.json(),
            agencyRes.json(),
            campaignRes.json()
        ]);
        if (!ownCampaignRes.ok) throw new Error(ownCampaignData.message || "Failed to load agency campaigns");
        if (!agencyRes.ok) throw new Error(agencyData.message || "Failed to load agency score");
        if (!campaignRes.ok) throw new Error(campaignData.message || "Failed to load agency score");

        renderPage(
            Array.isArray(ownCampaignData) ? ownCampaignData : [],
            Array.isArray(agencyData) ? agencyData : [],
            Array.isArray(campaignData) ? campaignData : []
        );
    } catch (err) {
        themeList.innerHTML = `<div class="empty-state">${escapeHtml(err.message || "Could not load feedback insights.")}</div>`;
        agencyScoreboard.innerHTML = "";
        tipList.innerHTML = "";
    }
}

logoutBtn?.addEventListener("click", () => {
    if (window.AppSession?.logout) {
        window.AppSession.logout("manual");
        return;
    }
    localStorage.clear();
    window.location.href = "/LOGIN.html";
});

if (window.initAgencyChat) {
    window.initAgencyChat({
        triggerId: "agencyChatTrigger",
        agencyId,
        userId,
        role
    });
}

loadFeedbackInsights();
