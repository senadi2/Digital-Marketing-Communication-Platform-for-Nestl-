const productList = document.getElementById("productList");
const agencyList = document.getElementById("agencyList");
const viewMoreBtn = document.querySelector(".viewMore");
const viewMoreProductsBtn = document.querySelector(".viewMoreProducts");
const notificationBell = document.getElementById("notificationBell");
const notificationPanel = document.getElementById("notificationPanel");
const notificationList = document.getElementById("notificationList");
const notificationCount = document.getElementById("notificationCount");
const clearAllNotificationsBtn = document.getElementById("clearAllNotificationsBtn");

const AGENCY_IMAGE_FILES = [
    "agency1.jpg",
    "agency2.avif",
    "agency3.avif",
    "agency4.avif",
    "agency5.avif",
    "agency6.avif",
    "agency7.avif",
    "agency8.avif",
    "agency9.avif",
    "agency10.avif"
];
const DEFAULT_IMAGE = "Images/agency_images/agency1.jpg";
const DEFAULT_PRODUCT_IMAGE = "Images/logo_nobackground.png";
const brandManagerUserId = localStorage.getItem("userId") || "";
let allProducts = [];
let allAgencies = [];
let currentIndex = 0;
let currentProductIndex = 0;
const agenciesPerPage = 3;
const productsPerPage = 3;
const slides = document.querySelectorAll(".slide");

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

function agencyImage(index) {
    const safeIndex = Math.max(0, Number(index || 0));
    return `Images/agency_images/${AGENCY_IMAGE_FILES[safeIndex % AGENCY_IMAGE_FILES.length]}`;
}

function productLogoBase(productName) {
    const normalized = String(productName || "nestle")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/^nestle\s+/, "")
        .replace(/[^a-z0-9]/g, "");
    const aliases = {
        milkmaid: "milkmade"
    };
    return aliases[normalized] || normalized || "nestle";
}

function productImage(product) {
    return `Images/${productLogoBase(product.name)}_logoP.png`;
}

function useNextProductImage(event, productName) {
    const img = event.currentTarget;
    const attempts = Number(img.dataset.logoAttempt || 0);
    const extensions = ["webp", "jpg", "jpeg"];
    if (attempts < extensions.length) {
        img.dataset.logoAttempt = String(attempts + 1);
        img.src = `Images/${productLogoBase(productName)}_logoP.${extensions[attempts]}`;
        return;
    }
    img.src = DEFAULT_PRODUCT_IMAGE;
}

function hydrateAgencyImages(agencies) {
    return agencies.map((agency, index) => ({
        ...agency,
        displayImageUrl: agencyImage(index)
    }));
}

function createAgencyCard(agency) {
    const card = document.createElement("div");
    card.className = "agency-card";

    const img = document.createElement("img");
    img.src = agency.displayImageUrl || agency.imageUrl || DEFAULT_IMAGE;
    img.alt = agency.name;
    img.addEventListener("error", () => {
        img.src = DEFAULT_IMAGE;
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

function createProductCard(product) {
    const card = document.createElement("div");
    card.className = "agency-card";
    card.innerHTML = `
        <img src="${escapeHtml(productImage(product) || DEFAULT_PRODUCT_IMAGE)}" alt="${escapeHtml(product.name || "Product")}">
        <h3>${escapeHtml(product.name || "Unnamed Product")}</h3>
        <p class="card-meta">${escapeHtml(product.category || "Product")} | ${Number(product.campaignCount || 0)} campaign(s)</p>
    `;
    card.querySelector("img").addEventListener("error", (event) => useNextProductImage(event, product.name));
    card.addEventListener("click", () => {
        window.location.href = `create_brief.html?productId=${encodeURIComponent(product._id)}`;
    });
    productList.appendChild(card);
}

async function showMoreProducts() {
    const nextIndex = currentProductIndex + productsPerPage;
    for (let i = currentProductIndex; i < nextIndex && i < allProducts.length; i++) {
        createProductCard(allProducts[i]);
    }

    currentProductIndex = nextIndex;
    if (viewMoreProductsBtn) {
        viewMoreProductsBtn.style.display = currentProductIndex < allProducts.length ? "block" : "none";
    }
}

async function loadProducts() {
    if (!productList) return;

    try {
        const res = await fetch("/api/products");
        const products = await res.json();
        allProducts = Array.isArray(products) ? products : [];
        productList.innerHTML = "";
        currentProductIndex = 0;
        await showMoreProducts();
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
    if (viewMoreBtn) {
        viewMoreBtn.style.display = currentIndex < allAgencies.length ? "block" : "none";
    }
}

async function loadAgencies() {
    if (!agencyList) return;

    try {
        const res = await fetch("/api/agencies");
        const agencies = await res.json();
        allAgencies = hydrateAgencyImages(Array.isArray(agencies) ? agencies : []);
        agencyList.innerHTML = "";
        currentIndex = 0;
        await showMoreAgencies();
    } catch (err) {
        console.error(err);
    }
}

function renderNotifications(notes) {
    const unread = notes.filter((note) => !note.read).length;
    notificationCount.textContent = String(unread);

    if (!unread) {
        notificationList.innerHTML = `<div class="notification-item">No new notifications.</div>`;
        return;
    }

    const unreadNotes = notes.filter((note) => !note.read);
    notificationList.innerHTML = "";

    unreadNotes.forEach((note) => {
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
    if (!brandManagerUserId) {
        notificationCount.textContent = "0";
        notificationList.innerHTML = `<div class="notification-item">No notifications yet.</div>`;
        return;
    }
    try {
        const res = await fetch(`/api/notifications?userId=${encodeURIComponent(brandManagerUserId)}`);
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

async function clearAllNotifications() {
    if (!brandManagerUserId) return;
    try {
        await fetch("/api/notifications/read-all", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: brandManagerUserId })
        });
        await loadNotifications();
    } catch (err) {
        console.error(err);
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

notificationBell?.addEventListener("click", () => {
    notificationPanel.classList.toggle("open");
});

clearAllNotificationsBtn?.addEventListener("click", () => {
    clearAllNotifications();
});

viewMoreBtn?.addEventListener("click", showMoreAgencies);
viewMoreProductsBtn?.addEventListener("click", showMoreProducts);

let index = 0;
function showSlides() {
    if (!slides.length) return;
    slides.forEach((slide) => slide.classList.remove("active"));
    index += 1;
    if (index > slides.length) index = 1;
    slides[index - 1].classList.add("active");
}
setInterval(showSlides, 3000);

document.addEventListener("click", (event) => {
    if (!notificationPanel || !notificationBell) return;
    const clickInsidePanel = notificationPanel.contains(event.target);
    const clickOnBell = notificationBell.contains(event.target);
    if (!clickInsidePanel && !clickOnBell) {
        notificationPanel.classList.remove("open");
    }
});

loadProducts();
loadAgencies();
loadNotifications();
setInterval(loadNotifications, 30000);
