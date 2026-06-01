const campaignList = document.getElementById("campaignList");
const notificationBell = document.getElementById("notificationBell");
const notificationPanel = document.getElementById("notificationPanel");
const notificationList = document.getElementById("notificationList");
const notificationCount = document.getElementById("notificationCount");
const clearAllNotificationsBtn = document.getElementById("clearAllNotificationsBtn");
const logoutBtn = document.querySelector(".logout");
const agencyHeadline = document.getElementById("agencyHeadline");
const CAMPAIGN_IMAGE_FILES = {
    kitkat: ["kitkat1.jpg", "kitkat2.jpg", "kitkat3.jpg", "kitkat4.jpg", "kitkat5.jpg", "kitkat6.webp"],
    maggi: ["maggi1.jpg", "maggi2.jpg", "maggi3.webp", "maggi4.jpg", "maggi5.jpg", "maggi6.jpg"],
    milkmade: ["milkmade1.jpg", "milkmade2.jpg", "milkmade3.jpg", "milkmade4.jpg", "milkmade5.jpg", "milkmade6.avif"],
    milo: ["milo1.jpg", "milo2.jpg", "milo3.jpg", "milo4.jpg", "milo5.jpg", "milo6.jpg"],
    nescafe: ["nescafe1.jpg", "nescafe2.jpg", "nescafe3.jpg", "nescafe4.jpg", "nescafe5.jpg", "nescafe6.jpg"],
    nespray: ["nespray1.jpg", "nespray2.jpg", "nespray3.jpg", "nespray4.jpg", "nespray5.jpg", "nespray6.jpg"],
    nestum: ["nestum1.jpg", "nestum2.jpg", "nestum3.jpg", "nestum4.jpg", "nestum5.jpg", "nestum6.jpg"]
};
const DEFAULT_IMAGE = "Images/campaign_images/milo/milo1.jpg";

const agencyId = localStorage.getItem("agencyId") || "";
const role = localStorage.getItem("role") || "";
const userId = localStorage.getItem("userId") || "";

if (!agencyId) {
    alert("Agency session not found. Please log in again.");
    window.location.href = "/LOGIN.html";
}

function formatDate(isoDate) {
    if (!isoDate) return "";
    return new Date(isoDate).toLocaleString();
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

async function markNotificationRead(notificationId) {
    if (!notificationId) return;
    try {
        await fetch(`/api/notifications/${notificationId}/read`, { method: "PATCH" });
    } catch (err) {
        console.error(err);
    }
}

function campaignProductKey(campaign) {
    const normalized = String(campaign.productName || campaign.product || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/^nestle\s+/, "")
        .replace(/[^a-z0-9]/g, "");
    const aliases = {
        milkmaid: "milkmade",
        nestlekitkat: "kitkat"
    };
    return aliases[normalized] || normalized;
}

function clearLegacyCampaignImageCache() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("campaign-image-")) {
            keys.push(key);
        }
    }

    keys.forEach((key) => {
        localStorage.removeItem(key);
    });
}

function campaignImage(campaign, productIndex) {
    const productKey = campaignProductKey(campaign);
    const files = CAMPAIGN_IMAGE_FILES[productKey] || CAMPAIGN_IMAGE_FILES.milo;
    const safeIndex = Math.max(0, Number(productIndex || 0));
    return `Images/campaign_images/${productKey in CAMPAIGN_IMAGE_FILES ? productKey : "milo"}/${files[safeIndex % files.length]}`;
}

async function renderCampaigns(campaigns) {
    campaignList.innerHTML = "";

    if (!campaigns.length) {
        campaignList.innerHTML = `<div class="campaign-card"><div class="campaign-card-content"><h3>No campaigns yet</h3><p>Campaigns assigned to this agency will appear here.</p></div></div>`;
        return;
    }

    const productImageCounts = {};
    for (const c of campaigns) {
        const productKey = campaignProductKey(c);
        const nextProductIndex = productImageCounts[productKey] || 0;
        productImageCounts[productKey] = nextProductIndex + 1;
        const imageUrl = campaignImage(c, nextProductIndex);
        const card = document.createElement("div");
        card.className = "campaign-card";

        card.innerHTML = `
            <div class="campaign-card-content">
                <h3>${escapeHtml(c.title)}</h3>
                <img src="${escapeHtml(imageUrl || DEFAULT_IMAGE)}" alt="${escapeHtml(c.title)} campaign image">
                <p><strong>Campaign Type:</strong> ${escapeHtml(c.campaignType || "-")}</p>
                <p><strong>Timeline:</strong> ${escapeHtml(c.startDate)} to ${escapeHtml(c.endDate)}</p>
                <p><strong>Budget:</strong> ${escapeHtml(c.budgetRange)}</p>
            </div>
        `;
        const imgEl = card.querySelector("img");
        imgEl.addEventListener("error", () => {
            imgEl.src = DEFAULT_IMAGE;
        }, { once: true });
        card.addEventListener("click", () => {
            window.location.href = `campaign_detail.html?campaignId=${encodeURIComponent(c._id)}`;
        });

        campaignList.appendChild(card);
    }
}

function renderNotifications(notes) {
    const unread = notes.filter(note => !note.read).length;
    notificationCount.textContent = String(unread);

    if (!unread) {
        notificationList.innerHTML = `<div class="notification-item">No new notifications.</div>`;
        return;
    }

    const unreadNotes = notes.filter(note => !note.read);
    notificationList.innerHTML = "";

    unreadNotes.forEach(note => {
        const item = document.createElement("div");
        item.className = "notification-item";
        item.innerHTML = `
            <div>${escapeHtml(note.message)}</div>
            <div class="notification-time">${escapeHtml(formatDate(note.createdAt))}</div>
        `;

        notificationList.appendChild(item);
    });
}

async function loadAgencyHeadline() {
    if (!agencyId || !agencyHeadline) return;
    try {
        const res = await fetch(`/api/agencies/${encodeURIComponent(agencyId)}`);
        const agency = await res.json();
        if (!res.ok) throw new Error(agency.message || "Failed to load agency");

        agencyHeadline.textContent = String(agency.name || "Agency");
    } catch (err) {
        console.error(err);
        agencyHeadline.textContent = "Agency";
    }
}

async function loadCampaigns() {
    if (!agencyId) return;
    try {
        const res = await fetch(`/api/campaigns?agencyId=${encodeURIComponent(agencyId)}`);
        const campaigns = await res.json();
        await renderCampaigns(Array.isArray(campaigns) ? campaigns : []);
    } catch (err) {
        console.error(err);
        await renderCampaigns([]);
    }
}

async function loadNotifications() {
    if (!agencyId) return;
    try {
        const res = await fetch(`/api/notifications?userId=${encodeURIComponent(agencyId)}`);
        const notes = await res.json();
        renderNotifications(Array.isArray(notes) ? notes : []);
    } catch (err) {
        console.error(err);
        renderNotifications([]);
    }
}

async function clearAllNotifications() {
    if (!agencyId) return;
    try {
        await fetch("/api/notifications/read-all", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: agencyId })
        });
        await loadNotifications();
    } catch (err) {
        console.error(err);
    }
}

notificationBell?.addEventListener("click", () => {
    notificationPanel.classList.toggle("open");
});

clearAllNotificationsBtn?.addEventListener("click", () => {
    clearAllNotifications();
});

document.addEventListener("click", (event) => {
    if (!notificationPanel || !notificationBell) return;
    const clickInsidePanel = notificationPanel.contains(event.target);
    const clickOnBell = notificationBell.contains(event.target);
    if (!clickInsidePanel && !clickOnBell) {
        notificationPanel.classList.remove("open");
    }
});

logoutBtn?.addEventListener("click", () => {
    if (window.AppSession?.logout) {
        window.AppSession.logout("manual");
        return;
    }
    localStorage.clear();
    window.location.href = "/LOGIN.html";
});

clearLegacyCampaignImageCache();
loadAgencyHeadline();
loadCampaigns();
loadNotifications();
setInterval(loadNotifications, 30000);

if (window.initAgencyChat) {
    window.initAgencyChat({
        triggerId: "agencyChatTrigger",
        agencyId,
        userId,
        role
    });
}
