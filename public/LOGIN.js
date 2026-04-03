async function login() {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    try {
        const res = await fetch("/api/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();
        if (!res.ok) {
            document.getElementById("error").textContent = data.message || "Login failed";
            return;
        }

        localStorage.setItem("userId", data.userId);
        localStorage.setItem("role", data.role);
        localStorage.setItem("session.lastActivityAt", String(Date.now()));

        if (data.role === "MarketingManager") {
            localStorage.removeItem("agencyId");
            window.location.href = "/MM_dash.html";
            return;
        }

        if (data.role === "BrandManager") {
            localStorage.removeItem("agencyId");
            window.location.href = "/BM_dash.html";
            return;
        }

        if (data.role === "Agency") {
            localStorage.setItem("agencyId", data.agencyId || "");
            window.location.href = "/AA_DASH.html";
            return;
        }

        document.getElementById("error").textContent = "Login failed";
    } catch (error) {
        document.getElementById("error").textContent = "Server error. Please try again.";
    }
}

