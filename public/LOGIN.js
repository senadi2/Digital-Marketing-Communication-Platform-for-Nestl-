async function login() {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    const res = await fetch("http://localhost:3000/api/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (data.role === "MarketingManager") {
        window.location.href = "/MM_dash.html";
    } else if (data.role === "Agency") {
        window.location.href = "/AA_DASH.html";
    } else {
        document.getElementById("error").textContent = "Login failed";
    }

}

