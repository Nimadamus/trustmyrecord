(() => {
    const routes = [
        ["index.html", "Home"],
        ["sportsbook.html", "Make Picks"],
        ["arena.html", "Arena"],
        ["feed.html", "Feed"],
        ["polls.html", "Polls"],
        ["trivia.html", "Trivia"],
        ["profile.html", "Records"],
        ["forum.html", "Forum"],
        ["friends.html", "Friends"],
        ["messages.html", "Messages"],
        ["about.html", "About"]
    ];

    const routeMeta = {
        "sportsbook.html": ["Make Picks", "Live markets, pick submission, odds boards, and permanent locked receipts."],
        "arena.html": ["Arena", "Head-to-head contests, rival callouts, public challenges, and competition loops."],
        "challenges.html": ["Arena", "Legacy arena route. Public competition and challenge traffic belongs on the Arena page."],
        "feed.html": ["Social Feed", "Posts, reactions, sports debate, locked picks, and activity from the community."],
        "polls.html": ["Polls", "Prediction polls and scored fan forecasting, separate from pick submission."],
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

    document.body.classList.add("tmr-site-shell");

    document.querySelectorAll("header, body > nav.nav, body > .messages-top-strip, body > .sportsbook-top-strip, body > .notifications-top-strip, .sportsbook-top-strip, .notifications-top-strip").forEach((el) => {
        if (!el.classList.contains("tmr-global-nav")) {
            el.setAttribute("data-tmr-legacy-nav", "hidden");
            el.style.display = "none";
        }
    });

    const nav = document.createElement("nav");
    nav.className = "tmr-global-nav";
    nav.innerHTML = `
        <div class="tmr-global-nav__inner">
            <a class="tmr-global-nav__brand" href="index.html">
                <span class="tmr-global-nav__mark">TMR</span>
                <span>TRUST<span>MY</span>RECORD</span>
            </a>
            <div class="tmr-global-nav__links">
                ${routes.slice(1).filter(([href]) => href !== "profile.html").map(([href, label]) => {
                    const active = currentFile === href.toLowerCase() || ((currentFile === "arena.html" || currentFile === "challenges.html") && href === "arena.html");
                    return `<a href="${href}"${active ? ' aria-current="page"' : ""}>${label}</a>`;
                }).join("")}
            </div>
            <div class="tmr-global-nav__actions">
                <a class="tmr-global-nav__button" href="profile.html"${currentFile === "profile.html" ? ' aria-current="page"' : ""}>Records</a>
                <a class="tmr-global-nav__button tmr-global-nav__button--primary" href="sportsbook.html">Start Free</a>
            </div>
        </div>
    `;
    document.body.prepend(nav);

    const meta = routeMeta[currentFile];
    if (meta && currentFile !== "index.html") {
        const note = document.createElement("div");
        note.className = "tmr-route-note";
        note.innerHTML = `<strong>${meta[0]}:</strong> ${meta[1]}`;
        nav.insertAdjacentElement("afterend", note);
    }
})();
