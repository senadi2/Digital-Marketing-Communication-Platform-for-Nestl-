

const agencyList = document.getElementById("agencyList");
const form = document.getElementById("agencyForm");
const formMessage = document.getElementById("formMessage");
const viewMoreBtn = document.querySelector(".viewMore");

const DEFAULT_IMAGE = "https://images.unsplash.com/photo-1694634003335-3e0add3b02c0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=400";
let allAgencies = [];
let currentIndex = 0;
const agenciesPerPage = 3;
const UNSPLASH_KEY = "otZ95zyUV1GOBepx8Im9xusaLNGzrjoAX_XNfuYU-pY";

async function fetchAgencyImage() {
    try {
        const res = await fetch(`https://api.unsplash.com/photos/random?query=agency,office,marketing&client_id=${UNSPLASH_KEY}`);
        const data = await res.json();
        return data?.urls?.small || DEFAULT_IMAGE;
    } catch {
        return DEFAULT_IMAGE;
    }
}

function createAgencyCard(agencyName, imageUrl = DEFAULT_IMAGE) {
    const card = document.createElement("div");
    card.className = "agency-card";

    const img = document.createElement("img");
    img.src = imageUrl;

    const name = document.createElement("h3");
    name.textContent = agencyName;

    card.appendChild(img);
    card.appendChild(name);

    card.addEventListener("click", () => {
        window.location.href = `agency.html?name=${encodeURIComponent(agencyName)}`;
    });

    agencyList.appendChild(card);
}

async function showMoreAgencies() {
    const nextIndex = currentIndex + agenciesPerPage;

    for (let i = currentIndex; i < nextIndex && i < allAgencies.length; i++) {
        const imageUrl = await fetchAgencyImage();
        createAgencyCard(allAgencies[i].name, imageUrl);
    }

    currentIndex = nextIndex;
    viewMoreBtn.style.display = currentIndex < allAgencies.length ? "block" : "none";
}

async function loadAgencies() {
    try {
        const res = await fetch("/api/agencies");
        allAgencies = await res.json();
        agencyList.innerHTML = "";
        currentIndex = 0;
        showMoreAgencies();
    } catch (err) {
        console.error(err);
    }
}

async function addNewAgency(agencyName) {
    const imageUrl = await fetchAgencyImage();
    allAgencies.push({ name: agencyName });
    createAgencyCard(agencyName, imageUrl);
    viewMoreBtn.style.display = currentIndex < allAgencies.length ? "block" : "none";
}

viewMoreBtn.addEventListener("click", showMoreAgencies);

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = {
        name: document.getElementById("agencyName").value,
        contactPerson: document.getElementById("contactPerson").value,
        username: document.getElementById("username").value,
        password: document.getElementById("password").value
    };

    if (Object.values(formData).some(v => !v)) {
        formMessage.textContent = "Please fill all fields";
        formMessage.className = "form-message error";
        return;
    }

    try {
        const res = await fetch("/api/agencies", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formData)
        });

        if (!res.ok) {
            const data = await res.json();
            setMessage(data.message, "error");
            return;
        }

        await addNewAgency(formData.name);
        setMessage("Agency created successfully!", "success");
        setTimeout(closeModal, 1200);

    } catch (err) {
        setMessage("Server error", "error");
    }
});

loadAgencies();

// ================= MESSAGE =================
function setMessage(message, type) {
    formMessage.textContent = message;
    formMessage.className = `form-message ${type}`;
}

// ================= MODAL =================
window.openModal = () => {
    document.getElementById("agencyModal").style.display = "flex";
};
window.closeModal = () => {
    document.getElementById("agencyModal").style.display = "none";
    form.reset();
    setMessage("", "");
};

// ================= SLIDESHOW =================
let slides = document.querySelectorAll(".slide");
let index = 0;
function showSlides() {
    slides.forEach(slide => slide.classList.remove("active"));
    index++;
    if (index > slides.length) index = 1;
    slides[index - 1].classList.add("active");
}
setInterval(showSlides, 5000); // start slideshow

// ================= LOGOUT =================
window.logout = () => {
    localStorage.clear();
    window.location.href = "/LOGIN.html";
};