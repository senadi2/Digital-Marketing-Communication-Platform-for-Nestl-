document.getElementById("loginBtn").addEventListener("click", login);
function login() {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    const error = document.getElementById("error");
    error.textContent = "";
    if (!email || !password) {
        error.textContent = "Please fill in all fields.";
        return;
    }
    // Email routing logic
    if (email.endsWith("@dmnestle.com")) {
        window.location.href = "MM_DASH.html";
    } 
    else if (email.endsWith(".bmnestle.com")) {
        window.location.href = "dashboard-bm.html";
    } 
    else if (email.endsWith("@adnestle.com")) {
        window.location.href = "dashboard-ad.html";
    } 
    else {
        error.textContent = "Invalid email format.";
    }
}