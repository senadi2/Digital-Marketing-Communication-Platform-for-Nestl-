(function () {
    const ROLE_AVATARS = {
        BrandManager: "/Images/brand_manager_chaticon.jpg",
        MarketingManager: "/Images/marketing_manger_chaticon.jpg"
    };
    const AGENCY_AVATARS = [
        "/Images/agency_chaticon.jpg",
        "/Images/agency_chaticon1.jpg",
        "/Images/agency_chaticon2.jpg"
    ];

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatDateTime(dateString) {
        if (!dateString) return "";
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) return String(dateString);
        return new Intl.DateTimeFormat("en", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
        }).format(date);
    }

    function buildDrawer() {
        if (document.getElementById("agencyChatOverlay")) return;

        const overlay = document.createElement("div");
        overlay.className = "agency-chat-overlay";
        overlay.id = "agencyChatOverlay";

        const drawer = document.createElement("aside");
        drawer.className = "agency-chat-drawer";
        drawer.id = "agencyChatDrawer";
        drawer.innerHTML = `
            <div class="agency-chat-header">
                <div class="agency-chat-header-row">
                    <div>
                        <h2 id="agencyChatTitle">Agency Chat</h2>
                        <p id="agencyChatSubtitle">Keep everyone aligned in one shared conversation.</p>
                    </div>
                    <button type="button" class="agency-chat-close" id="agencyChatClose" aria-label="Close chat">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>
            <div class="agency-chat-body" id="agencyChatBody"></div>
            <div class="agency-chat-composer">
                <form class="agency-chat-form" id="agencyChatForm">
                    <textarea class="agency-chat-input" id="agencyChatInput" placeholder="Write a message for the team..." maxlength="4000"></textarea>
                    <div class="agency-chat-actions">
                        <p class="agency-chat-status" id="agencyChatStatus" aria-live="polite"></p>
                        <button type="submit" class="agency-chat-send" id="agencyChatSend">Send</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(drawer);
    }

    window.initAgencyChat = function initAgencyChat(config) {
        buildDrawer();

        const trigger = document.getElementById(config.triggerId || "agencyChatTrigger");
        const overlay = document.getElementById("agencyChatOverlay");
        const drawer = document.getElementById("agencyChatDrawer");
        const closeBtn = document.getElementById("agencyChatClose");
        const titleEl = document.getElementById("agencyChatTitle");
        const subtitleEl = document.getElementById("agencyChatSubtitle");
        const bodyEl = document.getElementById("agencyChatBody");
        const formEl = document.getElementById("agencyChatForm");
        const inputEl = document.getElementById("agencyChatInput");
        const statusEl = document.getElementById("agencyChatStatus");
        const sendBtn = document.getElementById("agencyChatSend");

        if (!trigger || !overlay || !drawer || !formEl || !bodyEl || !inputEl || !statusEl || !sendBtn) return;

        const agencyId = String(config.agencyId || "");
        const userId = String(config.userId || "");
        const role = String(config.role || "");
        const initialAgencyName = String(config.agencyName || "");

        if (!agencyId || !userId || !role) {
            trigger.disabled = true;
            return;
        }

        let open = false;
        let loading = false;
        let refreshHandle = null;
        const assignedAgencyAvatars = new Map();
        let lastAssignedAgencyAvatar = "";

        function pickAgencyAvatar(agencyKey) {
            if (assignedAgencyAvatars.has(agencyKey)) {
                return assignedAgencyAvatars.get(agencyKey);
            }

            const available = AGENCY_AVATARS.filter((avatarSrc) => avatarSrc !== lastAssignedAgencyAvatar);
            const pool = available.length ? available : AGENCY_AVATARS;
            const selected = pool[Math.floor(Math.random() * pool.length)];

            assignedAgencyAvatars.set(agencyKey, selected);
            lastAssignedAgencyAvatar = selected;
            return selected;
        }

        function resolveAvatarByRole(entry) {
            const authorRole = String(entry?.authorRole || "");
            if (authorRole === "BrandManager") {
                return ROLE_AVATARS.BrandManager;
            }
            if (authorRole === "MarketingManager") {
                return ROLE_AVATARS.MarketingManager;
            }
            if (authorRole === "Agency") {
                const agencyKey = String(entry?.authorAgencyId || entry?.authorUserId || entry?.authorLabel || "agency-default");
                return pickAgencyAvatar(agencyKey);
            }
            return AGENCY_AVATARS[0];
        }

        function setStatus(message, type) {
            statusEl.textContent = message || "";
            statusEl.className = `agency-chat-status ${type || ""}`.trim();
        }

        function renderMessages(messages) {
            if (!Array.isArray(messages) || !messages.length) {
                bodyEl.innerHTML = `<div class="agency-chat-empty">No messages yet.</div>`;
                return;
            }

            bodyEl.innerHTML = messages.map((entry) => {
                const isSelf = entry.authorUserId === userId && entry.authorRole === role;
                const avatarSrc = resolveAvatarByRole(entry);
                const avatarAlt = `${entry.authorLabel || entry.authorRole || "Team Member"} avatar`;
                return `
                    <article class="agency-chat-message ${isSelf ? "self" : ""}">
                        <div class="agency-chat-message-row">
                            <img class="agency-chat-avatar" src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(avatarAlt)}">
                            <div class="agency-chat-bubble">
                                <div class="agency-chat-meta">
                                    <span class="agency-chat-author">${escapeHtml(entry.authorLabel || entry.authorRole || "Team Member")}</span>
                                    <span>${escapeHtml(formatDateTime(entry.createdAt))}</span>
                                </div>
                                <p class="agency-chat-text">${escapeHtml(entry.message || "")}</p>
                            </div>
                        </div>
                    </article>
                `;
            }).join("");

            bodyEl.scrollTop = bodyEl.scrollHeight;
        }

        async function loadMessages(showLoadingState) {
            if (loading) return;
            loading = true;

            if (showLoadingState) {
                bodyEl.innerHTML = `<div class="agency-chat-empty">Loading conversation...</div>`;
            }

            try {
                const res = await fetch(`/api/agencies/${encodeURIComponent(agencyId)}/chat?userId=${encodeURIComponent(userId)}&role=${encodeURIComponent(role)}`);
                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.message || "Failed to load chat");
                }

                const agencyName = String(data.agency?.name || initialAgencyName || "Agency");
                titleEl.textContent = `${agencyName} Chat`;
                subtitleEl.textContent = "Keep everyone aligned in one shared conversation.";
                renderMessages(Array.isArray(data.messages) ? data.messages : []);
            } catch (err) {
                bodyEl.innerHTML = `<div class="agency-chat-empty">${escapeHtml(err.message || "Error loading chat.")}</div>`;
            } finally {
                loading = false;
            }
        }

        async function sendMessage(event) {
            event.preventDefault();

            const message = String(inputEl.value || "").trim();
            if (!message) {
                setStatus("Write a message before sending.", "error");
                return;
            }

            sendBtn.disabled = true;
            setStatus("Sending message...", "");

            try {
                const res = await fetch(`/api/agencies/${encodeURIComponent(agencyId)}/chat`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        userId,
                        role,
                        message
                    })
                });
                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.message || "Failed to send message");
                }

                inputEl.value = "";
                setStatus("Message sent.", "success");
                await loadMessages(false);
            } catch (err) {
                setStatus(err.message || "Error sending message.", "error");
            } finally {
                sendBtn.disabled = false;
            }
        }

        function startRefresh() {
            stopRefresh();
            refreshHandle = window.setInterval(() => {
                if (open) {
                    loadMessages(false);
                }
            }, 12000);
        }

        function stopRefresh() {
            if (refreshHandle) {
                window.clearInterval(refreshHandle);
                refreshHandle = null;
            }
        }

        function openDrawer() {
            open = true;
            overlay.classList.add("open");
            drawer.classList.add("open");
            document.body.style.overflow = "hidden";
            setStatus("", "");
            loadMessages(true);
            startRefresh();
        }

        function closeDrawer() {
            open = false;
            overlay.classList.remove("open");
            drawer.classList.remove("open");
            document.body.style.overflow = "";
            stopRefresh();
        }

        trigger.addEventListener("click", openDrawer);
        closeBtn?.addEventListener("click", closeDrawer);
        overlay.addEventListener("click", closeDrawer);
        formEl.addEventListener("submit", sendMessage);

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && open) {
                closeDrawer();
            }
        });
    };
}());
