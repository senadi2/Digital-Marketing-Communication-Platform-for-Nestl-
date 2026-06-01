const productList = document.getElementById("productList");
const agencyList = document.getElementById("agencyList");
const productForm = document.getElementById("productForm");
const agencyForm = document.getElementById("agencyForm");
const productFormMessage = document.getElementById("productFormMessage");
const formMessage = document.getElementById("formMessage");
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
const DEFAULT_AGENCY_IMAGE = "Images/agency_images/agency1.jpg";
const DEFAULT_PRODUCT_IMAGE = "Images/logo_nobackground.png";
const mmUserId = localStorage.getItem("userId") || "";
const AGENCY_EMAIL_DOMAIN = "@aanestle.com";

let allProducts = [];
let allAgencies = [];
let currentProductIndex = 0;
let currentAgencyIndex = 0;
const itemsPerPage = 3;

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatDate(isoDate) {
    if (!isoDate) return "";
    return new Date(isoDate).toLocaleString();
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

function agencyImage(index) {
    const safeIndex = Math.max(0, Number(index || 0));
    return `Images/agency_images/${AGENCY_IMAGE_FILES[safeIndex % AGENCY_IMAGE_FILES.length]}`;
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

function createAgencyCard(agency) {
    const card = document.createElement("div");
    card.className = "agency-card";
    card.innerHTML = `
        <img src="${escapeHtml(agency.displayImageUrl || DEFAULT_AGENCY_IMAGE)}" alt="${escapeHtml(agency.name || "Agency")}">
        <h3>${escapeHtml(agency.name || "Unnamed Agency")}</h3>
        <p class="card-meta">${escapeHtml(agency.description || "Agency partner")}</p>
    `;
    card.querySelector("img").addEventListener("error", (event) => {
        event.currentTarget.src = DEFAULT_AGENCY_IMAGE;
    }, { once: true });
    card.addEventListener("click", () => {
        window.location.href = `create_brief.html?agencyId=${encodeURIComponent(agency._id)}`;
    });
    agencyList.appendChild(card);
}

function showMoreProducts() {
    const nextIndex = currentProductIndex + itemsPerPage;
    for (let i = currentProductIndex; i < nextIndex && i < allProducts.length; i++) {
        createProductCard(allProducts[i]);
    }
    currentProductIndex = nextIndex;
    viewMoreProductsBtn.style.display = currentProductIndex < allProducts.length ? "block" : "none";
}

function showMoreAgencies() {
    const nextIndex = currentAgencyIndex + itemsPerPage;
    for (let i = currentAgencyIndex; i < nextIndex && i < allAgencies.length; i++) {
        createAgencyCard(allAgencies[i]);
    }
    currentAgencyIndex = nextIndex;
    viewMoreBtn.style.display = currentAgencyIndex < allAgencies.length ? "block" : "none";
}

async function loadProducts() {
    try {
        const res = await fetch("/api/products");
        const products = await res.json();
        allProducts = Array.isArray(products) ? products : [];
        productList.innerHTML = "";
        currentProductIndex = 0;
        showMoreProducts();
    } catch (err) {
        console.error(err);
    }
}

async function loadAgencies() {
    try {
        const res = await fetch("/api/agencies");
        const agencies = await res.json();
        allAgencies = (Array.isArray(agencies) ? agencies : []).map((agency, index) => ({
            ...agency,
            displayImageUrl: agencyImage(index)
        }));
        agencyList.innerHTML = "";
        currentAgencyIndex = 0;
        showMoreAgencies();
    } catch (err) {
        console.error(err);
    }
}

function renderNotifications(notes) {
    const unread = notes.filter(note => !note.read).length;
    notificationCount.textContent = String(unread);

    if (!unread) {
        notificationList.innerHTML = `<div class="notification-item">No new notifications.</div>`;
        return;
    }

    notificationList.innerHTML = "";
    notes.filter(note => !note.read).forEach(note => {
        const item = document.createElement("div");
        item.className = "notification-item";
        item.innerHTML = `
            <div class="notification-row">
                <div>${escapeHtml(note.message)}</div>
                <button class="notification-clear" data-note-id="${escapeHtml(note._id)}" aria-label="Clear notification">X</button>
            </div>
            <div class="notification-time">${formatDate(note.createdAt)}</div>
        `;
        item.querySelector(".notification-clear").addEventListener("click", () => clearNotification(note._id));
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
    await fetch(`/api/notifications/${encodeURIComponent(notificationId)}/read`, { method: "PATCH" });
    await loadNotifications();
}

async function clearAllNotifications() {
    if (!mmUserId) return;
    await fetch("/api/notifications/read-all", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: mmUserId })
    });
    await loadNotifications();
}

function setProductMessage(message, type) {
    productFormMessage.textContent = message;
    productFormMessage.className = `form-message ${type}`;
}

function setAgencyMessage(message, type) {
    formMessage.textContent = message;
    formMessage.className = `form-message ${type}`;
}

productForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
        name: document.getElementById("productName").value.trim(),
        category: document.getElementById("productCategory").value.trim()
    };

    if (Object.values(payload).some(value => !value)) {
        setProductMessage("Please fill all product fields", "error");
        return;
    }

    try {
        const res = await fetch("/api/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
            setProductMessage(data.message || "Failed to create product", "error");
            return;
        }
        closeProductModal();
        await loadProducts();
    } catch {
        setProductMessage("Server error", "error");
    }
});

agencyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = document.getElementById("agencyName").value.trim();
    const contactPerson = document.getElementById("contactPerson").value.trim();
    const phoneNumber = document.getElementById("phoneNumber").value.trim();
    const username = document.getElementById("username").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const description = document.getElementById("description").value.trim();

    if (!name || !contactPerson || !phoneNumber || !username || !password || !description) {
        setAgencyMessage("Please fill all fields", "error");
        return;
    }
    if (!username.endsWith(AGENCY_EMAIL_DOMAIN)) {
        setAgencyMessage(`Agency email must end with ${AGENCY_EMAIL_DOMAIN}`, "error");
        return;
    }

    try {
        const res = await fetch("/api/agencies", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, contactPerson, phoneNumber, username, password, description })
        });
        const data = await res.json();
        if (!res.ok) {
            setAgencyMessage(data.message || "Failed to create agency", "error");
            return;
        }
        closeModal();
        await loadAgencies();
    } catch {
        setAgencyMessage("Server error", "error");
    }
});

window.openProductModal = () => {
    document.getElementById("productModal").style.display = "flex";
};

window.closeProductModal = () => {
    document.getElementById("productModal").style.display = "none";
    productForm.reset();
    setProductMessage("", "");
};

window.openAgencyModal = () => {
    document.getElementById("agencyModal").style.display = "flex";
};

window.openModal = window.openAgencyModal;

window.closeModal = () => {
    document.getElementById("agencyModal").style.display = "none";
    agencyForm.reset();
    setAgencyMessage("", "");
};

let slides = document.querySelectorAll(".slide");
let index = 0;
function showSlides() {
    slides.forEach(slide => slide.classList.remove("active"));
    index += 1;
    if (index > slides.length) index = 1;
    slides[index - 1].classList.add("active");
}
setInterval(showSlides, 3000);

window.logout = () => {
    if (window.AppSession?.logout) {
        window.AppSession.logout("manual");
        return;
    }
    localStorage.clear();
    window.location.href = "/LOGIN.html";
};

viewMoreProductsBtn.addEventListener("click", showMoreProducts);
viewMoreBtn.addEventListener("click", showMoreAgencies);
notificationBell?.addEventListener("click", () => notificationPanel.classList.toggle("open"));
clearAllNotificationsBtn?.addEventListener("click", clearAllNotifications);

document.addEventListener("click", (event) => {
    if (!notificationPanel || !notificationBell) return;
    if (!notificationPanel.contains(event.target) && !notificationBell.contains(event.target)) {
        notificationPanel.classList.remove("open");
    }
});

loadProducts();
loadAgencies();
loadNotifications();
setInterval(loadNotifications, 30000);
