const titleEl = document.getElementById("agencyName");
const descriptionEl = document.getElementById("agencyDescription");
const heroImageEl = document.getElementById("agencyImage");
const campaignList = document.getElementById("campaignList");
const campaignBriefModal = document.getElementById("campaignBriefModal");
const openBriefModalBtn = document.getElementById("openBriefModalBtn");
const closeBriefModalBtn = document.getElementById("closeBriefModalBtn");
const campaignBriefForm = document.getElementById("campaignBriefForm");
const briefFormMessage = document.getElementById("briefFormMessage");
const dashboardBackLink = document.getElementById("dashboardBackLink");
const pageEyebrow = document.getElementById("pageEyebrow");
const detailsHeading = document.getElementById("detailsHeading");
const productFacts = document.getElementById("productFacts");
const campaignSectionTitle = document.getElementById("campaignSectionTitle");
const assignedAgencySelect = document.getElementById("assignedAgencyId");
const pageHeaderActions = document.querySelector(".page-header-actions");
let agencyChatTrigger = document.getElementById("agencyChatTrigger");

const params = new URLSearchParams(window.location.search);
const productId = params.get("productId");
const agencyId = params.get("agencyId");
const mmId = localStorage.getItem("userId") || "";
const userId = localStorage.getItem("userId") || "";
const role = localStorage.getItem("role") || "";

let currentProduct = null;
let allAgencies = [];

const DEFAULT_PRODUCT_IMAGE = "Images/logo_nobackground.png";
const canDeleteCampaigns = role === "MarketingManager";

if (dashboardBackLink && role === "BrandManager") {
    dashboardBackLink.href = "BM_dash.html";
}

if (!productId && agencyId && pageHeaderActions && !agencyChatTrigger) {
    agencyChatTrigger = document.createElement("button");
    agencyChatTrigger.type = "button";
    agencyChatTrigger.className = "agency-chat-trigger";
    agencyChatTrigger.id = "agencyChatTrigger";
    agencyChatTrigger.setAttribute("aria-label", "Open agency chat");
    agencyChatTrigger.innerHTML = `<i class="fa-solid fa-comments"></i><span>Chat</span>`;
    pageHeaderActions.prepend(agencyChatTrigger);
}

if (role === "BrandManager" || !productId) {
    openBriefModalBtn.hidden = true;
}

if (!productId && !agencyId) {
    descriptionEl.textContent = "Please go back to the dashboard and select a product.";
    openBriefModalBtn.disabled = true;
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

function statusClass(status) {
    const normalized = String(status || "").trim().toLowerCase();
    if (normalized === "declined") return "declined";
    if (normalized === "approved" || normalized === "accepted") return "approved";
    if (normalized === "in progress") return "in-progress";
    return "pending";
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

function productLogoUrl(productName, extension = "png") {
    return `Images/${productLogoBase(productName)}_logoP.${extension}`;
}

function useNextProductImage(event, productName) {
    const img = event.currentTarget;
    const attempts = Number(img.dataset.logoAttempt || 0);
    const extensions = ["webp", "jpg", "jpeg"];
    if (attempts < extensions.length) {
        img.dataset.logoAttempt = String(attempts + 1);
        img.src = productLogoUrl(productName, extensions[attempts]);
        return;
    }
    img.src = DEFAULT_PRODUCT_IMAGE;
}

function openCampaignDetail(campaignId, campaignAgencyId) {
    if (!campaignId) return;
    const detailUrl = new URL("campaign_detail.html", window.location.href);
    detailUrl.searchParams.set("campaignId", campaignId);
    if (productId) detailUrl.searchParams.set("productId", productId);
    if (campaignAgencyId || agencyId) detailUrl.searchParams.set("agencyId", campaignAgencyId || agencyId);
    window.location.href = detailUrl.toString();
}

function openCampaignEditPopup(campaignId, campaignAgencyId) {
    if (!campaignId || !canDeleteCampaigns) return;
    const detailUrl = new URL("campaign_detail.html", window.location.href);
    detailUrl.searchParams.set("campaignId", campaignId);
    detailUrl.searchParams.set("edit", "1");
    if (productId) detailUrl.searchParams.set("productId", productId);
    if (campaignAgencyId || agencyId) detailUrl.searchParams.set("agencyId", campaignAgencyId || agencyId);
    window.location.href = detailUrl.toString();
}

async function deleteCampaign(campaign) {
    if (!campaign?._id || !canDeleteCampaigns) return;

    const confirmed = window.confirm(`Delete "${campaign.title || "this campaign"}"? This will remove it from all dashboards.`);
    if (!confirmed) return;

    try {
        const res = await fetch(`/api/campaigns/${encodeURIComponent(campaign._id)}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role, userId })
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            throw new Error(data.message || "Could not delete campaign");
        }

        if (productId) {
            await loadProductInfo();
        } else {
            await loadCampaignsByAgency();
        }
    } catch (err) {
        alert(err.message || "Could not delete campaign");
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || "");
            resolve(result.includes(",") ? result.split(",")[1] : "");
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
    });
}

async function prepareAttachments() {
    const fileInput = document.getElementById("campaignAttachment");
    const files = Array.from(fileInput?.files || []);
    if (!files.length) return [];

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > 20 * 1024 * 1024) {
        throw new Error("Total attachment size must be 20MB or less.");
    }

    const attachments = [];
    for (const file of files) {
        attachments.push({
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            dataBase64: await fileToBase64(file)
        });
    }
    return attachments;
}

function renderProductFacts(product) {
    const campaignCount = Array.isArray(product.campaigns)
        ? product.campaigns.length
        : Number(product.campaignCount || 0);
    const facts = [
        ["Product Name", product.name],
        ["Category", product.category],
        ["Campaigns", campaignCount]
    ];
    productFacts.innerHTML = facts.map(([label, value]) => `
        <div class="product-fact">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value || "-")}</strong>
        </div>
    `).join("");
}

async function loadProductInfo() {
    if (!productId) return;
    const res = await fetch(`/api/products/${encodeURIComponent(productId)}`);
    const product = await res.json();
    if (!res.ok) throw new Error(product.message || "Failed to load product");

    currentProduct = product;
    document.title = `KOALA by Nestle | ${product.name || "Product"} Campaigns`;
    pageEyebrow.textContent = "Registered Product";
    detailsHeading.textContent = "Product Details";
    detailsHeading.hidden = true;
    titleEl.textContent = product.name || "Unnamed Product";
    descriptionEl.textContent = product.category
        ? `${product.name || "This product"} is registered under ${product.category}.`
        : "No category recorded.";
    descriptionEl.hidden = true;
    heroImageEl.src = productLogoUrl(product.name);
    heroImageEl.alt = `${product.name || "Product"} image`;
    heroImageEl.addEventListener("error", (event) => useNextProductImage(event, product.name));
    campaignSectionTitle.textContent = `${product.name || "Product"} Campaigns`;
    renderProductFacts(product);
    renderCampaigns(Array.isArray(product.campaigns) ? product.campaigns : []);
}

async function loadAgencyInfo() {
    if (!agencyId || productId) return;
    const res = await fetch(`/api/agencies/${encodeURIComponent(agencyId)}`);
    const agency = await res.json();
    if (!res.ok) throw new Error(agency.message || "Failed to load agency");

    pageEyebrow.textContent = "Registered Agency";
    detailsHeading.textContent = "Agency Details";
    detailsHeading.hidden = false;
    titleEl.textContent = agency.name || "Unnamed Agency";
    descriptionEl.textContent = agency.description || "No description available.";
    descriptionEl.hidden = false;
    heroImageEl.src = agency.imageUrl || `/api/media/agency-image?seed=${encodeURIComponent(agency._id)}&name=${encodeURIComponent(agency.name || "Agency")}`;
    campaignSectionTitle.textContent = `${agency.name || "Agency"} Campaigns`;
    productFacts.innerHTML = "";
    await loadCampaignsByAgency();
}

function renderCampaigns(campaigns) {
    campaignList.innerHTML = "";

    if (!campaigns.length) {
        const emptyState = document.createElement("div");
        emptyState.className = "empty-campaigns";
        emptyState.textContent = productId
            ? "No campaigns yet for this product. Create a campaign and assign an agency."
            : "No ongoing campaigns yet for this agency.";
        campaignList.appendChild(emptyState);
        return;
    }

    campaigns.forEach(campaign => {
        const status = normalizeCampaignStatus(campaign.status);
        const card = document.createElement("article");
        card.className = "campaign-card";
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.innerHTML = `
            <div class="campaign-card-header">
                <span class="campaign-status ${escapeHtml(statusClass(status))}">${escapeHtml(status)}</span>
                ${canDeleteCampaigns ? `
                    <span class="campaign-card-actions">
                        <button type="button" class="campaign-icon-btn campaign-edit-btn" aria-label="Edit ${escapeHtml(campaign.title || "campaign")}" title="Edit campaign"><i class="fa-solid fa-pen"></i></button>
                        <button type="button" class="campaign-icon-btn campaign-delete-btn" aria-label="Delete ${escapeHtml(campaign.title || "campaign")}" title="Delete campaign"><i class="fa-solid fa-trash"></i></button>
                    </span>
                ` : ""}
            </div>
            <h3>${escapeHtml(campaign.title)}</h3>
            <p class="campaign-meta">Product: ${escapeHtml(campaign.productName || currentProduct?.name || "-")}</p>
            <p class="campaign-meta">Agency: ${escapeHtml(campaign.agencyName || "-")}</p>
            <p class="campaign-meta">Timeline: ${escapeHtml(campaign.startDate)} to ${escapeHtml(campaign.endDate)}</p>
            <p class="campaign-meta">Target audience: ${escapeHtml(campaign.targetAudience)}</p>
            <p class="campaign-meta">Budget: ${escapeHtml(campaign.budgetRange)}</p>
            <p class="campaign-meta">Campaign type: ${escapeHtml(campaign.campaignType || "-")}</p>
            <p class="campaign-objectives">Goal: ${escapeHtml(campaign.campaignGoal || campaign.objectives || "-")}</p>
            <div class="campaign-card-footer">
                <span class="campaign-footer-arrow" aria-hidden="true">&rarr;</span>
            </div>
        `;
        card.addEventListener("click", () => openCampaignDetail(campaign._id, campaign.agencyId));
        const editButton = card.querySelector(".campaign-edit-btn");
        editButton?.addEventListener("click", (event) => {
            event.stopPropagation();
            openCampaignEditPopup(campaign._id, campaign.agencyId);
        });
        const deleteButton = card.querySelector(".campaign-delete-btn");
        deleteButton?.addEventListener("click", (event) => {
            event.stopPropagation();
            deleteCampaign(campaign);
        });
        card.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openCampaignDetail(campaign._id, campaign.agencyId);
            }
        });
        campaignList.appendChild(card);
    });
}

async function loadCampaignsByAgency() {
    if (!agencyId) return;
    const res = await fetch(`/api/campaigns?agencyId=${encodeURIComponent(agencyId)}`);
    const campaigns = await res.json();
    renderCampaigns(Array.isArray(campaigns) ? campaigns : []);
}

async function loadAgenciesForAssignment() {
    const res = await fetch("/api/agencies");
    const agencies = await res.json();
    allAgencies = Array.isArray(agencies) ? agencies : [];
    assignedAgencySelect.innerHTML = `<option value="">Select Suitable Agency</option>`;
    allAgencies.forEach((agency) => {
        const option = document.createElement("option");
        option.value = agency._id;
        option.textContent = agency.name || "Unnamed Agency";
        assignedAgencySelect.appendChild(option);
    });
}

function openBriefModal() {
    campaignBriefModal.style.display = "flex";
    campaignBriefModal.scrollTop = 0;
    campaignBriefModal.querySelector(".modal-content")?.scrollTo({ top: 0 });
}

function closeBriefModal() {
    campaignBriefModal.style.display = "none";
    campaignBriefForm.reset();
    briefFormMessage.textContent = "";
}

openBriefModalBtn.addEventListener("click", openBriefModal);
closeBriefModalBtn.addEventListener("click", closeBriefModal);

campaignBriefForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const selectedAgencyId = assignedAgencySelect.value;
    const campaignData = {
        title: document.getElementById("campaignTitle").value.trim(),
        targetAudience: document.getElementById("targetAudience").value.trim(),
        budgetRange: document.getElementById("budgetRange").value.trim(),
        campaignType: document.getElementById("campaignType").value.trim(),
        startDate: document.getElementById("startDate").value,
        endDate: document.getElementById("endDate").value,
        description: document.getElementById("campaignDescription").value.trim(),
        objectives: document.getElementById("campaignObjectives").value.trim(),
        productId,
        productName: currentProduct?.name || "",
        agencyId: selectedAgencyId,
        mmId
    };

    if (!campaignData.title || !campaignData.productId || !campaignData.agencyId || !campaignData.mmId) {
        briefFormMessage.textContent = "Missing campaign title, product, agency, or user session.";
        briefFormMessage.className = "form-message error";
        return;
    }

    try {
        const attachments = await prepareAttachments();
        const res = await fetch("/api/campaigns", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...campaignData, attachments })
        });
        const data = await res.json();

        if (!res.ok) {
            briefFormMessage.textContent = data.message || "Error creating campaign";
            briefFormMessage.className = "form-message error";
            return;
        }

        closeBriefModal();
        await loadProductInfo();
        alert(`Campaign "${campaignData.title}" created and assigned successfully.`);
    } catch (err) {
        briefFormMessage.textContent = err?.message || "Error creating campaign";
        briefFormMessage.className = "form-message error";
    }
});

(async function init() {
    try {
        if (agencyChatTrigger && (role === "Agency" || !agencyId || productId)) {
            agencyChatTrigger.hidden = true;
        }
        await loadAgenciesForAssignment();
        if (productId) {
            await loadProductInfo();
        } else {
            await loadAgencyInfo();
        }
        if (window.initAgencyChat && agencyId && !productId) {
            window.initAgencyChat({
                triggerId: "agencyChatTrigger",
                agencyId,
                userId,
                role
            });
        }
    } catch (err) {
        titleEl.textContent = "Workspace unavailable";
        descriptionEl.textContent = err.message || "Could not load this page.";
    }
}());
