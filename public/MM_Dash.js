const agencyList = document.getElementById("agencyList");
const form = document.getElementById("agencyForm");
const formMessage = document.getElementById("formMessage");
const viewMoreBtn = document.querySelector(".viewMore");
const notificationBell = document.getElementById("notificationBell");
const notificationPanel = document.getElementById("notificationPanel");
const notificationList = document.getElementById("notificationList");
const notificationCount = document.getElementById("notificationCount");

const DEFAULT_IMAGE = "/api/media/agency-image?seed=default&name=Agency";
const mmUserId = localStorage.getItem("userId") || "";

let allAgencies = [];
let currentIndex = 0;
const agenciesPerPage = 3;

async function fetchAgencyImage(query = "agency office marketing") {
    return getUniqueFallbackImage(`agency-${query}-${Date.now()}`);
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

function createAgencyCard(agency) {
    const card = document.createElement("div");
    card.className = "agency-card";

    const img = document.createElement("img");
    img.src = agency.displayImageUrl || agency.imageUrl || DEFAULT_IMAGE;
    img.alt = agency.name;
    img.addEventListener("error", () => {
        img.src = getUniqueFallbackImage(`agency-img-${agency._id || agency.name || Date.now()}`);
    }, { once: true });

    const name = document.createElement("h3");
    name.textContent = agency.name;

    card.appendChild(img);
    card.appendChild(name);

    card.addEventListener("click", () => {
        window.location.href = `create_brief.html?agencyId=${agency._id}`;
    });

    agencyList.appendChild(card);
}

function getUniqueFallbackImage(seedValue) {
    return `/api/media/agency-image?seed=${encodeURIComponent(seedValue)}&name=${encodeURIComponent("Agency Partner")}`;
}

function hydrateAgencyImages(agencies) {
    const used = new Set();

    return agencies.map(agency => {
        let resolvedUrl = agency.imageUrl || "";
        if (!resolvedUrl || used.has(resolvedUrl)) {
            resolvedUrl = getUniqueFallbackImage(`agency-${agency.name}-${agency._id || Date.now()}`);
        }
        used.add(resolvedUrl);
        return { ...agency, displayImageUrl: resolvedUrl };
    });
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
            <div class="notification-row">
                <div>${escapeHtml(note.message)}</div>
                <button class="notification-clear" data-note-id="${escapeHtml(note._id)}" aria-label="Clear notification">X</button>
            </div>
            <div class="notification-time">${formatDate(note.createdAt)}</div>
        `;
        const clearBtn = item.querySelector(".notification-clear");
        clearBtn.addEventListener("click", () => clearNotification(note._id));
        notificationList.appendChild(item);
    });
}

async function loadNotifications() {
    if (!mmUserId) {
        notificationCount.textContent = "0";
        notificationList.innerHTML = `<div class="notification-item">No notifications yet.</div>`;
        return;
    }
    try {
        const res = await fetch(`/api/notifications?userId=${encodeURIComponent(mmUserId)}`);
        const notes = await res.json();
        renderNotifications(Array.isArray(notes) ? notes : []);
    } catch {
        renderNotifications([]);
    }
}

async function clearNotification(notificationId) {
    if (!notificationId) return;
    try {
        await fetch(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
            method: "PATCH"
        });
        await loadNotifications();
    } catch (err) {
        console.error(err);
    }
}

async function showMoreAgencies() {
    const nextIndex = currentIndex + agenciesPerPage;
    for (let i = currentIndex; i < nextIndex && i < allAgencies.length; i++) {
        createAgencyCard(allAgencies[i]);
    }

    currentIndex = nextIndex;
    viewMoreBtn.style.display = currentIndex < allAgencies.length ? "block" : "none";
}

async function loadAgencies() {
    try {
        const res = await fetch("/api/agencies");
        const agencies = await res.json();
        allAgencies = hydrateAgencyImages(Array.isArray(agencies) ? agencies : []);
        agencyList.innerHTML = "";
        currentIndex = 0;
        showMoreAgencies();
    } catch (err) {
        console.error(err);
    }
}

viewMoreBtn.addEventListener("click", showMoreAgencies);

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("agencyName").value.trim();
    const contactPerson = document.getElementById("contactPerson").value.trim();
    const phoneNumber = document.getElementById("phoneNumber").value.trim();
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const description = document.getElementById("description").value.trim();

    const formData = { name, contactPerson, phoneNumber, username, password, description };
    if (Object.values(formData).some(v => !v)) {
        setMessage("Please fill all fields", "error");
        return;
    }

    try {
        const existingUrls = new Set(allAgencies.map(a => a.displayImageUrl || a.imageUrl).filter(Boolean));
        let imageUrl = "";

        for (let i = 0; i < 5; i++) {
            const candidate = await fetchAgencyImage(`${name} advertising office`);
            if (!existingUrls.has(candidate)) {
                imageUrl = candidate;
                break;
            }
        }

        if (!imageUrl) {
            imageUrl = getUniqueFallbackImage(`agency-${name}-${Date.now()}`);
        }

        const payload = { ...formData, imageUrl };

        const res = await fetch("/api/agencies", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) {
            setMessage(data.message || "Failed to create agency", "error");
            return;
        }

        if (data.agency) {
            allAgencies = hydrateAgencyImages([data.agency, ...allAgencies]);
            agencyList.innerHTML = "";
            currentIndex = 0;
            showMoreAgencies();
        }

        setMessage("Agency created successfully!", "success");
        setTimeout(closeModal, 1200);
    } catch {
        setMessage("Server error", "error");
    }
});

function setMessage(message, type) {
    formMessage.textContent = message;
    formMessage.className = `form-message ${type}`;
}

window.openModal = () => {
    document.getElementById("agencyModal").style.display = "flex";
};

window.closeModal = () => {
    document.getElementById("agencyModal").style.display = "none";
    form.reset();
    setMessage("", "");
};

let slides = document.querySelectorAll(".slide");
let index = 0;
function showSlides() {
    slides.forEach(slide => slide.classList.remove("active"));
    index++;
    if (index > slides.length) index = 1;
    slides[index - 1].classList.add("active");
}
setInterval(showSlides, 5000);

window.logout = () => {
    localStorage.clear();
    window.location.href = "/LOGIN.html";
};

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

loadAgencies();
loadNotifications();
setInterval(loadNotifications, 30000);
