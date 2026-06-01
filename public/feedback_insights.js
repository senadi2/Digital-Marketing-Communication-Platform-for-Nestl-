const agencyId = localStorage.getItem("agencyId") || "";
const role = localStorage.getItem("role") || "";
const userId = localStorage.getItem("userId") || "";

const themeList = document.getElementById("themeList");
const submissionFilter = document.getElementById("submissionFilter");
const currentAgencyScore = document.getElementById("currentAgencyScore");
const agencyPerformanceChart = document.getElementById("agencyPerformanceChart");
const agencyChartShell = document.getElementById("agencyChartShell");
const agencyChartTooltip = document.getElementById("agencyChartTooltip");
const agencyScoreYear = document.getElementById("agencyScoreYear");
const agencyScorePrevYear = document.getElementById("agencyScorePrevYear");
const agencyScoreNextYear = document.getElementById("agencyScoreNextYear");
const logoutBtn = document.querySelector(".logout");
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

let selectedPerformanceYear = new Date().getFullYear();
let latestOwnCampaigns = [];
let latestAllAgencies = [];
let latestAllCampaigns = [];
let selectedSubmissionLimit = 5;
let agencyChartBars = [];

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

function toTimestamp(value) {
    const time = new Date(value || "").getTime();
    return Number.isNaN(time) ? 0 : time;
}

function campaignPeriodTimestamp(campaign) {
    return toTimestamp(campaign?.endDate) || toTimestamp(campaign?.startDate) || toTimestamp(campaign?.createdAt);
}

function performanceLabel(metric) {
    if (metric.agencyScore === null) return "No activity";
    if (metric.agencyScore >= 85) return "Excellent";
    if (metric.agencyScore >= 70) return "Reliable";
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

function recentSubmissionCampaigns(campaigns, limit) {
    const submissions = [];

    campaigns.forEach((campaign) => {
        const creativeAssets = Array.isArray(campaign.creativeAssets) ? campaign.creativeAssets : [];
        creativeAssets.forEach((asset) => {
            submissions.push({
                campaign,
                asset,
                uploadedAt: toTimestamp(asset.uploadedAt)
            });
        });
    });

    const selectedKeys = new Set(submissions
        .sort((a, b) => b.uploadedAt - a.uploadedAt)
        .slice(0, Number(limit || 5))
        .map((entry) => `${entry.campaign._id || ""}|${entry.asset.id || entry.asset.fileName || ""}`));

    return campaigns.map((campaign) => ({
        ...campaign,
        creativeAssets: (Array.isArray(campaign.creativeAssets) ? campaign.creativeAssets : [])
            .filter((asset) => selectedKeys.has(`${campaign._id || ""}|${asset.id || asset.fileName || ""}`))
    })).filter((campaign) => campaign.creativeAssets.length);
}

function summarizeThemes(feedback) {
    const map = new Map();
    feedback.forEach((item) => {
        if (item.theme.id === OTHER_THEME.id) return;
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

function suggestedQuestions(theme) {
    const label = theme.label || "this feedback";
    const questionMap = {
        "Brand Colors": [
            "How can we improve brand colour alignment in our next creative?",
            "Can you share the exact Nestle colour expectations for this campaign?",
            "Which colour usage mistake is repeated most often in our submissions?"
        ],
        "Logo Usage": [
            "How should we improve logo placement in our next submission?",
            "Can you clarify the preferred logo size and position?",
            "Which logo usage issue should we fix first?"
        ],
        "Text Clarity": [
            "How can we make the campaign text clearer?",
            "Which text elements feel too crowded or hard to read?",
            "Can you suggest how much copy we should keep?"
        ],
        "Call To Action": [
            "How can we make the call to action clearer?",
            "What action should the audience understand first?",
            "Can you suggest a stronger CTA direction?"
        ],
        "Product Visibility": [
            "How can we improve product visibility in our creative?",
            "Where should the product be placed for better impact?",
            "Can you clarify how prominent the product pack should be?"
        ],
        "Brief Alignment": [
            "How can we align better with the campaign brief?",
            "Which part of the brief are we missing most often?",
            "Can you clarify the priority objective before our next submission?"
        ],
        "Visual Quality": [
            "How can we improve the visual quality of our next creative?",
            "Which visual quality issue should we fix first?",
            "Can you suggest what would make the layout look more polished?"
        ],
        "Video Timing": [
            "How can we improve the timing and pacing of the video?",
            "Which timestamp needs the most attention?",
            "Can you clarify the ideal scene timing?"
        ]
    };

    return questionMap[label] || [
        `How can we improve ${label.toLowerCase()} in our next submission?`,
        `What should we change first related to ${label.toLowerCase()}?`,
        `Can you give us practical tips for improving ${label.toLowerCase()}?`
    ];
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

function campaignScoreBreakdown(campaign) {
    const success = campaignSuccessRate(campaign);
    const alignment = briefAlignmentRate(campaign);
    const delivery = onTimeDeliveryScore(campaign);
    const score = success === null || alignment === null || delivery === null
        ? null
        : (success * 0.5) + (alignment * 0.3) + (delivery * 0.2);

    return { success, alignment, delivery, score };
}

function average(scores) {
    const validScores = scores.filter((score) => Number.isFinite(score));
    if (!validScores.length) return null;
    return validScores.reduce((sum, score) => sum + score, 0) / validScores.length;
}

function buildAgencyMetrics(agencies, campaigns) {
    return agencies.map((agency) => {
        const metricAgencyId = String(agency._id || "");
        const agencyCampaigns = campaigns.filter((campaign) => String(campaign.agencyId || "") === metricAgencyId);
        const campaignScores = agencyCampaigns
            .map((campaign) => finalCampaignScore(campaign))
            .filter((score) => Number.isFinite(score));
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
            agencyScore: average(campaignScores),
            efficiencyScore
        };
    }).sort((a, b) => {
        if (a.agencyScore === null && b.agencyScore === null) return b.efficiencyScore - a.efficiencyScore;
        if (a.agencyScore === null) return 1;
        if (b.agencyScore === null) return -1;
        if (b.agencyScore !== a.agencyScore) return b.agencyScore - a.agencyScore;
        if (b.approved !== a.approved) return b.approved - a.approved;
        return b.submissions - a.submissions;
    });
}

async function sendSuggestedQuestion(message, button) {
    const normalizedMessage = String(message || "").trim();
    if (!normalizedMessage) return;

    const originalText = button?.textContent || "";
    if (button) {
        button.disabled = true;
        button.textContent = "Sending...";
    }

    try {
        const res = await fetch(`/api/agencies/${encodeURIComponent(agencyId)}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userId,
                role,
                message: normalizedMessage
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to send question");

        document.getElementById("agencyChatTrigger")?.click();
    } catch (err) {
        alert(err.message || "Could not send question to agency chat.");
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
}

function renderThemes(themes) {
    if (!themes.length) {
        themeList.innerHTML = `<div class="empty-state">No repeated manager feedback yet for the selected submissions.</div>`;
        return;
    }

    themeList.innerHTML = `
        <div class="behaviour-table-wrap">
            <table class="behaviour-table">
                <thead>
                    <tr>
                        <th>Theme</th>
                        <th>Occurrences</th>
                        <th>Ask Marketing Manager</th>
                    </tr>
                </thead>
                <tbody>
                    ${themes.slice(0, 6).map((theme, themeIndex) => `
                        <tr>
                            <td>
                                <div class="theme-cell">
                                    <span class="theme-icon"><i class="fa-solid ${escapeHtml(theme.icon)}" aria-hidden="true"></i></span>
                                    <div>
                                        <strong>${escapeHtml(theme.label)}</strong>
                                        <span>${escapeHtml(theme.campaignCount)} campaign(s) affected</span>
                                    </div>
                                </div>
                            </td>
                            <td><strong class="occurrence-count">${escapeHtml(theme.count)}</strong></td>
                            <td>
                                <div class="suggestion-list">
                                    ${suggestedQuestions(theme).map((question, questionIndex) => `
                                        <button type="button" class="suggestion-chip" data-theme-index="${themeIndex}" data-question-index="${questionIndex}">
                                            ${escapeHtml(question)}
                                        </button>
                                    `).join("")}
                                </div>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;

    const visibleThemes = themes.slice(0, 6);
    themeList.querySelectorAll(".suggestion-chip").forEach((button) => {
        button.addEventListener("click", () => {
            const theme = visibleThemes[Number(button.dataset.themeIndex || 0)];
            const question = suggestedQuestions(theme)[Number(button.dataset.questionIndex || 0)];
            sendSuggestedQuestion(question, button);
        });
    });
}

function scoreColor(score) {
    if (score === null) return "#d7e0ec";
    if (score >= 85) return "#177245";
    if (score >= 70) return "#d99a18";
    if (score >= 50) return "#f79009";
    return "#b42318";
}

function currentAgencyYearScore(campaigns) {
    return average(campaigns
        .filter((campaign) => {
            const timestamp = campaignPeriodTimestamp(campaign);
            return timestamp && new Date(timestamp).getFullYear() === selectedPerformanceYear;
        })
        .map((campaign) => finalCampaignScore(campaign)));
}

function monthlyAgencyScores(campaigns, year) {
    const months = Array.from({ length: 12 }, () => ({
        scores: [],
        successRates: [],
        briefAlignments: [],
        deliveryScores: []
    }));

    campaigns.forEach((campaign) => {
        const timestamp = campaignPeriodTimestamp(campaign);
        if (!timestamp) return;
        const date = new Date(timestamp);
        if (date.getFullYear() !== year) return;
        const breakdown = campaignScoreBreakdown(campaign);
        if (!Number.isFinite(breakdown.score)) return;

        const month = months[date.getMonth()];
        month.scores.push(breakdown.score);
        month.successRates.push(breakdown.success);
        month.briefAlignments.push(breakdown.alignment);
        month.deliveryScores.push(breakdown.delivery);
    });

    return months.map((month) => ({
        score: average(month.scores),
        success: average(month.successRates),
        alignment: average(month.briefAlignments),
        delivery: average(month.deliveryScores),
        count: month.scores.length
    }));
}

function formatScore(value) {
    return Number.isFinite(value) ? `${value.toFixed(1)}%` : "-";
}

function formatWeightedScore(value, weight) {
    if (!Number.isFinite(value)) return `- / ${weight}`;
    const weightedValue = (value * weight) / 100;
    const roundedValue = Number.isInteger(weightedValue) ? String(weightedValue) : weightedValue.toFixed(1);
    return `${roundedValue} / ${weight}`;
}

function drawAgencyPerformanceChart(monthlyScores) {
    if (!agencyPerformanceChart) return;
    agencyChartBars = [];
    const canvas = agencyPerformanceChart;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(320, Math.floor(rect.width || 980));
    const height = Math.max(260, Math.floor(rect.height || 320));
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const padding = { top: 18, right: 22, bottom: 42, left: 54 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const xFor = (index) => padding.left + (chartWidth / 11) * index;
    const yFor = (value) => padding.top + chartHeight - (chartHeight * (value / 100));

    ctx.font = "12px Arial";
    ctx.lineWidth = 1;
    for (let value = 0; value <= 100; value += 20) {
        const y = yFor(value);
        ctx.strokeStyle = "#d7e0ec";
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
        ctx.fillStyle = "#5f5b5b";
        ctx.textAlign = "right";
        ctx.fillText(`${value}%`, padding.left - 10, y + 4);
    }

    ctx.strokeStyle = "#c8d3e1";
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + chartHeight);
    ctx.lineTo(width - padding.right, padding.top + chartHeight);
    ctx.stroke();

    MONTH_LABELS.forEach((month, index) => {
        ctx.fillStyle = "#5f5b5b";
        ctx.textAlign = "center";
        ctx.fillText(month, xFor(index), height - 16);
    });

    const points = monthlyScores
        .map((entry, index) => Number.isFinite(entry?.score) ? {
            index,
            score: entry.score,
            data: entry,
            x: xFor(index),
            y: yFor(entry.score)
        } : null)
        .filter(Boolean);

    points.forEach((point) => {
        const barWidth = Math.max(18, Math.min(42, chartWidth / 20));
        const zeroY = yFor(0);
        ctx.fillStyle = scoreColor(point.score);
        ctx.beginPath();
        ctx.roundRect(point.x - (barWidth / 2), point.y, barWidth, zeroY - point.y, 8);
        ctx.fill();

        ctx.fillStyle = scoreColor(point.score);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        agencyChartBars.push({
            index: point.index,
            month: MONTH_LABELS[point.index],
            x: point.x,
            y: point.y,
            left: point.x - (barWidth / 2),
            right: point.x + (barWidth / 2),
            bottom: zeroY,
            data: point.data
        });
    });
}

function hideAgencyChartTooltip() {
    if (agencyChartTooltip) agencyChartTooltip.hidden = true;
}

function showAgencyChartTooltip(bar) {
    if (!agencyChartTooltip || !bar) return;

    agencyChartTooltip.innerHTML = `
        <div><span>Success Rate</span><b>${formatWeightedScore(bar.data.success, 50)}</b></div>
        <div><span>Brief Alignment</span><b>${formatWeightedScore(bar.data.alignment, 30)}</b></div>
        <div><span>On-Time Delivery</span><b>${formatWeightedScore(bar.data.delivery, 20)}</b></div>
        <div><span>Final Score</span><b>${formatScore(bar.data.score)}</b></div>
    `;
    agencyChartTooltip.style.left = `${bar.x}px`;
    agencyChartTooltip.style.top = `${bar.y}px`;
    agencyChartTooltip.hidden = false;
}

function handleAgencyChartHover(event) {
    if (!agencyPerformanceChart) return;
    const rect = agencyPerformanceChart.getBoundingClientRect();
    const scaleX = agencyPerformanceChart.clientWidth / rect.width;
    const scaleY = agencyPerformanceChart.clientHeight / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    const hoveredBar = agencyChartBars.find((bar) => (
        x >= bar.left - 6
        && x <= bar.right + 6
        && y >= bar.y - 18
        && y <= bar.bottom
    ));

    if (!hoveredBar) {
        hideAgencyChartTooltip();
        return;
    }

    showAgencyChartTooltip(hoveredBar);
}

function renderAgencyPerformance(ownCampaigns) {
    if (agencyScoreYear) agencyScoreYear.textContent = String(selectedPerformanceYear);
    const score = currentAgencyYearScore(ownCampaigns);
    if (currentAgencyScore) {
        currentAgencyScore.textContent = `Performance Score: ${score === null ? "Not ready" : `${score.toFixed(1)}%`}`;
        currentAgencyScore.style.borderColor = scoreColor(score);
        currentAgencyScore.style.color = scoreColor(score);
    }
    drawAgencyPerformanceChart(monthlyAgencyScores(ownCampaigns, selectedPerformanceYear));
}

function renderPage(ownCampaigns, allAgencies, allCampaigns) {
    latestOwnCampaigns = ownCampaigns;
    latestAllAgencies = allAgencies;
    latestAllCampaigns = allCampaigns;
    const feedback = collectFeedback(recentSubmissionCampaigns(ownCampaigns, selectedSubmissionLimit));
    const themes = summarizeThemes(feedback);
    const metrics = buildAgencyMetrics(allAgencies, allCampaigns);

    renderAgencyPerformance(ownCampaigns);
    renderThemes(themes);
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

agencyScorePrevYear?.addEventListener("click", () => {
    selectedPerformanceYear -= 1;
    renderAgencyPerformance(latestOwnCampaigns);
});

agencyScoreNextYear?.addEventListener("click", () => {
    selectedPerformanceYear += 1;
    renderAgencyPerformance(latestOwnCampaigns);
});

agencyChartShell?.addEventListener("mousemove", handleAgencyChartHover);
agencyChartShell?.addEventListener("mouseleave", hideAgencyChartTooltip);

submissionFilter?.addEventListener("change", () => {
    selectedSubmissionLimit = Number(submissionFilter.value || 5);
    renderPage(latestOwnCampaigns, latestAllAgencies, latestAllCampaigns);
});

window.addEventListener("resize", () => {
    hideAgencyChartTooltip();
    renderAgencyPerformance(latestOwnCampaigns);
});

loadFeedbackInsights();
