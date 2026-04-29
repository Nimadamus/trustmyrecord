(() => {
    const sportsbookPicksHref = "/picks/";
    const routes = [
        ["/", "Home"],
        [sportsbookPicksHref, "Make Picks"],
        ["/handicappers.html", "Handicappers"],
        ["/arena/", "Arena"],
        ["/feed/", "Feed"],
        ["/hangout/", "Hangout"],
        ["/forum/", "Forum"]
    ];

    const routeMeta = {
        "sportsbook.html": ["Make Picks", "Live markets, pick submission, odds boards, and permanent locked receipts."],
        "handicappers.html": ["Handicappers", "Discover ranked cappers by ROI, sample size, units, streaks, and open challenge paths."],
        "arena.html": ["Arena", "Head-to-head contests, rival callouts, public challenges, and competition loops."],
        "challenges.html": ["Arena", "Legacy arena route. Public competition and challenge traffic belongs on the Arena page."],
        "feed.html": ["Social Feed", "Posts, reactions, sports debate, locked picks, and activity from the community."],
        "hangout.html": ["Hangout", "Life polls, social questions, opinion threads, and everyday community conversation."],
        "polls.html": ["Hangout", "Legacy polls route. Prediction polls and opinion polls now live in Hangout."],
        "trivia.html": ["Trivia", "Sports knowledge games, custom questions, and scored fan status."],
        "profile.html": ["Verified Records", "Public profile history, pick ledger, advanced splits, and credibility markers."],
        "forum.html": ["Forum", "Long-form sports discussion and community threads."],
        "about.html": ["Our Creed", "Why TrustMyRecord exists: no edits, no deletions, no record resets."],
        "friends.html": ["Friends", "Find rivals, follow records, and keep the sports social graph tied to public performance."],
        "messages.html": ["Messages", "Direct conversations for matchups, picks, rivalries, and follow-up receipts."],
        "notifications.html": ["Notifications", "Account alerts, social activity, pick updates, and platform signals in one place."],
        "premium.html": ["Premium", "Advanced record tools and platform upgrades without changing the public record standard."],
        "terms.html": ["Terms", "The rules for using TrustMyRecord as a social sports record platform."],
        "privacy.html": ["Privacy", "How TrustMyRecord handles account, profile, and platform data."],
        "reset-password.html": ["Reset Password", "Recover account access without leaving the TrustMyRecord product shell."],
        "verify-email.html": ["Verify Email", "Confirm account ownership before using record and social features."]
    };

    const currentFile = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (document.querySelector(".tmr-global-nav")) return;

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function getSessionUser() {
        try {
            if (window.auth && typeof window.auth.getCurrentUser === "function") {
                const authUser = window.auth.getCurrentUser();
                if (authUser && (authUser.username || authUser.email)) {
                    return authUser;
                }
            }
        } catch (error) {
            // Fall through to storage-backed checks.
        }

        try {
            if (window.auth && window.auth.currentUser && (window.auth.currentUser.username || window.auth.currentUser.email)) {
                return window.auth.currentUser;
            }
        } catch (error) {
            // Ignore auth cache access failures.
        }

        try {
            if (window.api && window.api._cachedUser && (window.api._cachedUser.username || window.api._cachedUser.email)) {
                return window.api._cachedUser;
            }
        } catch (error) {
            // Ignore API cache access failures.
        }

        try {
            if (window.api && typeof window.api.getCurrentUser === "function") {
                const apiUser = window.api.getCurrentUser();
                if (apiUser && (apiUser.username || apiUser.email)) {
                    return apiUser;
                }
            }
        } catch (error) {
            // Ignore API accessor failures.
        }

        const keys = ["trustmyrecord_session", "tmr_current_user", "currentUser"];
        const stores = [];
        try {
            stores.push(localStorage);
        } catch (error) {}
        try {
            stores.push(sessionStorage);
        } catch (error) {}

        for (const store of stores) {
            for (const key of keys) {
                try {
                    const raw = store.getItem(key);
                    if (!raw) continue;
                    const parsed = JSON.parse(raw);
                    const user = parsed && (parsed.user || parsed);
                    if (user && (user.username || user.email)) {
                        return user;
                    }
                } catch (error) {
                    // Ignore malformed session values and keep scanning.
                }
            }
        }
        return null;
    }

    function getUserAvatar(user) {
        if (!user) return "";
        if (user.avatar || user.avatarUrl || user.avatar_url) {
            return user.avatar || user.avatarUrl || user.avatar_url;
        }
        const seed = String(user.username || user.displayName || user.email || "U");
        const colors = ["0ea5e9", "22c55e", "ef4444", "f59e0b", "8b5cf6"];
        const color = colors[seed.length % colors.length];
        const letter = escapeHtml(seed.charAt(0).toUpperCase() || "U");
        return `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23${color}%22/><text x=%2250%22 y=%2264%22 font-size=%2248%22 text-anchor=%22middle%22 fill=%22white%22 font-family=%22Arial,sans-serif%22>${letter}</text></svg>`;
    }

    function buildLoggedOutActions() {
        return `
                <a class="tmr-global-nav__button" href="/login/" data-tmr-auth-route="login">Log In</a>
                <a class="tmr-global-nav__button tmr-global-nav__button--primary" href="/register/" data-tmr-auth-route="signup">Register</a>
        `;
    }

    function buildLoggedInActions(user) {
        const username = String(user.username || user.displayName || user.email || "user");
        const displayName = String(user.displayName || user.username || user.email || "User");
        const avatar = getUserAvatar(user);
        const profileHref = "/profile/?user=" + encodeURIComponent(username);

        return `
            <a class="tmr-global-nav__user" href="${profileHref}"${currentFile === "profile.html" ? ' aria-current="page"' : ""}>
                <img class="tmr-global-nav__user-avatar" src="${avatar}" alt="${escapeHtml(displayName)} avatar">
                <span class="tmr-global-nav__user-copy">
                    <strong>${escapeHtml(displayName)}</strong>
                    <span>@${escapeHtml(username)}</span>
                </span>
            </a>
            <a class="tmr-global-nav__button" href="/notifications/"${currentFile === "notifications.html" ? ' aria-current="page"' : ""}>Alerts</a>
            <button class="tmr-global-nav__button tmr-global-nav__logout" type="button" data-tmr-logout>Log Out</button>
        `;
    }

    function clearAuthStorage() {
        [
            "trustmyrecord_session",
            "currentUser",
            "trustmyrecord_remember",
            "tmr_is_logged_in",
            "tmr_current_user",
            "trustmyrecord_token",
            "trustmyrecord_refresh_token",
            "token",
            "tmr_token",
            "refreshToken",
            "refresh_token"
        ].forEach((key) => localStorage.removeItem(key));
    }

    document.body.classList.add("tmr-site-shell");
    document.body.setAttribute("data-tmr-route", currentFile.replace(/\.html$/, ""));

    document.querySelectorAll("header, body > nav.nav, body > nav.main-nav, nav.main-nav, body > .messages-top-strip, body > .sportsbook-top-strip, body > .notifications-top-strip, body > .profile-top-strip, body > .friends-top-strip, .sportsbook-top-strip, .notifications-top-strip, .profile-top-strip, .friends-top-strip").forEach((el) => {
        if (!el.classList.contains("tmr-global-nav")) {
            el.setAttribute("data-tmr-legacy-nav", "hidden");
            el.style.display = "none";
        }
    });

    document.querySelectorAll("body > footer").forEach((el) => {
        if (!el.classList.contains("tmr-global-footer")) {
            el.setAttribute("data-tmr-legacy-footer", "hidden");
            el.style.display = "none";
        }
    });

    if (currentFile === "index.html") {
        document.querySelectorAll(".shell > .nav").forEach((el) => {
            el.setAttribute("data-tmr-legacy-nav", "hidden");
            el.style.display = "none";
        });
    }

    const nav = document.createElement("nav");
    nav.className = "tmr-global-nav";
    nav.innerHTML = `
        <div class="tmr-global-nav__inner">
            <a class="tmr-global-nav__brand" href="/">
                <span class="tmr-global-nav__mark">TMR</span>
                <span>TRUST<span>MY</span>RECORD</span>
            </a>
            <button class="tmr-global-nav__toggle" type="button" aria-expanded="false" aria-label="Toggle navigation">
                <span></span>
                <span></span>
                <span></span>
            </button>
            <div class="tmr-global-nav__panel">
                <div class="tmr-global-nav__links">
                    ${routes.slice(1).filter(([href]) => href !== "profile.html").map(([href, label]) => {
                        const hrefFile = href.split("#")[0].toLowerCase();
                        const active = currentFile === hrefFile || ((currentFile === "arena.html" || currentFile === "challenges.html") && hrefFile === "arena.html");
                        return `<a href="${href}"${active ? ' aria-current="page"' : ""}>${label}</a>`;
                    }).join("")}
                </div>
                <div class="tmr-global-nav__actions"></div>
            </div>
        </div>
    `;
    document.body.prepend(nav);

    const actions = nav.querySelector(".tmr-global-nav__actions");
    const toggleButton = nav.querySelector(".tmr-global-nav__toggle");

    function setNavOpen(isOpen) {
        if (!toggleButton) return;
        nav.classList.toggle("is-open", isOpen);
        toggleButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }

    function renderActions() {
        if (!actions) return;
        const user = getSessionUser();
        actions.innerHTML = user ? buildLoggedInActions(user) : buildLoggedOutActions();
    }

    async function handleLogout() {
        const logoutButton = nav.querySelector("[data-tmr-logout]");
        if (logoutButton) {
            logoutButton.disabled = true;
            logoutButton.textContent = "Logging Out...";
        }

        try {
            if (window.auth && typeof window.auth.logout === "function") {
                await window.auth.logout();
            } else if (window.api && typeof window.api.logout === "function" && typeof window.api.isLoggedIn === "function" && window.api.isLoggedIn()) {
                await window.api.logout();
            } else {
                clearAuthStorage();
            }
        } catch (error) {
            clearAuthStorage();
        }

        renderActions();
        window.dispatchEvent(new CustomEvent("tmr-auth-changed", { detail: { loggedIn: false } }));
        if (currentFile === "profile.html" || currentFile === "notifications.html" || currentFile === "messages.html" || currentFile === "friends.html") {
            window.location.href = "/";
        }
    }

    function routeToSportsbookAuth(section) {
        const target = section === "signup" ? "signup" : "login";
        try {
            sessionStorage.setItem("tmr_force_section", target);
        } catch (error) {
            // Ignore sessionStorage failures and continue with navigation.
        }
            window.location.href = target === "signup" ? "/register/" : "/login/";
    }

    nav.addEventListener("click", (event) => {
        const authRoute = event.target.closest("[data-tmr-auth-route]");
        if (authRoute) {
            event.preventDefault();
            routeToSportsbookAuth(authRoute.getAttribute("data-tmr-auth-route"));
            setNavOpen(false);
            return;
        }
        const toggle = event.target.closest(".tmr-global-nav__toggle");
        if (toggle) {
            event.preventDefault();
            setNavOpen(!nav.classList.contains("is-open"));
            return;
        }
        const logoutButton = event.target.closest("[data-tmr-logout]");
        if (logoutButton) {
            event.preventDefault();
            handleLogout();
            return;
        }
        const navLink = event.target.closest(".tmr-global-nav__links a, .tmr-global-nav__actions a");
        if (navLink) {
            setNavOpen(false);
        }
    });

    renderActions();
    window.addEventListener("resize", () => {
        if (window.innerWidth > 860) {
            setNavOpen(false);
        }
    });
    window.addEventListener("storage", renderActions);
    window.addEventListener("tmr-auth-changed", renderActions);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) renderActions();
    });

    const meta = routeMeta[currentFile];
    if (meta && currentFile !== "index.html") {
        const note = document.createElement("div");
        note.className = "tmr-route-note";
        note.innerHTML = `<strong>${meta[0]}:</strong> ${meta[1]}`;
        nav.insertAdjacentElement("afterend", note);
    }

    if (currentFile !== "404.html" && !document.querySelector(".tmr-global-footer")) {
        const footer = document.createElement("footer");
        footer.className = "tmr-global-footer site-footer";
        footer.innerHTML = `
            <div class="tmr-global-footer__grid">
                <div class="tmr-global-footer__brand">
                    <a class="tmr-global-footer__brand-mark" href="/">
                        <span class="tmr-global-nav__mark">TMR</span>
                        <span>TRUST<span>MY</span>RECORD</span>
                    </a>
                    <p>The sports social arena for permanent public records, locked picks, rivalry, and receipts that cannot be rewritten.</p>
                </div>
                <div class="tmr-global-footer__section">
                    <h3 class="tmr-global-footer__heading">Platform</h3>
                    <div class="tmr-global-footer__links">
                        <a href="picks/">Make Picks</a>
                        <a href="arena/">Arena</a>
                        <a href="premium/">Premium</a>
                        <a href="profile/">Records</a>
                    </div>
                </div>
                <div class="tmr-global-footer__section">
                    <h3 class="tmr-global-footer__heading">Community</h3>
                    <div class="tmr-global-footer__links">
                        <a href="feed/">Feed</a>
                        <a href="forum/">Forum</a>
                        <a href="hangout/">Hangout</a>
                        <a href="trivia/">Trivia</a>
                    </div>
                </div>
                <div class="tmr-global-footer__section">
                    <h3 class="tmr-global-footer__heading">Info</h3>
                    <div class="tmr-global-footer__links">
                        <a href="about/">About</a>
                        <a href="terms/">Terms</a>
                        <a href="privacy/">Privacy</a>
                        <a href="mailto:support@trustmyrecord.com">Contact</a>
                    </div>
                </div>
            </div>
            <div class="tmr-global-footer__bottom">
                <p>&copy; 2026 TrustMyRecord.com. Transparent sports records, community competition, and locked receipts.</p>
                <p>TrustMyRecord is not a gambling platform. No real money is wagered on this site.</p>
            </div>
        `;
        document.body.appendChild(footer);
    }
})();
