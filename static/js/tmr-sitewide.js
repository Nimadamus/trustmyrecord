(() => {
    // Login/register navigation routes directly to /login/ and /register/.
    // Canonical sitewide nav (one set of labels, one set of paths).
    // After the Apr 30 directory migration, .html roots are 30x redirect stubs;
    // every nav target should hit its directory route directly to avoid a
    // pointless redirect hop on every click.
    const sportsbookPicksHref = "/sportsbook/";
    // Polls + Trivia live under Arena now (Apr 30, 2026). They're surfaced as
    // sub-modes on the Arena landing alongside handicapping contests and
    // PS5 sports gaming, so the top nav stays on a single line.
    const routes = [
        ["/", "Home"],
        [sportsbookPicksHref, "Make Picks"],
        ["/feed/", "Feed"],
        ["/leaderboards/", "Leaderboards"],
        ["/arena/", "Arena"],
        ["/forum/", "Forums"],
        ["/marketplace/", "Sell Your Picks"]
    ];

    // Pages that should highlight Arena in the top nav even though they
    // have their own URL.
    const ARENA_GROUP = new Set(["arena.html", "challenges.html", "polls.html", "trivia.html"]);

    const routeMeta = {
        "sportsbook.html": ["Make Picks", "Lock picks before games start. Build a public, permanent record."],
        "leaderboards.html": ["Leaderboards", "Handicapping records, trivia points, polls, online challenges, and handicapper challenges &mdash; every leaderboard in one hub."],
        "handicappers.html": ["Leaderboards", "Handicapping records, trivia points, polls, online challenges, and handicapper challenges &mdash; every leaderboard in one hub."],
        "arena.html": ["Arena", "Challenge rivals in sports picks, MLB The Show, Madden, NBA 2K, EA FC, and NHL."],
        "challenges.html": ["Arena", "Public competition, head-to-head challenges, and rivalry loops."],
        "feed.html": ["Feed", "Locked picks, hot takes, polls, trivia, and challenges from people with a record."],
        "hangout.html": ["Hangout", "Off-topic chatter and life conversations &mdash; not sports polls."],
        "polls.html": ["Polls", "Sports polls, prediction polls, debates, and community calls."],
        "trivia.html": ["Trivia", "Sports trivia, custom questions, leaderboards, and reputation."],
        "profile.html": ["Profile", "Verified pick record, posts, splits, marketplace, polls, trivia, and challenges."],
        "forum.html": ["Forums", "Hardcore sports discussion. Threads tied to verified profiles and locked records."],
        "premium.html": ["Premium", "Optional membership tiers with extra analytics and limits beyond the free public-record product."],
        "marketplace.html": ["Sell Your Picks", "Buy and sell picks once a public record is built to back them up."],
        "about.html": ["About", "Why TrustMyRecord exists: no edits, no deletions, no record resets."],
        "friends.html": ["Friends", "Follow real records. Build a sports social graph tied to public performance."],
        "messages.html": ["Messages", "Direct messages for matchups, picks, rivalries, and follow-up receipts."],
        "notifications.html": ["Notifications", "Replies, follows, pick grades, challenge alerts, and platform signals."],
        "terms.html": ["Terms", "The rules for using TrustMyRecord as a sports social record platform."],
        "privacy.html": ["Privacy", "How TrustMyRecord handles account, profile, and platform data."],
        "reset-password.html": ["Reset Password", "Recover account access without leaving the product shell."],
        "verify-email.html": ["Verify Email", "Confirm account ownership before using record and social features."],
        "report-bug.html": ["Report a Bug", "Spot something broken on TrustMyRecord? Send it straight to the team."]
    };

    // Derive the current "file" key for routeMeta. After the directory
    // migration ("/sportsbook/" instead of "/sportsbook.html") the simple
    // split-pop returns "" for trailing-slash routes, so we infer from the
    // path segment and append ".html" to keep routeMeta keys stable.
    const currentFile = (function() {
        const parts = location.pathname.split("/").filter(Boolean);
        const last = parts.length ? parts[parts.length - 1].toLowerCase() : "";
        if (!last) return "index.html";
        if (last.endsWith(".html")) return last;
        return last + ".html";
    })();
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

    const legacyNavStyle = document.createElement("style");
    legacyNavStyle.id = "tmr-legacy-nav-kill-switch";
    legacyNavStyle.textContent = `
        body.tmr-site-shell [data-tmr-legacy-nav="hidden"],
        body.tmr-site-shell > header:not(.tmr-global-nav):not(.tmr-global-footer),
        body.tmr-site-shell > nav.main-nav:not(.tmr-global-nav),
        body.tmr-site-shell > nav.nav:not(.tmr-global-nav),
        body.tmr-site-shell nav.main-nav:not(.tmr-global-nav),
        body.tmr-site-shell nav.nav:not(.tmr-global-nav),
        body.tmr-site-shell nav.nav-links:not(.tmr-global-nav),
        body.tmr-site-shell .messages-top-strip,
        body.tmr-site-shell .sportsbook-top-strip,
        body.tmr-site-shell .notifications-top-strip,
        body.tmr-site-shell .profile-top-strip,
        body.tmr-site-shell .friends-top-strip {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            min-height: 0 !important;
            max-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            overflow: hidden !important;
        }
    `;
    document.head.appendChild(legacyNavStyle);

    function hideLegacyNav(el) {
        if (!el || el.classList.contains("tmr-global-nav")) return;
        el.setAttribute("data-tmr-legacy-nav", "hidden");
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("visibility", "hidden", "important");
        el.style.setProperty("height", "0", "important");
        el.style.setProperty("min-height", "0", "important");
        el.style.setProperty("max-height", "0", "important");
        el.style.setProperty("margin", "0", "important");
        el.style.setProperty("padding", "0", "important");
        el.style.setProperty("border", "0", "important");
        el.style.setProperty("overflow", "hidden", "important");
    }

    document.querySelectorAll("body > header, body > nav.nav, body > nav.main-nav, nav.main-nav, nav.nav, nav.nav-links, body > .messages-top-strip, body > .sportsbook-top-strip, body > .notifications-top-strip, body > .profile-top-strip, body > .friends-top-strip, .messages-top-strip, .sportsbook-top-strip, .notifications-top-strip, .profile-top-strip, .friends-top-strip").forEach((el) => {
        if (!el.classList.contains("tmr-global-nav")) {
            hideLegacyNav(el);
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
            hideLegacyNav(el);
        });
    }

    const legacyNavObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (!(node instanceof Element)) return;
                if (node.matches("body > header, nav.nav, nav.main-nav, nav.nav-links, .messages-top-strip, .sportsbook-top-strip, .notifications-top-strip, .profile-top-strip, .friends-top-strip")) {
                    hideLegacyNav(node);
                }
                node.querySelectorAll?.("nav.nav, nav.main-nav, nav.nav-links, .messages-top-strip, .sportsbook-top-strip, .notifications-top-strip, .profile-top-strip, .friends-top-strip").forEach(hideLegacyNav);
            });
        });
    });
    legacyNavObserver.observe(document.body, { childList: true, subtree: true });

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
                        const hrefPath = href.split("#")[0].toLowerCase();
                        const segs = hrefPath.split("/").filter(Boolean);
                        const hrefFile = segs.length
                            ? (segs[segs.length - 1].endsWith(".html")
                                ? segs[segs.length - 1]
                                : segs[segs.length - 1] + ".html")
                            : "index.html";
                        const isArenaLink = hrefFile === "arena.html";
                        const active = currentFile === hrefFile || (isArenaLink && ARENA_GROUP.has(currentFile));
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
            // Do NOT preventDefault and do NOT stash anything in sessionStorage.
            // The anchor's href takes the user to /login/ or /register/ natively.
            // The legacy tmr_force_section handoff used to steer /sportsbook/ to
            // its inline auth section, but it persists across navigations and
            // can poison a later /sportsbook/ load -- clicking Log In, then Make
            // Picks, would bounce you onto the login section instead of the
            // picks board. Dedicated /login/ and /register/ pages exist now,
            // so no sessionStorage relay is needed.
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
                        <input type="search" id="tmrSearchInput" placeholder="Search users by username or display name, and forum threads..." autocomplete="off" autocapitalize="off" autocorrect="off">
                        <button type="button" class="tmr-search-close" aria-label="Close">&times;</button>
                    </div>
                    <div class="tmr-search-body" id="tmrSearchBody">
                        <div class="tmr-search-section">
                            <div class="tmr-search-label">Quick jumps</div>
                            <div class="tmr-search-grid">
                                <a href="/sportsbook/"><strong>Make Picks</strong><span>Lock picks before games start</span></a>
                                <a href="/feed/"><strong>Feed</strong><span>Posts, takes, locked picks</span></a>
                                <a href="/leaderboards/"><strong>Leaderboards</strong><span>Records, trivia, polls, challenges</span></a>
                                <a href="/arena/"><strong>Arena</strong><span>Head-to-head challenges</span></a>
                                <a href="/polls/"><strong>Polls</strong><span>Sports debates, predictions</span></a>
                                <a href="/trivia/"><strong>Trivia</strong><span>Sports knowledge games</span></a>
                                <a href="/forum/"><strong>Forums</strong><span>Hardcore discussion threads</span></a>
                                <a href="/marketplace/"><strong>Sell Your Picks</strong><span>Buy and sell picks</span></a>
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
        const baseUrl = (window.api && window.api.baseUrl) || "https://trustmyrecord-api.onrender.com/api";

        const userPromise = fetch(`${baseUrl}/users?query=${encodeURIComponent(q)}&limit=8`)
            .then(r => r.ok ? r.json() : { users: [] })
            .catch(() => ({ users: [] }));
        const threadPromise = fetch(`${baseUrl}/forum/search?q=${encodeURIComponent(q)}`)
            .then(r => r.ok ? r.json() : {})
            .catch(() => ({}));

        const [userData, threadData] = await Promise.all([userPromise, threadPromise]);
        const users = (userData.users || []).slice(0, 8);
        const threads = (threadData.results || threadData.threads || []).slice(0, 8);

        if (!users.length && !threads.length) {
            results.innerHTML = `<div class="tmr-search-label">No matches</div><div class="tmr-search-empty">No users or threads matched "${escapeHtml(q)}".</div>`;
            return;
        }

        const sections = [];
        if (users.length) {
            sections.push(
                `<div class="tmr-search-label">Users</div>` +
                users.map(u => {
                    const username = String(u.username || "");
                    const display = String(u.display_name || u.username || "User");
                    const avatar = getUserAvatar(u);
                    const picks = (u.total_picks != null) ? `${u.total_picks} picks` : "";
                    const units = (u.net_units != null && u.net_units !== 0)
                        ? `${u.net_units > 0 ? "+" : ""}${Number(u.net_units).toFixed(2)}u`
                        : "";
                    const meta = [picks, units].filter(Boolean).join(" Â· ") || "@" + username;
                    return `<a class="tmr-search-result tmr-search-result--user" href="/profile/?user=${encodeURIComponent(username)}">
                        <img class="tmr-search-result__avatar" src="${avatar}" alt="">
                        <span class="tmr-search-result__copy">
                            <strong>${escapeHtml(display)}</strong>
                            <span>@${escapeHtml(username)} Â· ${escapeHtml(meta)}</span>
                        </span>
                    </a>`;
                }).join("")
            );
        }
        if (threads.length) {
            sections.push(
                `<div class="tmr-search-label">Forum threads</div>` +
                threads.map(t => `<a class="tmr-search-result" href="/forum/?thread=${t.id}"><strong>${escapeHtml(t.title || "Thread")}</strong><span>${escapeHtml(t.category_name || t.username || "")}</span></a>`).join("")
            );
        }
        results.innerHTML = sections.join("");
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

    // Load nav-badges.js on every page once the global nav exists, so the bell
    // and messages icons get unread-count badges without each page importing it.
    if (!document.querySelector('script[data-tmr-nav-badges]')) {
        const navBadgesScript = document.createElement("script");
        navBadgesScript.src = "/static/js/nav-badges.js?v=20260430a";
        navBadgesScript.async = true;
        navBadgesScript.setAttribute("data-tmr-nav-badges", "1");
        document.head.appendChild(navBadgesScript);
    }

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
                        <a href="/sportsbook/">Make Picks</a>
                        <a href="/arena/">Arena</a>
                        <a href="/premium/">Premium</a>
                        <a href="/profile/">Records</a>
                    </div>
                </div>
                <div class="tmr-global-footer__section">
                    <h3 class="tmr-global-footer__heading">Community</h3>
                    <div class="tmr-global-footer__links">
                        <a href="/feed/">Feed</a>
                        <a href="/forum/">Forum</a>
                        <a href="/hangout/">Hangout</a>
                        <a href="/trivia/">Trivia</a>
                    </div>
                </div>
                <div class="tmr-global-footer__section">
                    <h3 class="tmr-global-footer__heading">Info</h3>
                    <div class="tmr-global-footer__links">
                        <a href="/about/">About</a>
                        <a href="/terms/">Terms</a>
                        <a href="/privacy/">Privacy</a>
                        <a href="/report-bug/">Report a Bug</a>
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

// ============================================================
// Sticky team badge (favorite_team) â€” sitewide helper
// ------------------------------------------------------------
// Any page can call window.TMR.attachUserBadges(rootSelector) and every
// element under root with [data-tmr-username] will get a small team badge
// appended right after the username. Cached per session, fail-open if the
// API call fails (no badge shown â€” never a fallback fake team).
// ============================================================
(function() {
    if (window.TMR && window.TMR.attachUserBadges) return;
    window.TMR = window.TMR || {};

    var cache = {};       // username -> { team: 'Yankees', sport: 'MLB' } or null
    var inflight = {};    // username -> Promise

    function apiBase() {
        try { if (window.api && window.api.baseUrl) return window.api.baseUrl; } catch (e) {}
        return 'https://trustmyrecord-api.onrender.com/api';
    }

    function fetchOne(username) {
        if (cache[username] !== undefined) return Promise.resolve(cache[username]);
        if (inflight[username]) return inflight[username];
        inflight[username] = fetch(apiBase() + '/users/' + encodeURIComponent(username), { headers: { Accept: 'application/json' } })
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(data) {
                if (!data) { cache[username] = null; return null; }
                var teams  = Array.isArray(data.favorite_teams)  ? data.favorite_teams  : [];
                var sports = Array.isArray(data.favorite_sports) ? data.favorite_sports : (data.favorite_sport ? [data.favorite_sport] : []);
                if (!teams.length) { cache[username] = null; return null; }
                var entry = { team: String(teams[0]), sport: sports[0] || '' };
                cache[username] = entry;
                return entry;
            })
            .catch(function() { cache[username] = null; return null; })
            .finally(function() { delete inflight[username]; });
        return inflight[username];
    }

    function badgeHtml(entry) {
        if (!entry || !entry.team) return '';
        var sport = entry.sport ? ('<i class="fas fa-circle"></i>' + esc(entry.sport) + ' &middot; ') : '';
        return '<span class="tmr-team-badge" title="' + esc(entry.sport ? entry.sport + ' fan' : 'Favorite team') + '">' + sport + esc(entry.team) + '</span>';
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    window.TMR.attachUserBadges = function(rootSelector) {
        var root = rootSelector ? document.querySelector(rootSelector) : document;
        if (!root) return;
        var nodes = root.querySelectorAll('[data-tmr-username]:not([data-tmr-badge-attached])');
        nodes.forEach(function(node) {
            var username = node.getAttribute('data-tmr-username');
            if (!username) return;
            node.setAttribute('data-tmr-badge-attached', '1');
            fetchOne(username).then(function(entry) {
                if (!entry) return;
                node.insertAdjacentHTML('beforeend', ' ' + badgeHtml(entry));
            });
        });
    };

    // Inject the .tmr-team-badge styles once globally so any page can use them.
    if (!document.getElementById('tmrTeamBadgeStyles')) {
        var style = document.createElement('style');
        style.id = 'tmrTeamBadgeStyles';
        style.textContent = '.tmr-team-badge{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;margin-left:6px;border-radius:5px;background:rgba(0,255,255,0.08);border:1px solid rgba(0,255,255,0.22);color:#67e8f9;font:700 10px/1.4 "Inter",sans-serif;letter-spacing:.04em;text-transform:uppercase;vertical-align:1px;white-space:nowrap;}'
            + '.tmr-team-badge i{font-size:8px;opacity:.7;}';
        document.head.appendChild(style);
    }

    // Auto-run on initial load + after late inserts (forum/polls/trivia hydrate async).
    function autoRun() { try { window.TMR.attachUserBadges(); } catch (e) {} }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoRun);
    else autoRun();
    // Re-scan when feed/polls/forum lists hydrate. Throttled.
    var pending = false;
    var observer = new MutationObserver(function() {
        if (pending) return;
        pending = true;
        setTimeout(function() { pending = false; autoRun(); }, 250);
    });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
})();
