(function () {
    const LOGIN_PATH = "/LOGIN.html";
    const USER_ID_KEY = "userId";
    const ROLE_KEY = "role";
    const AGENCY_ID_KEY = "agencyId";
    const LAST_ACTIVITY_KEY = "session.lastActivityAt";
    const AUTO_LOGOUT_FLAG_KEY = "session.autoLoggedOut";

    const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
    const ACTIVITY_THROTTLE_MS = 1000;

    let inactivityTimerId = null;
    let lastActivityWriteAt = 0;
    let isLoggingOut = false;

    function isLoginPage() {
        return window.location.pathname.toLowerCase().endsWith("/login.html");
    }

    function hasAuthenticatedSession() {
        return Boolean(localStorage.getItem(USER_ID_KEY));
    }

    function getLastActivityAt() {
        const value = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
        return Number.isFinite(value) && value > 0 ? value : 0;
    }

    function setLastActivityAt(timestamp) {
        localStorage.setItem(LAST_ACTIVITY_KEY, String(timestamp));
    }

    function clearSessionKeys() {
        localStorage.removeItem(USER_ID_KEY);
        localStorage.removeItem(ROLE_KEY);
        localStorage.removeItem(AGENCY_ID_KEY);
        localStorage.removeItem(LAST_ACTIVITY_KEY);
    }

    function redirectToLogin() {
        if (!isLoginPage()) {
            window.location.href = LOGIN_PATH;
        }
    }

    function logout(reason) {
        if (isLoggingOut) return;
        isLoggingOut = true;

        if (reason === "timeout") {
            sessionStorage.setItem(AUTO_LOGOUT_FLAG_KEY, "1");
        }

        clearSessionKeys();
        redirectToLogin();
    }

    function checkAndHandleTimeout() {
        const now = Date.now();
        const lastActivityAt = getLastActivityAt();

        if (!lastActivityAt) {
            setLastActivityAt(now);
            return false;
        }

        if (now - lastActivityAt >= INACTIVITY_TIMEOUT_MS) {
            logout("timeout");
            return true;
        }

        return false;
    }

    function restartInactivityTimer() {
        if (inactivityTimerId) {
            clearTimeout(inactivityTimerId);
        }

        const now = Date.now();
        const lastActivityAt = getLastActivityAt() || now;
        const elapsed = now - lastActivityAt;
        const remaining = Math.max(INACTIVITY_TIMEOUT_MS - elapsed, 0);

        inactivityTimerId = setTimeout(() => {
            checkAndHandleTimeout();
        }, remaining);
    }

    function touchActivity() {
        if (!hasAuthenticatedSession()) return;

        const now = Date.now();
        if (now - lastActivityWriteAt >= ACTIVITY_THROTTLE_MS) {
            lastActivityWriteAt = now;
            setLastActivityAt(now);
        }

        restartInactivityTimer();
    }

    function handleStorageUpdate(event) {
        if (event.key === LAST_ACTIVITY_KEY) {
            restartInactivityTimer();
            return;
        }

        if ((event.key === USER_ID_KEY || event.key === null) && !hasAuthenticatedSession()) {
            redirectToLogin();
        }
    }

    function bindActivityEvents() {
        const activityEvents = ["click", "keydown", "mousemove", "scroll", "touchstart", "focus"];
        activityEvents.forEach((eventName) => {
            window.addEventListener(eventName, touchActivity);
        });
    }

    function showAutoLogoutMessageIfNeeded() {
        if (sessionStorage.getItem(AUTO_LOGOUT_FLAG_KEY) !== "1") return;
        sessionStorage.removeItem(AUTO_LOGOUT_FLAG_KEY);
        alert("You were logged out after 30 minutes of inactivity.");
    }

    function initSessionGuard() {
        if (isLoginPage()) {
            showAutoLogoutMessageIfNeeded();
            return;
        }

        if (!hasAuthenticatedSession()) {
            redirectToLogin();
            return;
        }

        if (checkAndHandleTimeout()) return;

        bindActivityEvents();
        window.addEventListener("storage", handleStorageUpdate);
        restartInactivityTimer();
    }

    window.AppSession = {
        INACTIVITY_TIMEOUT_MS,
        LAST_ACTIVITY_KEY,
        touchActivity,
        logout
    };

    initSessionGuard();
})();
