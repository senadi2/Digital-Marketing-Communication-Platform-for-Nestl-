const campaignList = document.getElementById("campaignList");
const notificationBell = document.getElementById("notificationBell");
const notificationPanel = document.getElementById("notificationPanel");
const notificationList = document.getElementById("notificationList");
const notificationCount = document.getElementById("notificationCount");
const logoutBtn = document.querySelector(".logout");
const DEFAULT_IMAGE = "/api/media/campaign-image?seed=campaign-default&title=Nestle%20Campaign";

const agencyId = localStorage.getItem("agencyId") || "";

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

async function updateCampaignStatus(campaignId, status, notificationId) {
    try {
        const res = await fetch(`/api/campaigns/${campaignId}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status, agencyId })
        });

        const data = await res.json();
        if (!res.ok) {
            alert(data.message || "Failed to update campaign");
            return;
        }

        await markNotificationRead(notificationId);
        await Promise.all([loadCampaigns(), loadNotifications()]);
    } catch (err) {
        console.error(err);
        alert("Error updating campaign status");
    }
}

async function fetchCampaignImage(campaign) {
    const cacheKey = `campaign-image-${campaign._id}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached && cached.startsWith("/api/media/campaign-image")) {
        return cached;
    }

    const generatedUrl = `/api/media/campaign-image?seed=${encodeURIComponent(campaign._id || Date.now())}&title=${encodeURIComponent(campaign.title || "Campaign")}`;
    localStorage.setItem(cacheKey, generatedUrl);
    return generatedUrl;
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
        const value = localStorage.getItem(key) || "";
        if (!value.startsWith("/api/media/campaign-image")) {
            localStorage.removeItem(key);
        }
    });
}

async function renderCampaigns(campaigns) {
    campaignList.innerHTML = "";

    if (!campaigns.length) {
        campaignList.innerHTML = `<div class="campaign-card"><div class="campaign-card-content"><h3>No campaigns yet</h3><p>Campaigns assigned to this agency will appear here.</p></div></div>`;
        return;
    }

    const usedImages = new Set();
    for (const c of campaigns) {
        const imageUrl = await fetchCampaignImage(c);
        const uniqueImage = usedImages.has(imageUrl)
            ? `/api/media/campaign-image?seed=${encodeURIComponent(`campaign-dup-${c._id}-${Date.now()}`)}&title=${encodeURIComponent(c.title || "Campaign")}`
            : imageUrl;
        usedImages.add(uniqueImage);
        const card = document.createElement("div");
        card.className = "campaign-card";

        card.innerHTML = `
            <div class="campaign-card-content">
                <h3>${escapeHtml(c.title)}</h3>
                <img src="${escapeHtml(uniqueImage || DEFAULT_IMAGE)}" alt="${escapeHtml(c.title)} campaign image">
                <p><strong>Timeline:</strong> ${escapeHtml(c.startDate)} to ${escapeHtml(c.endDate)}</p>
                <p><strong>Budget:</strong> ${escapeHtml(c.budgetRange)}</p>
            </div>
        `;
        const imgEl = card.querySelector("img");
        imgEl.addEventListener("error", () => {
            imgEl.src = `/api/media/campaign-image?seed=${encodeURIComponent(`campaign-card-${c._id || Date.now()}`)}&title=${encodeURIComponent(c.title || "Campaign")}`;
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

        const isPendingRequest = note.type === "campaign_request" && String(note.status || "").toLowerCase() === "pending";
        item.innerHTML = `
            <div>${escapeHtml(note.message)}</div>
            ${isPendingRequest ? `
                <div class="notification-actions">
                    <button class="accept-btn" data-campaign-id="${escapeHtml(note.campaignId)}" data-notification-id="${escapeHtml(note._id)}">Accept</button>
                    <button class="decline-btn" data-campaign-id="${escapeHtml(note.campaignId)}" data-notification-id="${escapeHtml(note._id)}">Decline</button>
                </div>
            ` : ""}
        `;

        if (isPendingRequest) {
            const acceptBtn = item.querySelector(".accept-btn");
            const declineBtn = item.querySelector(".decline-btn");

            acceptBtn.addEventListener("click", () => {
                updateCampaignStatus(acceptBtn.dataset.campaignId, "Accepted", acceptBtn.dataset.notificationId);
            });

            declineBtn.addEventListener("click", () => {
                updateCampaignStatus(declineBtn.dataset.campaignId, "Decline", declineBtn.dataset.notificationId);
            });
        }

        notificationList.appendChild(item);
    });
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

notificationBell?.addEventListener("click", () => {
    notificationPanel.classList.toggle("open");
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
loadCampaigns();
loadNotifications();
setInterval(loadNotifications, 30000);
