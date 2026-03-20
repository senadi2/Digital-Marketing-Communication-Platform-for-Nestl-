const agencies = [
    { name: "XYZ Advertising" },
    { name: "Creative Lanka" },
    { name: "Pixel Agency" },
    { name: "Blue Media" },
    { name: "Digital Spark" },
    { name: "BrandWave" }
];
const agencyList = document.getElementById("agencyList");
const form = document.getElementById("agencyForm");
const formMessage = document.getElementById("formMessage");
const UNSPLASH_KEY = "otZ95zyUV1GOBepx8Im9xusaLNGzrjoAX_XNfuYU-pY";
const DEFAULT_IMAGE = "https://images.unsplash.com/photo-1694634003335-3e0add3b02c0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=400";
function createAgencyCard(agencyName, imageUrl) {
    const card = document.createElement("div");
    card.className = "agency-card";
    const img = document.createElement("img");
    img.src = imageUrl || DEFAULT_IMAGE;
    img.alt = agencyName;
    const name = document.createElement("h3");
    name.textContent = agencyName;
    card.appendChild(img);
    card.appendChild(name);
    card.addEventListener("click", () => {
        window.location.href = `agency.html?name=${encodeURIComponent(agencyName)}`;
    });
    agencyList.appendChild(card);
}
async function fetchAgencyImage(index) {
    try {
        const res = await fetch(`https://api.unsplash.com/photos/random?query=agency,marketing,office&client_id=${UNSPLASH_KEY}`);
        const data = await res.json();
        return data?.urls?.small || `https://source.unsplash.com/400x200/?office,agency,${index}`;
    } catch (err) {
        console.error("Unsplash API error:", err);
        return `https://source.unsplash.com/400x200/?office,agency,${index}`;
    }
}
async function renderInitialAgencies() {
    for (let i = 0; i < agencies.length; i++) {
        const imageUrl = await fetchAgencyImage(i);
        createAgencyCard(agencies[i].name, imageUrl);
    }
}
renderInitialAgencies();
function setMessage(message, type) {
    formMessage.textContent = message;
    formMessage.className = `form-message ${type}`;
}
function buildInvitePayload(formData) {
    const inviteToken = crypto.randomUUID();
    const inviteLink = `${window.location.origin}/set-password.html?token=${encodeURIComponent(inviteToken)}&username=${encodeURIComponent(formData.username)}`;
    return {
        ...formData,
        inviteToken,
        inviteLink,
        invitedAt: new Date().toISOString()
    };
}
function storePendingInvite(payload) {
    const pendingInvites = JSON.parse(localStorage.getItem("pendingAgencyInvites") || "[]");
    pendingInvites.push(payload);
    localStorage.setItem("pendingAgencyInvites", JSON.stringify(pendingInvites));
}
async function sendAgencyInvite(payload) {
    try {
        const response = await fetch("/api/agencies/invite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            throw new Error("Invite API returned a non-200 response.");
        }
        return { delivered: true, method: "api" };
    } catch (error) {
        console.warn("Invite API is unavailable. Falling back to mail client.", error);
        const subject = `Nestle Platform Invite - ${payload.agencyName}`;
        const body = [
            `Hi ${payload.contactPerson},`,
            "",
            "You have been invited to Nestle Marketing Platform.",
            `Username: ${payload.username}`,
            `Set your password here: ${payload.inviteLink}`,
            "",
            "Best regards,",
            "Nestle Digital Team"
        ].join("\n");
        window.location.href = `mailto:${payload.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        return { delivered: false, method: "mailto" };
    }
}
/* MODAL */
function openModal() {
    document.getElementById("agencyModal").style.display = "flex";
}
function closeModal() {
    document.getElementById("agencyModal").style.display = "none";
    form.reset();
    setMessage("", "");
}
form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = {
        agencyName: document.getElementById("agencyName").value.trim(),
        contactPerson: document.getElementById("contactPerson").value.trim(),
        phoneNumber: document.getElementById("phoneNumber").value.trim(),
        email: document.getElementById("email").value.trim(),
        username: document.getElementById("username").value.trim()
    };
    const missingField = Object.values(formData).some((value) => !value);
    if (missingField) {
        setMessage("Please fill in all required fields.", "error");
        return;
    }
    const payload = buildInvitePayload(formData);
    storePendingInvite(payload);
    const inviteResult = await sendAgencyInvite(payload);
    createAgencyCard(formData.agencyName, DEFAULT_IMAGE);
    if (inviteResult.delivered) {
        setMessage("Agency created and invite email sent successfully.", "success");
    } else {
        setMessage("Agency created. Email client opened to send the invite manually.", "success");
    }
    setTimeout(() => {
        closeModal();
    }, 1200);
});
let slides = document.querySelectorAll(".slide");
let index = 0;
function showSlides() {
    slides.forEach((slide) => {
        slide.classList.remove("active");
    });
    index++;
    if (index > slides.length) {
        index = 1;
    }
    slides[index - 1].classList.add("active");
}
setInterval(showSlides, 4000);