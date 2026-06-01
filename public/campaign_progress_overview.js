const role = localStorage.getItem("role") || "";
const userId = localStorage.getItem("userId") || "";

const statusBars = document.getElementById("statusBars");
const campaignTableBody = document.getElementById("campaignTableBody");
const campaignTableHeadRow = document.getElementById("campaignTableHeadRow");
const filterButtons = document.querySelectorAll(".filter-btn");
const productPerformanceChartEl = document.getElementById("productPerformanceChart");
const performanceChartEmpty = document.getElementById("performanceChartEmpty");
const analyticsYearEl = document.getElementById("analyticsYear");
const previousYearBtn = document.getElementById("previousYearBtn");
const nextYearBtn = document.getElementById("nextYearBtn");

let campaigns = [];
let activeFilter = "All";
let productPerformanceChart = null;
let selectedAnalyticsYear = new Date().getFullYear();

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PRODUCT_COLORS = [
    "#003a8f",
    "#177245",
    "#d99a18",
    "#b42318",
    "#7a2fb8",
    "#008c95",
    "#d14900",
    "#475467"
];

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

function toTimestamp(value) {
    const time = new Date(value || "").getTime();
    return Number.isNaN(time) ? 0 : time;
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

function campaignHealth(campaign) {
    const decisionStatus = normalizeCampaignStatus(campaign.status);
    const allCreatives = Array.isArray(campaign.creativeAssets) ? campaign.creativeAssets : [];
    const latestCreatives = latestCreativeAssets(allCreatives);
    const creativeStatuses = latestCreatives.map((asset) => normalizeCreativeStatus(asset.reviewStatus));
    const approvedCreativeCount = allCreatives.filter((asset) => normalizeCreativeStatus(asset.reviewStatus) === "Approved").length;

    if (decisionStatus === "Declined") {
        return {
            status: "Declined",
            progress: 0,
            approvals: "Campaign declined",
            nextAction: campaign.rejectionReason ? "Review rejection reason" : "Revise campaign brief"
        };
    }

    if (decisionStatus === "Pending") {
        return {
            status: "Pending",
            progress: 25,
            approvals: "Awaiting agency decision",
            nextAction: "Follow up with agency"
        };
    }

    if (approvedCreativeCount > 0) {
        return {
            status: "Approved",
            progress: 100,
            approvals: `${approvedCreativeCount} creative approved`,
            nextAction: "Ready for final rollout"
        };
    }

    if (!latestCreatives.length) {
        return {
            status: "In Progress",
            progress: 45,
            approvals: "Agency accepted",
            nextAction: "Await creative upload"
        };
    }

    if (creativeStatuses.includes("Changes Requested")) {
        return {
            status: "Changes Requested",
            progress: 65,
            approvals: `${creativeStatuses.filter((status) => status === "Approved").length}/${creativeStatuses.length} approved`,
            nextAction: "Track revised creative"
        };
    }

    return {
        status: "In Progress",
        progress: 70,
        approvals: `${creativeStatuses.filter((status) => status === "Approved").length}/${creativeStatuses.length} approved`,
        nextAction: "Creative review pending"
    };
}

function statusClass(status) {
    return String(status || "")
        .toLowerCase()
        .replace(/\s+/g, "-");
}

function formatDate(dateString) {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric"
    }).format(date);
}

function formatTimeline(campaign) {
    const start = formatDate(campaign.startDate);
    const end = formatDate(campaign.endDate);
    if (start === "-" && end === "-") return "-";
    if (start === "-") return `Until ${end}`;
    if (end === "-") return `From ${start}`;
    return `${start} - ${end}`;
}

function campaignMonthIndex(campaign) {
    const timestamp = toTimestamp(campaign.endDate) || toTimestamp(campaign.startDate) || toTimestamp(campaign.createdAt);
    if (!timestamp) return -1;
    return new Date(timestamp).getMonth();
}

function campaignYear(campaign) {
    const timestamp = toTimestamp(campaign.endDate) || toTimestamp(campaign.startDate) || toTimestamp(campaign.createdAt);
    if (!timestamp) return null;
    return new Date(timestamp).getFullYear();
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
    const successRate = (reachRate + objective) / 2;
    return Math.max(0, Math.min(100, successRate));
}

function successRateClass(rate) {
    if (rate === null) return "empty";
    if (rate >= 90) return "green";
    if (rate >= 70) return "yellow";
    if (rate >= 50) return "orange";
    return "red";
}

function formatSuccessRate(rate) {
    return rate === null ? "Not entered" : `${rate.toFixed(1)}%`;
}

function displayStatus(status) {
    return status === "Pending" ? "To-Be-Accepted" : status;
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
    }).sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt));
}

function countByStatus(list) {
    return list.reduce((counts, campaign) => {
        const health = campaignHealth(campaign);
        counts[health.status] = (counts[health.status] || 0) + 1;
        return counts;
    }, {});
}

function renderSummary() {
}

function renderAnalyticsYear() {
    if (analyticsYearEl) analyticsYearEl.textContent = String(selectedAnalyticsYear);
}

function renderStatusBars() {
    const labels = ["Pending", "In Progress", "Changes Requested", "Approved", "Declined"];
    const counts = countByStatus(campaigns);
    const total = Math.max(campaigns.length, 1);

    statusBars.innerHTML = labels.map((label) => {
        const count = counts[label] || 0;
        const percent = Math.round((count / total) * 100);
        const displayLabel = label === "Pending" ? "To-Be-Accepted" : label;
        return `
            <div class="status-row">
                <span>${escapeHtml(displayLabel)}</span>
                <div class="bar-track" aria-hidden="true">
                    <div class="bar-fill ${escapeHtml(statusClass(label))}" style="width:${percent}%"></div>
                </div>
                <span>${count}</span>
            </div>
        `;
    }).join("");
}

function buildPerformanceDatasets() {
    const productMonthMap = new Map();

    campaigns.forEach((campaign) => {
        const successRate = campaignSuccessRate(campaign);
        const monthIndex = campaignMonthIndex(campaign);
        const year = campaignYear(campaign);
        const productName = String(campaign.productName || "Unassigned Product").trim() || "Unassigned Product";

        if (successRate === null || monthIndex < 0 || year !== selectedAnalyticsYear) return;

        if (!productMonthMap.has(productName)) {
            productMonthMap.set(productName, MONTH_LABELS.map(() => ({ total: 0, count: 0 })));
        }

        const bucket = productMonthMap.get(productName)[monthIndex];
        bucket.total += successRate;
        bucket.count += 1;
    });

    return Array.from(productMonthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([productName, monthBuckets], index) => {
            const color = PRODUCT_COLORS[index % PRODUCT_COLORS.length];
            const counts = monthBuckets.map((bucket) => bucket.count);

            return {
                label: productName,
                data: monthBuckets.map((bucket) => (
                    bucket.count ? Number((bucket.total / bucket.count).toFixed(1)) : null
                )),
                monthlyCounts: counts,
                borderColor: color,
                backgroundColor: color,
                pointBackgroundColor: color,
                pointBorderColor: color,
                pointBorderWidth: 1,
                pointRadius: 3,
                pointHoverRadius: 5,
                borderWidth: 3,
                tension: 0.28,
                spanGaps: true,
                clip: false
            };
        });
}

function renderPerformanceChart() {
    if (!productPerformanceChartEl || typeof Chart === "undefined") {
        if (performanceChartEmpty) {
            performanceChartEmpty.hidden = false;
            performanceChartEmpty.textContent = "Performance chart is unavailable.";
        }
        return;
    }

    const datasets = buildPerformanceDatasets();
    const hasData = datasets.some((dataset) => dataset.data.some((value) => value !== null));

    if (performanceChartEmpty) {
        performanceChartEmpty.hidden = true;
        performanceChartEmpty.textContent = "";
    }

    if (productPerformanceChart) {
        productPerformanceChart.destroy();
    }

    productPerformanceChart = new Chart(productPerformanceChartEl, {
        type: "line",
        data: {
            labels: MONTH_LABELS,
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: "nearest",
                intersect: false
            },
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        usePointStyle: true,
                        boxWidth: 8,
                        color: "#342020",
                        font: {
                            size: 12,
                            weight: "700"
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label(context) {
                            const count = context.dataset.monthlyCounts?.[context.dataIndex] || 0;
                            const value = Number(context.parsed.y || 0).toFixed(1);
                            const campaignLabel = count === 1 ? "campaign" : "campaigns";
                            return `${context.dataset.label}: ${value}% (${count} ${campaignLabel})`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: "#5f5b5b",
                        font: {
                            weight: "700"
                        }
                    }
                },
                y: {
                    min: 0,
                    max: 100,
                    ticks: {
                        stepSize: 20,
                        color: "#5f5b5b",
                        callback(value) {
                            return `${value}%`;
                        }
                    },
                    title: {
                        display: true,
                        text: "Success Rate",
                        color: "#5f5b5b",
                        font: {
                            weight: "700"
                        }
                    },
                    grid: {
                        color: "rgba(215, 224, 236, 0.85)"
                    }
                }
            }
        }
    });
}

function showSuccessRateColumn() {
    return activeFilter === "Approved";
}

function showStatusColumn() {
    return activeFilter === "All";
}

function renderCampaignTableHeader() {
    if (!campaignTableHeadRow) return;
    const table = campaignTableHeadRow.closest("table");
    table?.classList.toggle("has-status-column", showStatusColumn());
    table?.classList.toggle("has-success-column", showSuccessRateColumn());

    campaignTableHeadRow.innerHTML = `
        <th>Campaign</th>
        <th>Product</th>
        <th>Agency</th>
        ${showStatusColumn() ? '<th class="status-column">Status</th>' : ""}
        ${showSuccessRateColumn() ? '<th class="success-column">Success Rate</th>' : ""}
        <th>Timeline</th>
    `;
}

function renderCampaignTable() {
    renderCampaignTableHeader();

    const visibleCampaigns = campaigns.filter((campaign) => {
        if (activeFilter === "All") return true;
        return campaignHealth(campaign).status === activeFilter;
    });

    const columnCount = 4 + (showStatusColumn() ? 1 : 0) + (showSuccessRateColumn() ? 1 : 0);

    if (!visibleCampaigns.length) {
        campaignTableBody.innerHTML = `<tr><td colspan="${columnCount}"><div class="empty-state">No campaigns found for this view.</div></td></tr>`;
        return;
    }

    campaignTableBody.innerHTML = "";
    visibleCampaigns.forEach((campaign) => {
        const health = campaignHealth(campaign);
        const successRate = campaignSuccessRate(campaign);
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
            ${showStatusColumn() ? `<td class="status-column"><span class="status-pill ${escapeHtml(statusClass(health.status))}">${escapeHtml(displayStatus(health.status))}</span></td>` : ""}
            ${showSuccessRateColumn() ? `<td class="success-column">
                <span class="success-rate-pill ${escapeHtml(successRateClass(successRate))}">${escapeHtml(formatSuccessRate(successRate))}</span>
            </td>` : ""}
            <td class="muted-cell">${escapeHtml(formatTimeline(campaign))}</td>
        `;
        row.addEventListener("click", () => openCampaign(campaign));
        campaignTableBody.appendChild(row);
    });
}

function renderPage() {
    renderSummary();
    renderAnalyticsYear();
    renderStatusBars();
    renderPerformanceChart();
    renderCampaignTable();
}

async function loadOverview() {
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
        campaignTableBody.innerHTML = `<tr><td colspan="5"><div class="empty-state">${escapeHtml(err.message || "Could not load campaign overview.")}</div></td></tr>`;
        statusBars.innerHTML = "";
        if (performanceChartEmpty) performanceChartEmpty.hidden = false;
    }
}

filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
        activeFilter = button.dataset.filter || "All";
        filterButtons.forEach((item) => item.classList.toggle("active", item === button));
        renderCampaignTable();
    });
});

previousYearBtn?.addEventListener("click", () => {
    selectedAnalyticsYear -= 1;
    renderAnalyticsYear();
    renderPerformanceChart();
});

nextYearBtn?.addEventListener("click", () => {
    selectedAnalyticsYear += 1;
    renderAnalyticsYear();
    renderPerformanceChart();
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
    loadOverview();
}
