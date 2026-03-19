const agencies = [
    "XYZ Advertising",
    "Creative Lanka",
    "Pixel Agency",
    "Blue Media",
    "Digital Spark",
    "BrandWave"
];
const agencyList = document.getElementById('agencyList');
const UNSPLASH_KEY = 'otZ95zyUV1GOBepx8Im9xusaLNGzrjoAX_XNfuYU-pY'; 
agencies.forEach((agency, index) => {
    // Fetch a random image for each agency
    fetch(`https://api.unsplash.com/photos/random?query=agency&client_id=otZ95zyUV1GOBepx8Im9xusaLNGzrjoAX_XNfuYU-pY`)
        .then(res => res.json())
        .then(data => {
            const card = document.createElement('div');
            card.className = 'agency-card';
            const img = document.createElement('img');
            img.src = data.urls.small || `https://images.unsplash.com/photo-1694634003335-3e0add3b02c0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w4OTkyODZ8MHwxfHJhbmRvbXx8fHx8fHx8fDE3NzM4NTIyMDZ8&ixlib=rb-4.1.0&q=80&w=400`; // fallback
            img.alt = agency;
            const name = document.createElement('h3');
            name.textContent = agency;
            card.appendChild(img);
            card.appendChild(name);
            // Clickable card
            card.addEventListener('click', () => {
                window.location.href = `agency.html?name=${encodeURIComponent(agency)}`;
            });
            agencyList.appendChild(card);
        })
        .catch(err => {
            console.error("Unsplash API error:", err);
            // Fallback card if API fails
            const card = document.createElement('div');
            card.className = 'agency-card';
            const img = document.createElement('img');
            img.src = `https://source.unsplash.com/400x200/?office,agency,${index}`;
            img.alt = agency;
            const name = document.createElement('h3');
            name.textContent = agency;
            card.appendChild(img);
            card.appendChild(name);
            card.addEventListener('click', () => {
                window.location.href = `agency.html?name=${encodeURIComponent(agency)}`;
            });
            agencyList.appendChild(card);
        });
});

/* MODAL */
function openModal(){
document.getElementById("agencyModal").style.display="flex"
}
function closeModal(){
document.getElementById("agencyModal").style.display="none"
}
let slides = document.querySelectorAll(".slide")
let index = 0
function showSlides(){
slides.forEach(slide=>{
slide.classList.remove("active")
})
index++
if(index > slides.length){
index = 1
}
slides[index-1].classList.add("active")
}
setInterval(showSlides,4000)