async function loadAgencies() {
    const res = await fetch("http://localhost:3000/api/agencies");
    const agencies = await res.json();

    agencyList.innerHTML = "";

    agencies.forEach(a => {
        createAgencyCard(a.name);
    });
}

loadAgencies();