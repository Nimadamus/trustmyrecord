(() => {
    // Login/register navigation routes directly to /login/ and /register/.
    // Canonical sitewide nav (one set of labels, one set of paths).
    // After the Apr 30 directory migration, .html roots are 30x redirect stubs;
    // every nav target should hit its directory route directly to avoid a
    // pointless redirect hop on every click.
    const sportsbookPicksHref = "/sportsbook/";
    const routes = [
        [sportsbookPicksHref, "Sportsbook"],
        ["/contests/justbet-mlb/", "Contest"],
        ["/tools/", "Tools"],
        ["/handicappers/", "Find Handicappers"]
    ];
    // Lower-priority links live in a compact "More" dropdown so the primary
    // row never wraps on desktop.
    const moreRoutes = [
        ["/marketplace/", "Sell Your Picks"],
        ["/rules/", "Rules"]
    ];
    const communityRoutes = [
        ["/feed/", "Feed"],
        ["/arena/", "Arena"],
        ["/online-gaming/", "MLB The Show"],
        ["/challenges/", "Challenges"],
        ["/forum/", "Forums"],
        ["/polls/", "Polls"],
        ["/trivia/", "Trivia"]
    ];
    const blockedNavHrefs = new Set(["/trendspotter/"]);
    const visibleRoutes = routes.filter(([href]) => !blockedNavHrefs.has(href));

    // Pages that should highlight Arena in the top nav even though they
    // have their own URL.
    const ARENA_GROUP = new Set(["arena.html"]);
    const COMMUNITY_GROUP = new Set(["feed.html", "online-gaming.html", "mlb-the-show-stat-league.html", "arena.html", "challenges.html", "forum.html", "polls.html", "trivia.html", "hangout.html"]);
    const MORE_GROUP = new Set(["marketplace.html", "rules.html"]);

    const routeMeta = {
        "sportsbook.html": ["Sportsbook", "Lock picks before games start. Build a public, permanent record."],
        "leaderboards.html": ["Leaderboards", "Handicapping records, trivia points, polls, online challenges, and handicapper challenges &mdash; every leaderboard in one hub."],
        "handicappers.html": ["Find Handicappers", "Search members, compare verified records, follow cappers, and open public profiles."],
        "arena.html": ["Arena", "Challenge rivals in sports picks, MLB The Show, Madden, NBA 2K, EA FC, and NHL."],
        "challenges.html": ["Challenges", "Public competition, head-to-head challenges, and rivalry loops."],
        "feed.html": ["Feed", "Locked picks, hot takes, polls, trivia, and challenges from people with a record."],
        "online-gaming.html": ["Online Gaming", "Create and accept open sports video game challenges in MLB The Show, Madden, NBA 2K, NHL, and EA FC. Track wins, box scores, and lifetime stats."],
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
        "rules.html": ["Platform Rules", "One account per person, one per household, locked picks, and fair contests. The rules that protect every verified record."],
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

    function buildLoggedOutActions() {
        return `
                <a class="tmr-global-nav__button" href="/login/" data-tmr-auth-route="login">Log In</a>
                <a class="tmr-global-nav__button tmr-global-nav__button--primary" href="/register/" data-tmr-auth-route="signup">Join Free</a>
        `;
    }

    // May 29, 2026 — auth-hydration flash fix.
    // Returns true when auth credentials exist in storage. If so, the user IS
    // logged in; the user object is just still resolving (async /auth/me, which
    // can be slow on a cold backend). We must NOT show "Log In / Join Free" in
    // that window — that is the persistent-login regression users reported.
    function hasAuthTokens() {
        const keys = [
            "trustmyrecord_token", "accessToken", "access_token", "token", "tmr_token",
            "trustmyrecord_refresh_token", "refreshToken", "refresh_token", "tmr_refresh_token"
        ];
        try {
            for (const key of keys) {
                if (localStorage.getItem(key)) return true;
            }
        } catch (error) {}
        try {
            if (window.api && typeof window.api.isLoggedIn === "function" && window.api.isLoggedIn()) {
                return true;
            }
        } catch (error) {}
        return false;
    }

    // Neutral placeholder shown while a known session hydrates. Carries the
    // tmr-global-nav__user class so cleanupNavActions does not scrub it, and
    // never renders login buttons.
    function buildPendingActions() {
        return `
            <span class="tmr-user-chip-wrap">
                <span class="tmr-global-nav__user tmr-user-menu-trigger" data-tmr-auth-pending aria-busy="true" aria-label="Loading account" style="opacity:.55;pointer-events:none;">
                    <span class="tmr-global-nav__user-avatar" style="width:32px;height:32px;border-radius:50%;background:rgba(148,163,184,.35);display:inline-block;"></span>
                </span>
            </span>
        `;
    }

    let authHydrationStarted = false;
    function hydrateAuthThenRerender() {
        if (authHydrationStarted) return;
        authHydrationStarted = true;
        // auth-persistent.js normally restores the backend session and fires
        // tmr-auth-changed. This is a self-contained safety net for pages where
        // that path is slow or absent: pull the user, persist it, re-render.
        try {
            if (window.api && typeof window.api.getCurrentUser === "function") {
                Promise.resolve(window.api.getCurrentUser())
                    .then((data) => {
                        const user = data && (data.user || data);
                        if (user && (user.username || user.email)) {
                            try { localStorage.setItem("tmr_current_user", JSON.stringify(user)); } catch (error) {}
                        }
                    })
                    .catch(() => {})
                    .finally(() => {
                        authHydrationStarted = false;
                        renderActions();
                    });
                return;
            }
        } catch (error) {}
        authHydrationStarted = false;
    }

    function buildLoggedInActions(user) {
        const username = String(user.username || user.handle || user.slug || user.displayName || user.display_name || user.email || "user");
        const displayName = String(user.displayName || user.display_name || user.name || user.username || user.handle || user.email || "User");
        const avatar = getUserAvatar(user);
        const profileHref = "/profile/?user=" + encodeURIComponent(username);
        // Account-management controls live ONLY in this top-right dropdown
        // (see profile/index.html — body cards retired May 22, 2026).
        return `
            <span class="tmr-user-chip-wrap">
                <button type="button" class="tmr-global-nav__user tmr-user-menu-trigger" data-tmr-user-menu aria-haspopup="true" aria-expanded="false"${currentFile === "profile.html" ? ' aria-current="page"' : ""}>
                    <img class="tmr-global-nav__user-avatar" src="${avatar}" alt="${escapeHtml(displayName)} avatar">
                    <span class="tmr-global-nav__user-copy">
                        <strong>${escapeHtml(displayName)}</strong>
                        <span>@${escapeHtml(username)}</span>
                    </span>
                    <span class="tmr-user-menu-caret" aria-hidden="true">▾</span>
                </button>
                <div class="tmr-user-menu-panel" role="menu" aria-label="Account menu" hidden>
                    <a class="tmr-user-menu-item" role="menuitem" href="${profileHref}"><i class="fas fa-user" aria-hidden="true"></i> View Profile</a>
                    <button class="tmr-user-menu-item" role="menuitem" type="button" data-tmr-account-action="edit-profile" data-tmr-username="${escapeHtml(username)}"><i class="fas fa-pen" aria-hidden="true"></i> Edit Profile</button>
                    <button class="tmr-user-menu-item" role="menuitem" type="button" data-tmr-account-action="change-avatar" data-tmr-username="${escapeHtml(username)}"><i class="fas fa-camera" aria-hidden="true"></i> Change Avatar</button>
                    <button class="tmr-user-menu-item" role="menuitem" type="button" data-tmr-account-action="change-password"><i class="fas fa-key" aria-hidden="true"></i> Change Password</button>
                    <a class="tmr-user-menu-item" role="menuitem" href="/messages/"><i class="fas fa-envelope" aria-hidden="true"></i> Messages</a>
                    <div class="tmr-user-menu-divider" role="separator"></div>
                    <button class="tmr-user-menu-item tmr-user-menu-item--logout" role="menuitem" type="button" data-tmr-logout><i class="fas fa-sign-out-alt" aria-hidden="true"></i> Log Out</button>
                </div>
                <a href="/notifications/" id="notificationsBtn" class="tmr-global-nav__bell" data-tmr-notifications aria-label="Notifications" title="Notifications" onclick="if(typeof toggleNotifications==='function'){toggleNotifications(event);return false;}">
                    <svg class="tmr-global-nav__bell-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a6 6 0 0 0-6 6v3.6L4.3 15a1 1 0 0 0 .9 1.4h13.6a1 1 0 0 0 .9-1.4L18 11.6V8a6 6 0 0 0-6-6Zm0 20a3 3 0 0 0 2.83-2H9.17A3 3 0 0 0 12 22Z"/></svg>
                    <span id="notifBadge" class="tmr-global-nav__bell-badge" style="display:none;"></span>
                </a>
                <a class="tmr-mailbox-indicator" href="/messages/" data-tmr-mailbox aria-label="Unread messages" title="You have unread messages" hidden>
                    <svg class="tmr-mailbox-indicator__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11Zm2.5-.5a.5.5 0 0 0-.5.5v.32l7 4.55 7-4.55V6.5a.5.5 0 0 0-.5-.5h-13Zm13.5 2.86-6.45 4.19a1 1 0 0 1-1.1 0L5 8.86V17.5a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5V8.86Z"/></svg>
                    <span class="tmr-mailbox-indicator__count" data-tmr-mailbox-count></span>
                </a>
            </span>
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
                    ${visibleRoutes.filter(([href]) => href !== "profile.html").map(([href, label]) => {
                        const hrefPath = href.split("#")[0].toLowerCase();
                        const segs = hrefPath.split("/").filter(Boolean);
                        const hrefFile = segs.length
                            ? (segs[segs.length - 1].endsWith(".html")
                                ? segs[segs.length - 1]
                                : segs[segs.length - 1] + ".html")
                            : "index.html";
                        const active = href.includes("#") ? location.hash === href.slice(href.indexOf("#")) : currentFile === hrefFile;
                        return `<a href="${href}"${active ? ' aria-current="page"' : ""}>${label}</a>`;
                    }).join("")}
                </div>
                <div class="tmr-community-menu${COMMUNITY_GROUP.has(currentFile) ? " is-current" : ""}">
                    <button class="tmr-community-menu__trigger" type="button" aria-expanded="false" aria-haspopup="true">
                        Community
                    </button>
                    <div class="tmr-community-menu__panel" role="menu" aria-label="Community links">
                        ${communityRoutes.map(([href, label]) => {
                            const hrefPath = href.split("#")[0].toLowerCase();
                            const segs = hrefPath.split("/").filter(Boolean);
                            const hrefFile = segs.length
                                ? (segs[segs.length - 1].endsWith(".html")
                                    ? segs[segs.length - 1]
                                    : segs[segs.length - 1] + ".html")
                                : "index.html";
                            const active = currentFile === hrefFile || (hrefFile === "arena.html" && ARENA_GROUP.has(currentFile));
                            return `<a href="${href}" role="menuitem"${active ? ' aria-current="page"' : ""}>${label}</a>`;
                        }).join("")}
                    </div>
                </div>
                <div class="tmr-support-menu">
                    <button class="tmr-support-menu__trigger" type="button" aria-expanded="false" aria-haspopup="true">
                        Support
                    </button>
                    <div class="tmr-support-menu__panel" role="menu" aria-label="Support links">
                        <a href="/contact/" role="menuitem">Contact Us</a>
                        <a href="/report-bug/" role="menuitem">Report a Bug</a>
                    </div>
                </div>
                <div class="tmr-support-menu tmr-more-menu${MORE_GROUP.has(currentFile) ? " is-current" : ""}">
                    <button class="tmr-support-menu__trigger" type="button" aria-expanded="false" aria-haspopup="true">
                        More
                    </button>
                    <div class="tmr-support-menu__panel" role="menu" aria-label="More links">
                        ${moreRoutes.map(([href, label]) => {
                            const hrefPath = href.split("#")[0].toLowerCase();
                            const segs = hrefPath.split("/").filter(Boolean);
                            const hrefFile = segs.length
                                ? (segs[segs.length - 1].endsWith(".html")
                                    ? segs[segs.length - 1]
                                    : segs[segs.length - 1] + ".html")
                                : "index.html";
                            const active = currentFile === hrefFile;
                            return `<a href="${href}" role="menuitem"${active ? ' aria-current="page"' : ""}>${label}</a>`;
                        }).join("")}
                    </div>
                </div>
                <div class="tmr-global-nav__actions"></div>
            </div>
        </div>
    `;
    document.body.prepend(nav);
    nav.querySelectorAll('a[href*="trendspotter"]').forEach((element) => element.remove());
    const actions = nav.querySelector(".tmr-global-nav__actions");
    const toggleButton = nav.querySelector(".tmr-global-nav__toggle");
    const communityMenu = nav.querySelector(".tmr-community-menu");
    const communityTrigger = nav.querySelector(".tmr-community-menu__trigger");
    const supportMenu = nav.querySelector(".tmr-support-menu");
    const supportTrigger = nav.querySelector(".tmr-support-menu__trigger");

    function setNavOpen(isOpen) {
        if (!toggleButton) return;
        nav.classList.toggle("is-open", isOpen);
        toggleButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }

    function wireUserMenuTrigger() {
        if (!actions) return;
        const trigger = actions.querySelector("[data-tmr-user-menu]");
        if (!trigger || trigger.dataset.tmrWired === "1") return;
        trigger.dataset.tmrWired = "1";
        trigger.addEventListener("click", function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            toggleUserMenu();
        });
        actions.querySelectorAll("[data-tmr-account-action]").forEach((btn) => {
            if (btn.dataset.tmrWired === "1") return;
            btn.dataset.tmrWired = "1";
            btn.addEventListener("click", function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                const action = btn.getAttribute("data-tmr-account-action");
                const username = btn.getAttribute("data-tmr-username") || "";
                closeUserMenu();
                handleAccountAction(action, username);
            });
        });
    }

    function renderActions() {
        // May 29, 2026 — keep the page-baked static auth header (homepage
        // `.tmr-premium-actions` "Log in / Sign up") in sync too. It lives
        // inside <main>, so the legacy-nav kill-switch never hid it, and no
        // other script updated it — so a logged-in user still saw "Log in /
        // Sign up" in the homepage header even though the injected global nav
        // showed their account. That was the real persistent-login symptom.
        syncStaticAuthHeader();
        if (!actions) return;
        const user = getSessionUser();
        if (user) {
            actions.innerHTML = buildLoggedInActions(user);
        } else if (hasAuthTokens()) {
            // Logged in, user object still resolving — never flash logged-out.
            actions.innerHTML = buildPendingActions();
            hydrateAuthThenRerender();
        } else {
            actions.innerHTML = buildLoggedOutActions();
        }
        cleanupNavActions();
        wireUserMenuTrigger();
    }

    // Sync any static, page-baked auth header (currently the homepage premium
    // header) with the real session. Logged in -> swap "Log in / Sign up" for a
    // profile link; tokens present but user not yet resolved -> hide the
    // login/signup so it never flashes logged-out; logged out -> restore the
    // original markup.
    function syncStaticAuthHeader() {
        const boxes = document.querySelectorAll(".tmr-premium-actions");
        if (!boxes.length) return;
        const user = getSessionUser();
        const pending = !user && hasAuthTokens();
        boxes.forEach((box) => {
            if (typeof box._tmrOriginalActions !== "string") {
                box._tmrOriginalActions = box.innerHTML;
            }
            if (user) {
                const username = String(user.username || user.handle || user.slug || user.displayName || user.display_name || user.email || "account");
                const display = String(user.displayName || user.display_name || user.name || user.username || user.handle || "My Account");
                const href = "/profile/?user=" + encodeURIComponent(username);
                const avatar = getUserAvatar(user);
                const next = '<a class="tmr-premium-login auth-link" href="' + href + '" style="display:inline-flex;align-items:center;gap:8px;">'
                           + '<img class="tmr-premium-avatar" src="' + avatar + '" alt="' + escapeHtml(display) + ' avatar" style="width:30px;height:30px;border-radius:50%;object-fit:cover;flex:0 0 auto;border:1px solid rgba(148,163,184,.45);">'
                           + '<span>' + escapeHtml(display) + '</span></a>'
                           + '<a class="tmr-premium-signup auth-link" href="' + href + '">My Record</a>';
                if (box.getAttribute("data-tmr-auth-state") !== "in:" + username) {
                    box.innerHTML = next;
                    box.setAttribute("data-tmr-auth-state", "in:" + username);
                    box.style.visibility = "";
                }
            } else if (pending) {
                // Don't show login/signup while a known session is resolving.
                box.style.visibility = "hidden";
                box.setAttribute("data-tmr-auth-state", "pending");
            } else {
                if (box.getAttribute("data-tmr-auth-state") && box.getAttribute("data-tmr-auth-state") !== "out") {
                    box.innerHTML = box._tmrOriginalActions;
                }
                box.style.visibility = "";
                box.setAttribute("data-tmr-auth-state", "out");
            }
        });
    }

    function cleanupNavActions() {
        if (!actions) return;
        const legacyActionSelector = [
            ".tmr-global-nav__icon",
            "[data-tmr-search]",
            "[data-tmr-notifications]",
            "[data-tmr-messages]",
            'a[href="/notifications/"]',
            'a[href="notifications.html"]',
            'a[href="/notifications.html"]',
            'a[href="/messages/"]',
            'a[href="messages.html"]',
            'a[href="/messages.html"]',
            '[aria-label="Search"]',
            '[aria-label="Notifications"]',
            '[aria-label="Messages"]'
        ].join(",");

        actions.querySelectorAll(legacyActionSelector).forEach((element) => {
            // May 22, 2026: protect the authenticated user-menu dropdown contents
            // (Messages link, mailbox indicator) from the legacy nav-icon scrubber.
            if (element.closest(".tmr-user-chip-wrap")) return;
            element.remove();
        });

        actions.querySelectorAll(":scope > a, :scope > button").forEach((element) => {
            const text = (element.textContent || "").replace(/\s+/g, " ").trim();
            const isAllowedAuth =
                element.matches("[data-tmr-logout]") ||
                element.matches('[data-tmr-auth-route="login"]') ||
                element.matches('[data-tmr-auth-route="signup"]') ||
                element.classList.contains("tmr-global-nav__user");
            if (!text && !isAllowedAuth) {
                element.remove();
            }
        });
    }

    const actionsObserver = actions ? new MutationObserver(cleanupNavActions) : null;
    if (actionsObserver) {
        actionsObserver.observe(actions, { childList: true, subtree: true });
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

        try {
            window.sessionStorage.removeItem("tmr_contest_promo_justbet_mlb_v2_session");
        } catch (error) {
            // ignore sessionStorage failures
        }
        renderActions();
        window.dispatchEvent(new CustomEvent("tmr-auth-changed", { detail: { loggedIn: false } }));
        if (currentFile === "profile.html" || currentFile === "notifications.html" || currentFile === "messages.html" || currentFile === "friends.html") {
            window.location.href = "/";
        }
    }

    function getUserMenuParts() {
        if (!actions) return { trigger: null, panel: null };
        return {
            trigger: actions.querySelector("[data-tmr-user-menu]"),
            panel: actions.querySelector(".tmr-user-menu-panel")
        };
    }

    function toggleUserMenu(force) {
        const { trigger, panel } = getUserMenuParts();
        if (!trigger || !panel) return;
        const shouldOpen = typeof force === "boolean" ? force : panel.hasAttribute("hidden");
        if (shouldOpen) {
            panel.removeAttribute("hidden");
            panel.classList.add("is-open");
            trigger.setAttribute("aria-expanded", "true");
        } else {
            panel.setAttribute("hidden", "");
            panel.classList.remove("is-open");
            trigger.setAttribute("aria-expanded", "false");
        }
    }

    function closeUserMenu() {
        toggleUserMenu(false);
    }

    function handleAccountAction(action, username) {
        const userParam = username ? ("?user=" + encodeURIComponent(username)) : "";
        const onProfile = currentFile === "profile.html" || currentFile === "index.html" && location.pathname.indexOf("/profile/") !== -1;
        if (action === "edit-profile") {
            if (typeof window.openEditModal === "function") {
                try { window.openEditModal(); return; } catch (e) { /* fall through */ }
            }
            window.location.href = "/profile/" + userParam + (userParam ? "&" : "?") + "action=edit";
            return;
        }
        if (action === "change-avatar") {
            const picker = document.getElementById("profileAvatarFile");
            if (picker && typeof picker.click === "function") {
                try { picker.click(); return; } catch (e) { /* fall through */ }
            }
            window.location.href = "/profile/" + userParam + (userParam ? "&" : "?") + "action=change-avatar";
            return;
        }
        if (action === "change-password") {
            openChangePasswordModal();
            return;
        }
    }

    function openChangePasswordModal() {
        // Self-contained modal — works on any TMR page (matches /api/auth/change-password).
        const existing = document.getElementById("tmrChangePasswordModal");
        if (existing) existing.remove();
        const modal = document.createElement("div");
        modal.id = "tmrChangePasswordModal";
        modal.className = "tmr-account-modal";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-label", "Change password");
        modal.innerHTML = `
            <div class="tmr-account-modal__panel">
                <button type="button" class="tmr-account-modal__close" data-tmr-account-close aria-label="Close">&times;</button>
                <h2 class="tmr-account-modal__title"><i class="fas fa-key" aria-hidden="true"></i> Change Password</h2>
                <p class="tmr-account-modal__sub">Update your TrustMyRecord login password. You stay signed in on this device.</p>
                <form id="tmrChangePasswordForm" class="tmr-account-modal__form" autocomplete="off">
                    <label class="tmr-account-modal__label">Current password
                        <input type="password" id="tmrCpwCurrent" name="currentPassword" autocomplete="current-password" required minlength="1">
                    </label>
                    <label class="tmr-account-modal__label">New password
                        <input type="password" id="tmrCpwNew" name="newPassword" autocomplete="new-password" required minlength="8" placeholder="Min 8 characters">
                    </label>
                    <label class="tmr-account-modal__label">Confirm new password
                        <input type="password" id="tmrCpwConfirm" name="confirmPassword" autocomplete="new-password" required minlength="8">
                    </label>
                    <div class="tmr-account-modal__msg" id="tmrCpwMsg" role="status" aria-live="polite"></div>
                    <div class="tmr-account-modal__actions">
                        <button type="button" class="tmr-account-modal__btn tmr-account-modal__btn--ghost" data-tmr-account-close>Cancel</button>
                        <button type="submit" class="tmr-account-modal__btn tmr-account-modal__btn--primary" id="tmrCpwSubmit">Update Password</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
        requestAnimationFrame(() => modal.classList.add("is-open"));

        function getApiBase() {
            try { if (window.api && window.api.baseUrl) return String(window.api.baseUrl).replace(/\/$/, ""); } catch (e) {}
            return (window.TMR_API_BASE || window.API_BASE_URL || "https://trustmyrecord-api.onrender.com").replace(/\/$/, "");
        }
        function getToken() {
            try { if (window.api && window.api.token) return window.api.token; } catch (e) {}
            const keys = ["trustmyrecord_token", "tmr_auth_token", "accessToken", "access_token", "token", "tmr_token"];
            for (let i = 0; i < keys.length; i++) {
                try { const v = localStorage.getItem(keys[i]); if (v) return v; } catch (_) {}
            }
            return null;
        }
        function setMsg(text, ok) {
            const m = modal.querySelector("#tmrCpwMsg");
            if (!m) return;
            m.textContent = text || "";
            m.style.color = ok ? "#34d399" : "#f87171";
        }
        function closeModal() {
            modal.classList.remove("is-open");
            setTimeout(() => modal.remove(), 160);
        }
        modal.addEventListener("click", (ev) => {
            if (ev.target === modal || ev.target.closest("[data-tmr-account-close]")) closeModal();
        });
        document.addEventListener("keydown", function escClose(ev) {
            if (ev.key === "Escape") { closeModal(); document.removeEventListener("keydown", escClose); }
        });

        modal.querySelector("#tmrChangePasswordForm").addEventListener("submit", async function (ev) {
            ev.preventDefault();
            const cur = modal.querySelector("#tmrCpwCurrent").value;
            const nw = modal.querySelector("#tmrCpwNew").value;
            const cf = modal.querySelector("#tmrCpwConfirm").value;
            if (nw !== cf) { setMsg("New password and confirmation do not match.", false); return; }
            if (nw === cur) { setMsg("New password must differ from current password.", false); return; }
            const btn = modal.querySelector("#tmrCpwSubmit");
            btn.disabled = true; const orig = btn.textContent; btn.textContent = "Updating...";
            setMsg("", true);
            try {
                const token = getToken();
                if (!token) { setMsg("You must be logged in.", false); btn.disabled = false; btn.textContent = orig; return; }
                const resp = await fetch(getApiBase() + "/api/auth/change-password", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
                    body: JSON.stringify({ currentPassword: cur, newPassword: nw })
                });
                let data = {};
                try { data = await resp.json(); } catch (_) {}
                if (!resp.ok) {
                    const err = data.error || (data.errors && data.errors[0] && (data.errors[0].msg || data.errors[0].message)) || ("HTTP " + resp.status);
                    setMsg(err, false);
                } else {
                    setMsg("Password updated. You can use the new password next time you log in.", true);
                    ev.target.reset();
                    setTimeout(closeModal, 1400);
                }
            } catch (e) {
                setMsg("Network error: " + (e && e.message ? e.message : e), false);
            } finally {
                btn.disabled = false; btn.textContent = orig;
            }
        });

        const firstInput = modal.querySelector("#tmrCpwCurrent");
        if (firstInput) setTimeout(() => firstInput.focus(), 30);
    }

    document.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") closeUserMenu();
    });

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
        const supportToggle = event.target.closest(".tmr-support-menu__trigger");
        if (supportToggle) {
            event.preventDefault();
            const isOpen = supportMenu && supportMenu.classList.toggle("is-open");
            supportToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
            if (isOpen && communityMenu && communityTrigger) {
                communityMenu.classList.remove("is-open");
                communityTrigger.setAttribute("aria-expanded", "false");
            }
            return;
        }
        const communityToggle = event.target.closest(".tmr-community-menu__trigger");
        if (communityToggle) {
            event.preventDefault();
            const isOpen = communityMenu && communityMenu.classList.toggle("is-open");
            communityToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
            if (isOpen && supportMenu && supportTrigger) {
                supportMenu.classList.remove("is-open");
                supportTrigger.setAttribute("aria-expanded", "false");
            }
            return;
        }
        const logoutButton = event.target.closest("[data-tmr-logout]");
        if (logoutButton) {
            event.preventDefault();
            closeUserMenu();
            handleLogout();
            return;
        }
        const userMenuTrigger = event.target.closest("[data-tmr-user-menu]");
        if (userMenuTrigger) {
            event.preventDefault();
            event.stopPropagation();
            toggleUserMenu();
            return;
        }
        const accountAction = event.target.closest("[data-tmr-account-action]");
        if (accountAction) {
            event.preventDefault();
            const action = accountAction.getAttribute("data-tmr-account-action");
            const username = accountAction.getAttribute("data-tmr-username") || "";
            closeUserMenu();
            handleAccountAction(action, username);
            return;
        }
        const searchBtn = event.target.closest("[data-tmr-search]");
        if (searchBtn) {
            event.preventDefault();
            openSearchOverlay();
            return;
        }
        const navLink = event.target.closest(".tmr-global-nav__links a, .tmr-global-nav__actions a, .tmr-community-menu__panel a, .tmr-support-menu__panel a");
        if (navLink) {
            setNavOpen(false);
            if (communityMenu && communityTrigger) {
                communityMenu.classList.remove("is-open");
                communityTrigger.setAttribute("aria-expanded", "false");
            }
            if (supportMenu && supportTrigger) {
                supportMenu.classList.remove("is-open");
                supportTrigger.setAttribute("aria-expanded", "false");
            }
        }
    });

    document.addEventListener("click", (event) => {
        const userChip = event.target.closest(".tmr-user-chip-wrap");
        if (!userChip) closeUserMenu();
        if (communityMenu && communityTrigger && !communityMenu.contains(event.target)) {
            communityMenu.classList.remove("is-open");
            communityTrigger.setAttribute("aria-expanded", "false");
        }
        if (supportMenu && supportTrigger && !supportMenu.contains(event.target)) {
            supportMenu.classList.remove("is-open");
            supportTrigger.setAttribute("aria-expanded", "false");
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
                                <a href="/sportsbook/"><strong>Sportsbook</strong><span>Lock picks before games start</span></a>
                                <a href="/feed/"><strong>Feed</strong><span>Posts, takes, locked picks</span></a>
                                <a href="/handicappers/"><strong>Handicappers</strong><span>Find members and compare records</span></a>
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
                    const meta = [picks, units].filter(Boolean).join(" · ") || "@" + username;
                    return `<a class="tmr-search-result tmr-search-result--user" href="/profile/?user=${encodeURIComponent(username)}">
                        <img class="tmr-search-result__avatar" src="${avatar}" alt="">
                        <span class="tmr-search-result__copy">
                            <strong>${escapeHtml(display)}</strong>
                            <span>@${escapeHtml(username)} · ${escapeHtml(meta)}</span>
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

    // Temporary, OFF by default: append ?authdebug=1 to any URL to show a live
    // auth diagnostic panel (loaded JS version, token present, /auth/me result,
    // nav render state, URL, timestamp). Disabled unless explicitly requested,
    // so it never appears for normal users / final deployment.
    try {
        if (/[?&]authdebug=1\b/.test(location.search)) {
            const JS_VERSION = "20260529authhydrate3";
            const panel = document.createElement("div");
            panel.id = "tmr-auth-debug";
            panel.style.cssText = "position:fixed;z-index:2147483647;left:8px;bottom:8px;max-width:92vw;background:#0b1220;color:#cde;font:12px/1.5 monospace;padding:10px 12px;border:1px solid #00aeff;border-radius:8px;white-space:pre-wrap;box-shadow:0 4px 18px rgba(0,0,0,.5)";
            document.body.appendChild(panel);
            const tokenKeys = ["trustmyrecord_token","accessToken","token","tmr_token","trustmyrecord_refresh_token","refreshToken","refresh_token"];
            const draw = (authMe) => {
                const u = getSessionUser();
                const gnav = document.querySelector(".tmr-global-nav__actions");
                const prem = document.querySelector(".tmr-premium-actions");
                const present = tokenKeys.filter((k) => { try { return !!localStorage.getItem(k); } catch (e) { return false; } });
                panel.textContent =
                    "TMR AUTH DEBUG\n" +
                    "jsVersion: " + JS_VERSION + "\n" +
                    "url: " + location.href + "\n" +
                    "time: " + new Date().toISOString() + "\n" +
                    "tokenPresent: " + (present.length > 0) + " [" + present.join(",") + "]\n" +
                    "sessionUser: " + (u ? (u.username || u.email) : "null") + "\n" +
                    "globalNav: " + (gnav ? gnav.textContent.replace(/\s+/g, " ").trim().slice(0, 50) : "(none)") + "\n" +
                    "premiumHeader: " + (prem ? prem.textContent.replace(/\s+/g, " ").trim() : "(none)") + "\n" +
                    "authMe: " + authMe;
            };
            draw("(fetching...)");
            if (window.api && typeof window.api.getCurrentUser === "function") {
                Promise.resolve(window.api.getCurrentUser())
                    .then((d) => { const uu = d && (d.user || d); draw(uu && (uu.username || uu.email) ? ("OK user=" + (uu.username || uu.email)) : "no-user"); })
                    .catch((e) => draw("ERROR " + (e && e.message ? e.message : e)));
            } else {
                draw("window.api unavailable");
            }
            window.addEventListener("tmr-auth-changed", () => draw("(auth-changed)"));
        }
    } catch (e) {}

    // Load nav-badges.js on every page once the global nav exists, so the bell
    // and messages icons get unread-count badges without each page importing it.
    if (!document.querySelector('script[data-tmr-nav-badges]')) {
        const navBadgesScript = document.createElement("script");
        navBadgesScript.src = "/static/js/nav-badges.js?v=20260708alertsfix1";
        navBadgesScript.async = true;
        navBadgesScript.setAttribute("data-tmr-nav-badges", "1");
        document.head.appendChild(navBadgesScript);
    }

    // Jul 6, 2026 -- sitewide Alerts bell fix. The #notificationsBtn markup
    // above is now on every page, but notifications.js (the dropdown engine)
    // and its dependencies were previously hand-included on only a handful of
    // pages (forum, sportsbook, friends, hangout, premium, trivia). Load
    // whichever are missing so the bell works everywhere the global nav does.
    // async=false on dynamically created scripts preserves execution order
    // (config -> backend-api -> auth-persistent -> notifications) even though
    // they fetch in parallel; any already present on the page already ran
    // before this deferred script, so they're skipped.
    [
        ["/static/js/config.js", "config.js"],
        ["/static/js/backend-api.js", "backend-api.js"],
        ["/static/js/auth-persistent.js", "auth-persistent.js"],
        ["/static/js/notifications.js", "notifications.js"]
    ].forEach(([src, name]) => {
        if (document.querySelector('script[src*="' + name + '"]')) return;
        const depScript = document.createElement("script");
        depScript.src = src + "?v=20260708alertsfix1";
        depScript.async = false;
        depScript.setAttribute("data-tmr-notifications-dep", name);
        document.head.appendChild(depScript);
    });

    const meta = routeMeta[currentFile];
    if (meta && currentFile !== "index.html" && currentFile !== "sportsbook.html" && currentFile !== "profile.html") {
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
                    <p>Permanent public records, locked picks, and receipts that cannot be rewritten.</p>
                </div>
                <div class="tmr-global-footer__section">
                    <h3 class="tmr-global-footer__heading">Platform</h3>
                    <div class="tmr-global-footer__links">
                        <a href="/sportsbook/">Sportsbook</a>
                        <a href="/arena/">Arena</a>
                        <a href="/marketplace/">Sell Your Picks</a>
                        <a href="/premium/">Premium</a>
                        <a href="/profile/">My Record</a>
                    </div>
                </div>
                <div class="tmr-global-footer__section">
                    <h3 class="tmr-global-footer__heading">Leaderboards</h3>
                    <div class="tmr-global-footer__links">
                        <a href="/leaderboards/">Sports Betting Leaderboards</a>
                        <a href="/sports-picks-leaderboard/">Sports Picks Leaderboard</a>
                        <a href="/best-verified-sports-bettors/">Best Verified Bettors</a>
                        <a href="/verified-handicapper-records/">Verified Handicapper Records</a>
                        <a href="/handicappers/">Browse Handicappers</a>
                    </div>
                </div>
                <div class="tmr-global-footer__section">
                    <h3 class="tmr-global-footer__heading">Pick Tracking</h3>
                    <div class="tmr-global-footer__links">
                        <a href="/free-pick-tracking/">Free Pick Tracking</a>
                        <a href="/mlb-pick-tracker/">MLB Pick Tracker</a>
                        <a href="/nba-pick-tracker/">NBA Pick Tracker</a>
                        <a href="/nfl-pick-tracker/">NFL Pick Tracker</a>
                        <a href="/nhl-pick-tracker/">NHL Pick Tracker</a>
                        <a href="/soccer-pick-tracker/">Soccer Pick Tracker</a>
                    </div>
                </div>
                <div class="tmr-global-footer__section">
                    <h3 class="tmr-global-footer__heading">Community</h3>
                    <div class="tmr-global-footer__links">
                        <a href="/feed/">Feed</a>
                        <a href="/forum/">Forum</a>
                        <a href="/trivia/">Trivia</a>
                        <a href="/polls/">Polls</a>
                        <a href="/hangout/">Hangout</a>
                        <a href="/arena/">Arena</a>
                    </div>
                </div>
                <div class="tmr-global-footer__section">
                    <h3 class="tmr-global-footer__heading">Info</h3>
                    <div class="tmr-global-footer__links">
                        <a href="/about/">About</a>
                        <a href="/how-it-works/">How It Works</a>
                        <a href="/rules/">Rules</a>
                        <a href="/terms/">Terms</a>
                        <a href="/privacy/">Privacy</a>
                        <a href="/contact/">Contact Us</a>
                    </div>
                </div>
            </div>
            <div class="tmr-global-footer__guides" aria-label="Guides, tools, and contests">
                <span class="tmr-global-footer__guides-label">Guides &amp; Tools</span>
                <nav class="tmr-global-footer__guides-links">
                    <a href="/sports-betting-glossary/">Betting Glossary</a>
                    <a href="/sports-betting-roi-explained/">ROI Explained</a>
                    <a href="/stats/clv/">CLV</a>
                    <a href="/stats/units/">Units</a>
                    <a href="/stats/average-odds/">Average Odds</a>
                    <a href="/stats/win-percentage/">Win %</a>
                    <a href="/stats/streaks/">Streaks</a>
                    <a href="/sports-betting-record-tracker/">Record Tracker</a>
                    <a href="/transparent-sports-betting-results/">Transparent Results</a>
                    <a href="/mlb-season-simulator/">Season Simulator</a>
                    <a href="/mlb-simulator/">Game Simulator</a>
                    <a href="/trendspotter/">Trend Spotter</a>
                    <a href="/model-builder/">Model Builder</a>
                    <a href="/trustmyrecord-tools/">All Tools</a>
                    <a href="/free-sports-betting-contest/">Free Contest</a>
                    <a href="/mlb-betting-contest/">MLB Contest</a>
                    <a href="/contests/justbet-mlb/">JustBet Contest</a>
                    <a href="/teams/">Team Pages</a>
                </nav>
            </div>
            <div class="tmr-global-footer__bottom">
                <nav class="tmr-global-footer__legal" aria-label="Legal and support">
                    <span>&copy; 2026 TrustMyRecord</span>
                    <a href="/terms/">Terms</a>
                    <a href="/privacy/">Privacy</a>
                    <a href="/contact/">Contact</a>
                    <a href="/report-bug/">Report a Bug</a>
                </nav>
                <p class="tmr-global-footer__disclaimer">TrustMyRecord is not a gambling platform. No real money is wagered on this site.</p>
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

// ============================================================
// Shared Eastern-Time timestamp helpers â€” sitewide single source
// ------------------------------------------------------------
// One formatter so pick tables stop drifting between browser-local
// time and ET. All API timestamps are UTC ISO (e.g. 2026-05-24T01:34:53.293Z);
// these always render in America/New_York regardless of the viewer's
// browser timezone, then suffix " ET".
//   TMR.formatET(value, opts)      -> "May 24, 2026, 9:34 PM ET" | '' if unparseable
//   TMR.formatDateET(value)        -> "May 24" (no time, no ET suffix; for short cells)
//   TMR.formatGameTimeET(pick)     -> scheduled game start in ET (commence_time only)
//   TMR.formatSubmittedET(pick)    -> actual submission instant in ET; never game/lock-as-game.
// ============================================================
(function() {
    window.TMR = window.TMR || {};
    if (window.TMR.formatET) return;

    var ET_TZ = 'America/New_York';

    function parse(value) {
        if (value == null || value === '') return null;
        var d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }

    // Always force the ET timezone so the viewer's browser tz can never
    // corrupt the rendered value. Handles AM/PM + date rollover natively
    // via Intl/toLocaleString. Returns '' (not a fabricated date) on bad input.
    function formatET(value, opts) {
        var d = parse(value);
        if (!d) return '';
        var base = opts || { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' };
        var out = {};
        for (var k in base) { if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k]; }
        out.timeZone = ET_TZ;
        var showTime = ('hour' in out) || ('minute' in out) || ('second' in out);
        return d.toLocaleString('en-US', out) + (showTime ? ' ET' : '');
    }

    function formatDateET(value) {
        var d = parse(value);
        if (!d) return '';
        return d.toLocaleDateString('en-US', { timeZone: ET_TZ, month: 'short', day: 'numeric' });
    }

    // Scheduled game start. Only ever reads commence/game-start fields â€”
    // never created_at / locked_at (those are submission, not game time).
    function formatGameTimeET(pick) {
        if (!pick) return '';
        var v = pick.commence_time || pick.game_time || pick.start_time
            || (pick.game && (pick.game.commence_time || pick.game.start_time));
        return formatET(v);
    }

    // Actual submission instant. Walks true submission fields first; locked_at
    // is the last resort (it equals created_at at insert in this schema, but
    // semantically it is the lock, not the user submit). Skips missing or
    // future values; never falls back to game time.
    function formatSubmittedET(pick) {
        if (!pick) return '';
        var nowMs = Date.now();
        var candidates = [
            pick.submitted_at,
            pick.created_at,
            pick.pick_created_at,
            pick.locked_at,
            pick.timestamp
        ];
        for (var i = 0; i < candidates.length; i++) {
            var d = parse(candidates[i]);
            if (d) {
                var t = d.getTime();
                if (t > 0 && t <= nowMs) return formatET(candidates[i]);
            }
        }
        return '';
    }

    window.TMR.formatET = formatET;
    window.TMR.formatDateET = formatDateET;
    window.TMR.formatGameTimeET = formatGameTimeET;
    window.TMR.formatSubmittedET = formatSubmittedET;
})();
