(() => {
    // Canonical sitewide nav (one set of labels, one set of paths).
    const sportsbookPicksHref = "/sportsbook.html";
    const routes = [
        ["/", "Home"],
        [sportsbookPicksHref, "Make Picks"],
        ["/feed/", "Feed"],
        ["/handicappers.html", "Leaderboards"],
        ["/arena/", "Arena"],
        ["/polls/", "Polls"],
        ["/trivia/", "Trivia"],
        ["/forum/", "Forums"],
        ["/premium/", "Marketplace"]
    ];

    const routeMeta = {
        "sportsbook.html": ["Make Picks", "Lock picks before games start. Build a public, permanent record."],
        "handicappers.html": ["Leaderboards", "Ranked cappers by ROI, units, sample size, streaks, and verified record."],
        "arena.html": ["Arena", "Challenge rivals in sports picks, MLB The Show, Madden, NBA 2K, EA FC, and NHL."],
        "challenges.html": ["Arena", "Public competition, head-to-head challenges, and rivalry loops."],
        "feed.html": ["Feed", "Locked picks, hot takes, polls, trivia, and challenges from people with a record."],
        "hangout.html": ["Polls", "Sports polls, debate threads, and community predictions."],
        "polls.html": ["Polls", "Create polls, vote on debates, see what the community is calling."],
        "trivia.html": ["Trivia", "Sports trivia, custom questions, leaderboards, and reputation."],
        "profile.html": ["Profile", "Verified pick record, posts, splits, marketplace, polls, trivia, and challenges."],
        "forum.html": ["Forums", "Hardcore sports discussion. Threads tied to verified profiles and locked records."],
        "premium.html": ["Marketplace", "Buy and sell picks once a record is built to back them up."],
        "about.html": ["About", "Why TrustMyRecord exists: no edits, no deletions, no record resets."],
        "friends.html": ["Friends", "Follow real records. Build a sports social graph tied to public performance."],
        "messages.html": ["Messages", "Direct messages for matchups, picks, rivalries, and follow-up receipts."],
        "notifications.html": ["Notifications", "Replies, follows, pick grades, challenge alerts, and platform signals."],
        "terms.html": ["Terms", "The rules for using TrustMyRecord as a sports social record platform."],
        "privacy.html": ["Privacy", "How TrustMyRecord handles account, profile, and platform data."],
        "reset-password.html": ["Reset Password", "Recover account access without leaving the product shell."],
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

    function buildSearchAction() {
        return `
            <button class="tmr-global-nav__icon" type="button" data-tmr-search aria-label="Search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path></svg>
            </button>
        `;
    }

    function buildLoggedOutActions() {
        return `
                ${buildSearchAction()}
                <a class="tmr-global-nav__button" href="/login/" data-tmr-auth-route="login">Log In</a>
                <a class="tmr-global-nav__button tmr-global-nav__button--primary" href="/register/" data-tmr-auth-route="signup">Join Free</a>
        `;
    }

    function buildLoggedInActions(user) {
        const username = String(user.username || user.displayName || user.email || "user");
        const displayName = String(user.displayName || user.username || user.email || "User");
        const avatar = getUserAvatar(user);
        const profileHref = "/profile/?user=" + encodeURIComponent(username);

        return `
            ${buildSearchAction()}
            <a class="tmr-global-nav__icon" href="/notifications/" aria-label="Notifications"${currentFile === "notifications.html" ? ' aria-current="page"' : ""}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10 21a2 2 0 0 0 4 0"></path></svg>
            </a>
            <a class="tmr-global-nav__icon" href="/messages/" aria-label="Messages"${currentFile === "messages.html" ? ' aria-current="page"' : ""}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </a>
            <a class="tmr-global-nav__user" href="${profileHref}"${currentFile === "profile.html" ? ' aria-current="page"' : ""}>
                <img class="tmr-global-nav__user-avatar" src="${avatar}" alt="${escapeHtml(displayName)} avatar">
                <span class="tmr-global-nav__user-copy">
                    <strong>${escapeHtml(displayName)}</strong>
                    <span>@${escapeHtml(username)}</span>
                </span>
            </a>
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
        const searchBtn = event.target.closest("[data-tmr-search]");
        if (searchBtn) {
            event.preventDefault();
            openSearchOverlay();
            return;
        }
        const navLink = event.target.closest(".tmr-global-nav__links a, .tmr-global-nav__actions a");
        if (navLink) {
            setNavOpen(false);
        }
    });

    // Lightweight sitewide search overlay (Cmd+K / Ctrl+K to open)
    function openSearchOverlay() {
        let overlay = document.getElementById("tmr-search-overlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "tmr-search-overlay";
            overlay.className = "tmr-search-overlay";
            overlay.innerHTML = `
                <div class="tmr-search-modal" role="dialog" aria-label="Search TrustMyRecord">
                    <div class="tmr-search-head">
                        <input type="search" id="tmrSearchInput" placeholder="Search picks, cappers, threads, polls, trivia..." autocomplete="off" autocapitalize="off" autocorrect="off">
                        <button type="button" class="tmr-search-close" aria-label="Close">&times;</button>
                    </div>
                    <div class="tmr-search-body" id="tmrSearchBody">
                        <div class="tmr-search-section">
                            <div class="tmr-search-label">Quick jumps</div>
                            <div class="tmr-search-grid">
                                <a href="/sportsbook.html"><strong>Make Picks</strong><span>Lock picks before games start</span></a>
                                <a href="/feed/"><strong>Feed</strong><span>Posts, takes, locked picks</span></a>
                                <a href="/handicappers.html"><strong>Leaderboards</strong><span>Ranked cappers by ROI, units</span></a>
                                <a href="/arena/"><strong>Arena</strong><span>Head-to-head challenges</span></a>
                                <a href="/polls/"><strong>Polls</strong><span>Sports debates, predictions</span></a>
                                <a href="/trivia/"><strong>Trivia</strong><span>Sports knowledge games</span></a>
                                <a href="/forum/"><strong>Forums</strong><span>Hardcore discussion threads</span></a>
                                <a href="/premium/"><strong>Marketplace</strong><span>Buy and sell picks</span></a>
                            </div>
                        </div>
                        <div class="tmr-search-section" id="tmrSearchResults" hidden></div>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay || e.target.closest(".tmr-search-close")) closeSearchOverlay();
            });
            const input = overlay.querySelector("#tmrSearchInput");
            input.addEventListener("input", debounceSearch);
            input.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSearchOverlay(); });
        }
        overlay.classList.add("is-open");
        const inp = overlay.querySelector("#tmrSearchInput");
        if (inp) setTimeout(() => inp.focus(), 30);
    }

    function closeSearchOverlay() {
        const overlay = document.getElementById("tmr-search-overlay");
        if (overlay) overlay.classList.remove("is-open");
    }

    let _searchTimer = null;
    function debounceSearch(e) {
        clearTimeout(_searchTimer);
        const q = (e.target.value || "").trim();
        const results = document.getElementById("tmrSearchResults");
        if (!q || q.length < 2) { if (results) { results.hidden = true; results.innerHTML = ""; } return; }
        _searchTimer = setTimeout(() => runSearch(q), 220);
    }

    async function runSearch(q) {
        const results = document.getElementById("tmrSearchResults");
        if (!results) return;
        results.hidden = false;
        results.innerHTML = `<div class="tmr-search-label">Searching for "${escapeHtml(q)}"...</div>`;
        try {
            const baseUrl = (window.api && window.api.baseUrl) || "https://trustmyrecord-api.onrender.com/api";
            const res = await fetch(`${baseUrl}/forum/search?q=${encodeURIComponent(q)}`);
            const data = await res.json().catch(() => ({}));
            const threads = (data.results || data.threads || []).slice(0, 8);
            if (!threads.length) {
                results.innerHTML = `<div class="tmr-search-label">No matches yet</div><div class="tmr-search-empty">Search runs across forum threads. As polls, trivia, and capper search come online, results will widen here.</div>`;
                return;
            }
            results.innerHTML = `<div class="tmr-search-label">Forum threads</div>` + threads.map(t => {
                return `<a class="tmr-search-result" href="/forum/?thread=${t.id}"><strong>${escapeHtml(t.title || "Thread")}</strong><span>${escapeHtml(t.category_name || t.username || "")}</span></a>`;
            }).join("");
        } catch (err) {
            results.innerHTML = `<div class="tmr-search-label">Search unavailable</div><div class="tmr-search-empty">Could not reach the search backend. Try again in a moment.</div>`;
        }
    }

    document.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
            e.preventDefault();
            openSearchOverlay();
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
