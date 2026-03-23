const campaigns = [
    {
        title: "KitKat Formula 1 Launch",
        category: "Product Launch",
        status: "Active",
        dueDate: "28 Mar 2026",
        owner: "Nestle Brand Team",
        description: "Lead the digital rollout for the KitKat and Formula 1 partnership across social, video, and in-store awareness.",
        image: "Images/kitkat-f1-partnership-highlight.jpg.webp"
    },
    {
        title: "Corporate Brand Refresh",
        category: "Brand Campaign",
        status: "Active",
        dueDate: "02 Apr 2026",
        owner: "Corporate Communications",
        description: "Develop refreshed campaign assets that reinforce Nestle brand trust, innovation, and employer visibility.",
        image: "Images/nestlebrandlogo.jpg"
    },
    {
        title: "Factory Storytelling Series",
        category: "Content Production",
        status: "In Review",
        dueDate: "06 Apr 2026",
        owner: "Operations Marketing",
        description: "Produce a documentary-style content series that showcases local production excellence and quality standards.",
        image: "Images/nestle factory.webp"
    },
    {
        title: "Family Nutrition Awareness",
        category: "Community Outreach",
        status: "Planned",
        dueDate: "11 Apr 2026",
        owner: "Nutrition Division",
        description: "Create a family-focused awareness campaign for healthy nutrition habits with localized creative concepts.",
        image: "Images/nestle family.webp"
    },
    {
        title: "Employer Branding Drive",
        category: "Recruitment",
        status: "Active",
        dueDate: "16 Apr 2026",
        owner: "People & Culture",
        description: "Support hiring momentum with recruitment creatives, testimonial videos, and a structured media rollout.",
        image: "Images/nestle-headquarters-highlight.jpg.webp"
    },
    {
        title: "Seasonal Retail Push",
        category: "Retail Activation",
        status: "Planned",
        dueDate: "20 Apr 2026",
        owner: "Sales Marketing",
        description: "Prepare seasonal shopper messaging and retail display concepts designed for strong in-store conversion.",
        image: "Images/4-15.jpg"
    }
];
const visibleCount = 3;
let expanded = false;
const campaignList = document.getElementById("campaignList");
const viewMoreBtn = document.getElementById("viewMoreBtn");
const campaignCount = document.getElementById("campaignCount");
function createCampaignCard(campaign, index) {
    const article = document.createElement("article");
    article.className = `campaign-card${index >= visibleCount && !expanded ? " hidden-card" : ""}`;
    article.innerHTML = `
        <img src="${campaign.image}" alt="${campaign.title}">
        <div class="campaign-card-content">
            <div class="campaign-meta">
                <span class="campaign-tag">${campaign.category}</span>
                <span class="campaign-status">${campaign.status}</span>
            </div>
            <h3>${campaign.title}</h3>
            <p>${campaign.description}</p>
            <div class="campaign-footer">
                <div>
                    Due Date
                    <strong>${campaign.dueDate}</strong>
                </div>
                <div>
                    Owner
                    <strong>${campaign.owner}</strong>
                </div>
            </div>
        </div>
    `;
    return article;
}
function renderCampaigns() {
    campaignList.innerHTML = "";
    campaigns.forEach((campaign, index) => {
        campaignList.appendChild(createCampaignCard(campaign, index));
    });
    campaignCount.textContent = campaigns.length;
    if (campaigns.length <= visibleCount || expanded) {
        viewMoreBtn.classList.add("hidden");
    } else {
        viewMoreBtn.classList.remove("hidden");
    }
}
viewMoreBtn.addEventListener("click", () => {
    expanded = true;
    renderCampaigns();
});
renderCampaigns();