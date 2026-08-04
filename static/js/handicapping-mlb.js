/* TrustMyRecord — MLB Handicapping Hub (sport sub-hub).

   Collapsed rows render from the board feed. Expanding a matchup lazily fetches
   the Handicapping Hub API and renders a tabbed research dashboard.

     GET /games/board/baseball_mlb              -> games + submittable market items
     GET /handicapping/mlb/matchup?away&home&date -> overview/pitchers/offense/
                                                     bullpens/trends (verified)
     GET /trendspotter/verified?sport=MLB       -> legacy slate trend feed
     GET /external-picks/consensus?days=3       -> community consensus ({groups})

   HARD RULE enforced throughout this file: a value is either REAL or it is
   explicitly marked unavailable with a reason. Nothing here fabricates a number,
   and nothing renders a blank that could be misread as a zero. */
(function () {
    "use strict";
    var API = (window.CONFIG && CONFIG.api && CONFIG.api.baseUrl) || "https://trustmyrecord-api.onrender.com/api";

    var MLB_ABBR = {
        "arizona diamondbacks":"ari","atlanta braves":"atl","baltimore orioles":"bal","boston red sox":"bos",
        "chicago cubs":"chc","chicago white sox":"chw","cincinnati reds":"cin","cleveland guardians":"cle",
        "colorado rockies":"col","detroit tigers":"det","houston astros":"hou","kansas city royals":"kc",
        "los angeles angels":"laa","los angeles dodgers":"lad","miami marlins":"mia","milwaukee brewers":"mil",
        "minnesota twins":"min","new york mets":"nym","new york yankees":"nyy","oakland athletics":"oak",
        "athletics":"oak","philadelphia phillies":"phi","pittsburgh pirates":"pit","san diego padres":"sd",
        "san francisco giants":"sf","seattle mariners":"sea","st. louis cardinals":"stl","st louis cardinals":"stl",
        "tampa bay rays":"tb","texas rangers":"tex","toronto blue jays":"tor","washington nationals":"wsh"
    };
    /* Reverse lookup so an already-abbreviated token resolves to itself. The
       trend feed and the board historically disagreed on team format (`phi@nyy`
       vs `philadelphia phillies@new york yankees`), which made the trend->game
       join silently impossible. Normalising BOTH sides through one canonical
       abbreviation fixes the join regardless of which format a feed emits. */
    var ABBR_SET = {};
    Object.keys(MLB_ABBR).forEach(function (k) { ABBR_SET[MLB_ABBR[k]] = true; });

    function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim(); }
    /** Canonical team token: accepts a full name OR an abbreviation. */
    function teamKey(v) {
        var n = norm(v);
        if (!n) return "";
        if (MLB_ABBR[n]) return MLB_ABBR[n];
        var compact = n.replace(/\s+/g, "");
        if (ABBR_SET[compact]) return compact;
        return n; // unknown token: fall back to the normalised string
    }
    function lastName(s) { var p = norm(s).split(" "); return p[p.length - 1] || ""; }
    function logoFor(name) {
        var a = MLB_ABBR[norm(name)];
        return a ? ("https://a.espncdn.com/i/teamlogos/mlb/500/" + a + ".png") : "";
    }
    function shortTeam(name) { return String(name || "").split(" ").slice(-1)[0]; }
    function fmtOdds(o) { if (o === null || o === undefined || o === "") return ""; var n = Number(o); if (isNaN(n)) return String(o); return n > 0 ? "+" + n : String(n); }
    function esc(s) { return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
    function hasVal(v) { return v !== null && v !== undefined && v !== ""; }
    /** Batting-rate display: 0.147 -> .147 ; ".234" -> .234 */
    function fmtRate(v) {
        if (!hasVal(v)) return null;
        var n = Number(v);
        if (isNaN(n)) return String(v);
        return n < 1 ? n.toFixed(3).replace(/^0\./, ".") : n.toFixed(3);
    }
    function fmtPct(v) { return hasVal(v) && !isNaN(Number(v)) ? Number(v).toFixed(1) + "%" : null; }
    function fmt2(v) { return hasVal(v) && !isNaN(Number(v)) ? Number(v).toFixed(2) : (hasVal(v) ? String(v) : null); }
    function fmtSigned(v, suffix) {
        if (!hasVal(v) || isNaN(Number(v))) return null;
        var n = Number(v);
        return (n > 0 ? "+" : "") + n.toFixed(2) + (suffix || "");
    }
    /** MLB slate date = the America/New_York calendar date of first pitch. */
    function slateDateET(iso) {
        var d = new Date(iso);
        if (isNaN(d)) return "";
        try {
            return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
        } catch (e) {
            return d.toISOString().slice(0, 10);
        }
    }

    var statusEl = document.getElementById("hh-status");
    var gamesEl = document.getElementById("hh-games");
    var tpl = document.getElementById("hh-game-tpl");
    var findEl = document.getElementById("hh-find");
    var dateSub = document.getElementById("hh-dateSub");
    var dateMain = document.getElementById("hh-dateMain");
    var prevBtn = document.getElementById("hh-prev");
    var nextBtn = document.getElementById("hh-next");
    var todayBtn = document.getElementById("hh-today");
    var slateTitle = document.getElementById("hh-slate-title");

    /** Today's MLB slate date = the current calendar date in America/New_York,
        matching how each game's slate date is derived in slateDateET(). */
    function todayET() {
        try {
            return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
        } catch (e) {
            return new Date().toISOString().slice(0, 10);
        }
    }
    /** "2026-07-31" -> "Fri, Jul 31" (parsed as a plain calendar date, no TZ shift). */
    var MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    function fmtSlateDate(iso) {
        var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return iso;
        var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
        return DOW_SHORT[d.getUTCDay()] + ", " + MON_SHORT[d.getUTCMonth()] + " " + Number(m[3]);
    }
    function dayOffset(iso, base) {
        var toN = function (s) { var p = String(s).split("-"); return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])); };
        return Math.round((toN(iso) - toN(base)) / 86400000);
    }

    /* renderSeq guards per-render card work; bootSeq guards whole slate loads.
       They are separate on purpose: boot() resolves BEFORE it calls
       renderSlate(), so a stale boot would still be holding the older seq at
       the moment it overwrites STATE, and renderSeq alone could not catch it. */
    var STATE = { games: [], gamesByDate: {}, dates: [], selDate: null, trendsByMatchup: {}, consensus: [], matchup: {}, matchupPromise: {}, renderSeq: 0, bootSeq: 0 };

    /** Every card's matchup fetch is a single shared promise, so the always-
        visible comparison grid and the "View Full Analysis" deep dive never
        issue two requests for the same game. */
    function getMatchup(game) {
        if (STATE.matchupPromise[game.id]) return STATE.matchupPromise[game.id];
        var url = API + "/handicapping/mlb/matchup?away=" + encodeURIComponent(game.away_team) +
            "&home=" + encodeURIComponent(game.home_team) +
            "&date=" + encodeURIComponent(slateDateET(game.commence_time));
        var p = getJSON(url, 25000).then(function (d) { STATE.matchup[game.id] = d; return d; });
        /* A failed fetch is NOT cached — otherwise every Retry button would
           replay the same rejected promise instead of hitting the network. */
        p.catch(function () { if (STATE.matchupPromise[game.id] === p) delete STATE.matchupPromise[game.id]; });
        STATE.matchupPromise[game.id] = p;
        return p;
    }
    /** Runs `tasks` with bounded concurrency so a 15-game slate does not fire
        15 simultaneous matchup fetches (each itself a multi-provider fan-out
        on the backend) the instant the page loads. */
    function runQueue(tasks, limit) {
        var i = 0, active = 0;
        return new Promise(function (resolve) {
            function next() {
                if (i >= tasks.length && active === 0) { resolve(); return; }
                while (active < limit && i < tasks.length) {
                    var t = tasks[i++];
                    active++;
                    t().catch(function () {}).then(function () { active--; next(); });
                }
            }
            next();
        });
    }

    function getJSON(url, timeoutMs) {
        var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
        var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 20000) : null;
        return fetch(url, { headers: { "Accept": "application/json" }, signal: ctrl ? ctrl.signal : undefined })
            .then(function (r) {
                if (!r.ok) { var e = new Error("HTTP " + r.status); e.status = r.status; throw e; }
                return r.json();
            })
            .then(function (j) { if (timer) clearTimeout(timer); return j; },
                  function (e) { if (timer) clearTimeout(timer); throw e; });
    }

    /* ---------------- shared state blocks ---------------- */
    function loadingHtml(what) {
        return '<div class="hh-state hh-state--loading"><span class="hh-spin" aria-hidden="true"></span>' + esc(what || "Loading research data…") + '</div>';
    }
    function unavailableHtml(reason, detail) {
        return '<div class="hh-state hh-state--na">' +
            '<strong>Not available</strong>' +
            '<p>' + esc(reason || "This section is not available for this matchup.") + '</p>' +
            (detail ? '<p class="hh-state__detail">' + esc(detail) + '</p>' : "") +
            '</div>';
    }
    function errorHtml(msg) {
        return '<div class="hh-state hh-state--err">' +
            '<strong>Provider error</strong>' +
            '<p>' + esc(msg || "The research provider did not respond.") + '</p>' +
            '<button type="button" class="hh-retry" data-retry>Retry</button>' +
            '</div>';
    }
    /** Renders a section that the API itself marked unavailable, or null. */
    function sectionNa(sec, fallbackReason) {
        if (!sec) return unavailableHtml(fallbackReason || "This section was not returned by the research API.");
        if (sec.available === false) return unavailableHtml(sec.reason || fallbackReason, sec.detail);
        return null;
    }
    /** Provider/metric identifiers arrive as raw snake_case tokens. Readers are
        bettors, not engineers, so they are humanised before they ever render.
        Known acronyms and stat names keep their canonical casing. */
    var LABEL_FIXED = {
        "mlb_stats_api": "MLB Stats API", "baseball_savant": "Baseball Savant",
        "espn": "ESPN", "action_network": "Action Network",
        "xfip": "xFIP", "siera": "SIERA", "xera": "xERA", "fip": "FIP", "wrc+": "wRC+",
        "era": "ERA", "whip": "WHIP", "ops": "OPS", "woba": "wOBA", "xwoba": "xwOBA",
        "lhp": "LHP", "rhp": "RHP", "gb%": "GB%", "fb%": "FB%", "nrfi": "NRFI"
    };
    function humanLabel(raw) {
        var s = String(raw === null || raw === undefined ? "" : raw).trim();
        if (!s) return "";
        var key = s.toLowerCase();
        if (LABEL_FIXED[key]) return LABEL_FIXED[key];
        /* Only reshape machine tokens; prose sentences pass through untouched. */
        if (/\s/.test(s) && !/_/.test(s)) return s;
        var parts = s.split(/[_\s]+/).map(function (w) {
            var lw = w.toLowerCase();
            return LABEL_FIXED[lw] || w;
        });
        var out = parts.join(" ");
        return out.charAt(0).toUpperCase() + out.slice(1);
    }

    /** Explicit, visible list of metrics the providers do not supply. Short tokens
        render as chips; the API also returns prose entries explaining WHY a metric
        is missing, and those get a readable list instead of an unreadable chip. */
    function notAvailableList(lists) {
        /* The pitchers and savant payloads both disclose the same gaps: one as a
           bare token ("SIERA"), one as prose explaining why ("SIERA (proprietary
           regression...)"). Dedupe on the leading token and keep the entry that
           explains the reason, so a metric is never listed twice. */
        var byKey = {}, order = [];
        (lists || []).forEach(function (l) {
            (l || []).forEach(function (m) {
                var s = String(m).trim();
                if (!s) return;
                var key = s.split(" (")[0].trim().toLowerCase().replace(/\s+/g, " ");
                if (!(key in byKey)) { byKey[key] = s; order.push(key); }
                else if (s.length > byKey[key].length) { byKey[key] = s; }
            });
        });
        var out = order.map(function (k) { return humanLabel(byKey[k]); });
        if (!out.length) return "";
        var prose = out.some(function (m) { return m.length > 40; });
        var body = prose
            ? '<ul class="hh-nm__list">' + out.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("") + '</ul>'
            : out.map(function (m) { return '<span class="hh-nm__chip">' + esc(m) + '</span>'; }).join("");
        return '<div class="hh-nm">' +
            '<span class="hh-nm__label">Not tracked in this table:</span>' +
            (prose ? "" : " ") + body +
            '</div>';
    }
    function sourceLine(d, keys) {
        var srcs = [];
        (keys || []).forEach(function (k) {
            var v = d && d.data_sources && d.data_sources[k];
            v = v ? humanLabel(v) : v;
            if (v && srcs.indexOf(v) < 0) srcs.push(v);
        });
        return srcs.length ? '<p class="hh-src">Source: ' + esc(srcs.join(" · ")) + '</p>' : "";
    }

    /** Two-column comparison table. rows: {label,a,h,better:'low'|'high'|null,fmt} */
    function compareTable(awayLabel, homeLabel, rows) {
        var body = rows.map(function (r) {
            var av = r.fmt ? r.fmt(r.a) : (hasVal(r.a) ? String(r.a) : null);
            var hv = r.fmt ? r.fmt(r.h) : (hasVal(r.h) ? String(r.h) : null);
            if (av === null && hv === null) return "";
            var an = Number(r.a), hn = Number(r.h);
            var cmp = r.better && !isNaN(an) && !isNaN(hn) && hasVal(r.a) && hasVal(r.h);
            var aBetter = cmp && (r.better === "high" ? an > hn : an < hn);
            var hBetter = cmp && (r.better === "high" ? hn > an : hn < an);
            return '<tr>' +
                '<td class="hh-val' + (aBetter ? " is-better" : "") + '">' + (av === null ? '<span class="hh-na">n/a</span>' : esc(av)) + '</td>' +
                '<td class="hh-stat">' + esc(r.label) + '</td>' +
                '<td class="hh-val' + (hBetter ? " is-better" : "") + '">' + (hv === null ? '<span class="hh-na">n/a</span>' : esc(hv)) + '</td>' +
                '</tr>';
        }).join("");
        if (!body) return "";
        return '<table class="hh-compare"><thead><tr>' +
            '<th>' + esc(awayLabel) + '</th><th>Stat</th><th>' + esc(homeLabel) + '</th>' +
            '</tr></thead><tbody>' + body + '</tbody></table>';
    }

    /* ================================================================
       ALWAYS-VISIBLE MATCHUP COMPARISON CARD
       Every stat a bettor needs to size up a game — records, offense,
       starters, bullpen, lines, community read, trends — renders the
       instant the matchup fetch resolves, with no click required. The
       tabbed dashboard below it (Pitchers/Offense/Bullpens/Trends/
       Markets/Community) still exists for the full research dive; this
       section is a superset summary built from the exact same payload.
       ================================================================ */
    /** "67-40" -> 0.626. Returns null (no comparison, never a fake 50%) when
        the record string cannot be parsed. */
    function winPct(rec) {
        var m = String(rec || "").match(/^(\d+)\s*-\s*(\d+)/);
        if (!m) return null;
        var w = Number(m[1]), l = Number(m[2]);
        return (w + l) ? w / (w + l) : null;
    }
    /** "W4" -> 4, "L2" -> -2, so a longer win streak always compares as
        "better" than a shorter one and any win streak beats any loss streak. */
    function streakVal(s) {
        var m = String(s || "").match(/^([WL])(\d+)$/);
        return m ? (m[1] === "W" ? 1 : -1) * Number(m[2]) : null;
    }
    /** One row of the always-visible comparison grid. Display strings are
        pre-formatted by the caller; aCmp/hCmp are the raw numbers used only to
        decide which side gets the advantage highlight (they are frequently a
        different value than what's displayed — win% drives the highlight on a
        "67-40" record row, for example). */
    function hhcRow(label, aDisplay, hDisplay, aCmp, hCmp, better) {
        if (aDisplay === null && hDisplay === null) return "";
        var an = Number(aCmp), hn = Number(hCmp);
        var cmp = better && hasVal(aCmp) && hasVal(hCmp) && !isNaN(an) && !isNaN(hn);
        var aAdv = cmp && (better === "high" ? an > hn : an < hn);
        var hAdv = cmp && (better === "high" ? hn > an : hn < an);
        return '<div class="hhc-row">' +
            '<span class="hhc-cell' + (aAdv ? " is-adv" : "") + '">' + (aDisplay === null ? '<span class="hh-na">n/a</span>' : esc(aDisplay)) + '</span>' +
            '<span class="hhc-lbl"' + lblAttr(label) + '>' + esc(label) + '</span>' +
            '<span class="hhc-cell' + (hAdv ? " is-adv" : "") + '">' + (hDisplay === null ? '<span class="hh-na">n/a</span>' : esc(hDisplay)) + '</span>' +
            '</div>';
    }
    /** Odds are two-sided by design (vig), so a line row never gets an
        advantage highlight — only real stat rows do. */
    function hhcOddsRow(label, a, h) {
        return '<div class="hhc-row">' +
            '<span class="hhc-cell">' + (a ? esc(a) : '<span class="hh-na">n/a</span>') + '</span>' +
            '<span class="hhc-lbl">' + esc(label) + '</span>' +
            '<span class="hhc-cell">' + (h ? esc(h) : '<span class="hh-na">n/a</span>') + '</span>' +
            '</div>';
    }
    function hhcDivider(label) { return '<div class="hhc-divider">' + esc(label) + '</div>'; }
    function hhcPanel(title, srcNote, body) {
        if (!body) return "";
        return '<div class="hhc-panel"><h3 class="hhc-panel__title">' + esc(title) +
            (srcNote ? ' <span class="hhc-src-inline">' + esc(srcNote) + '</span>' : "") + '</h3>' + body + '</div>';
    }
    /** Plain-language tooltips for stat abbreviations on the comparison grid. */
    var LABEL_TIPS = {
        "OPS": "On-base plus slugging",
        "Starter WHIP": "Walks + hits per inning pitched by the starter",
        "Starter K%": "Percentage of batters the starter strikes out",
        "Starter ERA": "Earned runs per 9 innings for the starter",
        "Bullpen ERA": "Earned runs per 9 innings for the relief corps",
        "Bullpen IP, last 3 G": "Relief innings thrown over the last 3 games — higher means a more taxed bullpen",
        "Last 5": "Record over the last 5 games",
        "Last 10": "Record over the last 10 games",
        "Home / Road Split": "Away team's road record next to the home team's home record",
        "Batting AVG": "Team batting average"
    };
    function lblAttr(label) { return LABEL_TIPS[label] ? ' title="' + esc(LABEL_TIPS[label]) + '"' : ""; }

    function hhcStarterHtml(name, hand, pitcherStats) {
        if (!name) return '<div class="hhc-sp"><strong>Not announced</strong></div>';
        var bits = [];
        if (pitcherStats && pitcherStats.available) {
            if (hasVal(pitcherStats.era)) bits.push("ERA <b>" + esc(fmt2(pitcherStats.era)) + "</b>");
            if (hasVal(pitcherStats.whip)) bits.push("WHIP <b>" + esc(fmt2(pitcherStats.whip)) + "</b>");
            if (hasVal(pitcherStats.k_pct)) bits.push("K% <b>" + esc(fmtPct(pitcherStats.k_pct)) + "</b>");
        }
        return '<div class="hhc-sp"><strong>' + esc(name) + '</strong>' +
            (hand ? '<span class="hh-hand">' + esc(hand) + 'HP</span>' : "") +
            (bits.length ? '<span class="hhc-sp__line">' + bits.join(" · ") + '</span>'
                         : '<span class="hhc-sp__line hhc-muted">Season stats not available for this starter.</span>') +
            '</div>';
    }

    function hhcMarketPanel(game) {
        function sideOdds(groupKey, side) {
            var grp = groupByKey(game, groupKey);
            var items = ((grp && grp.items) || []).filter(priced);
            var teamShort = norm(shortTeam(side === "away" ? game.away_team : game.home_team));
            var it = items.filter(function (x) { return norm(x.selection_label || x.selection || "").indexOf(teamShort) >= 0; })[0];
            return it || null;
        }
        var mlA = sideOdds("full_game", "away"), mlH = sideOdds("full_game", "home");
        var rlA = sideOdds("spread", "away"), rlH = sideOdds("spread", "home");
        var totGrp = groupByKey(game, "total");
        var totItem = ((totGrp && totGrp.items) || []).filter(priced)[0];

        var rows = [];
        if (mlA || mlH) rows.push(hhcOddsRow("Moneyline",
            mlA ? (mlA.odds_display || fmtOdds(mlA.odds)) : null,
            mlH ? (mlH.odds_display || fmtOdds(mlH.odds)) : null));
        if (rlA || rlH) rows.push(hhcOddsRow("Run Line",
            rlA ? String(rlA.line_display || rlA.line || "") + " " + (rlA.odds_display || fmtOdds(rlA.odds)) : null,
            rlH ? String(rlH.line_display || rlH.line || "") + " " + (rlH.odds_display || fmtOdds(rlH.odds)) : null));
        if (totItem) {
            var totLine = String(totItem.line_display || totItem.line || "").replace(/^\+/, "");
            rows.push('<div class="hhc-row"><span class="hhc-cell"></span><span class="hhc-lbl">Total</span><span class="hhc-cell">' + esc(totLine) + '</span></div>');
        }
        var book = pickBook(game);
        var src = book && book.title ? "Source: " + book.title : "Source: sportsbook feed";
        var body = rows.length
            ? '<div class="hhc-grid">' + rows.join("") + '</div>'
            : '<p class="hhc-empty-note">' + (game.lines_pending ? "Lines for this game are not posted yet." : "No sportsbook lines are available for this game right now.") + '</p>';
        return hhcPanel("Betting Lines", src, body);
    }

    function hhcCommunityPanel(game) {
        return hhcPanel("Community & Public Betting", null,
            consensusFor(game) +
            '<p class="hhc-flag">Public betting percentages: <b>not tracked yet</b> — TrustMyRecord does not currently have a licensed public-bet-percentage feed wired in. Shown above is real TMR/external community pick data, not sportsbook handle.</p>');
    }

    function hhcTrendsPanel(game, d, uid) {
        var apiTrends = (d && d.trends) || [];
        var legacy = STATE.trendsByMatchup[game.matchupKey] || [];
        var reps = legacy.length ? rankTrends(legacy) : [];
        var total = apiTrends.length + reps.length;
        var top = apiTrends.length
            ? apiTrends.slice(0, 2).map(function (t, i) { return apiTrendHtml(t, i, uid); }).join("")
            : reps.slice(0, 2).map(trendCardHtml).join("");
        var body = total
            ? top + (total > 2 ? '<p class="hhc-empty-note">' + (total - 2) + ' more in the Trends tab below.</p>' : "")
            : '<p class="hhc-empty-note">No trend cleared the engine\'s sample-size and edge thresholds for this matchup.</p>';
        return hhcPanel("Verified Trends", total ? (total + " cleared the engine") : null, body);
    }

    function hhcLineupNote(name, lineup) {
        if (lineup && lineup.available) {
            var top = lineup.batters.slice(0, 3).map(function (b) { return b.order + ". " + b.name + (b.position ? " (" + b.position + ")" : ""); }).join(", ");
            return '<div><b>' + esc(name) + '</b>: <span class="hhc-flag--ok">Confirmed — ' + esc(top) + (lineup.batters.length > 3 ? "…" : "") + '</span></div>';
        }
        return '<div><b>' + esc(name) + '</b>: <span class="hhc-muted">Not posted yet (usually 1-2 hrs before first pitch).</span></div>';
    }

    function hhcNotesPanel(game, d) {
        var ov = d.overview && d.overview.available ? d.overview : null;
        var lu = d.lineups || {};
        var body = '<div class="hhc-notesgrid">' +
            hhcLineupNote(shortTeam(game.away_team), lu.away) +
            hhcLineupNote(shortTeam(game.home_team), lu.home) +
            '</div>' +
            '<p class="hhc-flag">Injuries / important lineup absences: <b>not tracked yet</b> on this page.</p>' +
            '<p class="hhc-flag">Weather &amp; park factor: <b>not tracked yet</b>' + (ov && ov.venue ? " — venue: <b>" + esc(ov.venue) + "</b>" : "") + '.</p>';
        return hhcPanel("Lineups & Game Notes", null, body);
    }

    /** The full always-visible card. `d` is null while the matchup fetch is
        in flight, which paints a card-shaped skeleton rather than a blank card. */
    function hhcTopHtml(game, d, uid) {
        if (!d) {
            return '<div class="hhc-skel" role="status" aria-label="Loading matchup research">' +
                '<div class="hh-skc__row"></div><div class="hh-skc__row"></div><div class="hh-skc__row hh-skc__row--short"></div>' +
                '</div>';
        }

        var ov = d.overview && d.overview.available ? d.overview : null;
        var rec = d.records || {}, ra = rec.away, rh = rec.home;
        var off = d.offense || {}, oa = off.away, oh = off.home;
        var tp = d.team_pitching || {}, tpa = tp.away, tph = tp.home;
        var pit = d.pitchers || {}, pa = pit.away, ph = pit.home;
        var bp = d.bullpens || {}, ba = bp.away, bh = bp.home;
        function ok(s) { return s && s.available; }

        var pitchersHtml = '<div class="hhc-pitchers">' +
            hhcStarterHtml(ov && ov.away_starter && ov.away_starter.name, ov && ov.away_starter && ov.away_starter.hand, pa) +
            '<span class="hh-vs">vs</span>' +
            hhcStarterHtml(ov && ov.home_starter && ov.home_starter.name, ov && ov.home_starter && ov.home_starter.hand, ph) +
            '</div>';

        var gridRows = [];
        if (ok(ra) || ok(rh)) {
            var ra2 = ra || {}, rh2 = rh || {};
            gridRows.push(hhcDivider("Record"));
            gridRows.push(hhcRow("Record", ra2.record, rh2.record, winPct(ra2.record), winPct(rh2.record), "high"));
            /* Each team's own split is the relevant one for THIS game — the away
               team's road record next to the home team's home record — not a
               like-for-like "away record vs away record" comparison. */
            gridRows.push(hhcRow("Home / Road Split", ra2.away_record, rh2.home_record, winPct(ra2.away_record), winPct(rh2.home_record), "high"));
            gridRows.push(hhcRow("Current Streak", ra2.streak, rh2.streak, streakVal(ra2.streak), streakVal(rh2.streak), "high"));
            gridRows.push(hhcRow("Last 5", ra2.last5, rh2.last5, winPct(ra2.last5), winPct(rh2.last5), "high"));
            gridRows.push(hhcRow("Last 10", ra2.last10, rh2.last10, winPct(ra2.last10), winPct(rh2.last10), "high"));
        }
        var offRows = [];
        if (ok(oa) || ok(oh)) {
            var oa2 = oa || {}, oh2 = oh || {};
            offRows.push(hhcRow("Runs / Game", fmt2(oa2.runs_per_game), fmt2(oh2.runs_per_game), oa2.runs_per_game, oh2.runs_per_game, "high"));
        }
        if (ok(tpa) || ok(tph)) {
            var tpa2 = tpa || {}, tph2 = tph || {};
            offRows.push(hhcRow("Runs Allowed / Game", fmt2(tpa2.runs_allowed_per_game), fmt2(tph2.runs_allowed_per_game), tpa2.runs_allowed_per_game, tph2.runs_allowed_per_game, "low"));
        }
        if (ok(oa) || ok(oh)) {
            var oa3 = oa || {}, oh3 = oh || {};
            offRows.push(hhcRow("Batting AVG", fmtRate(oa3.avg), fmtRate(oh3.avg), oa3.avg, oh3.avg, "high"));
            offRows.push(hhcRow("OPS", fmtRate(oa3.ops), fmtRate(oh3.ops), oa3.ops, oh3.ops, "high"));
            offRows.push(hhcRow("Home Runs", oa3.home_runs, oh3.home_runs, oa3.home_runs, oh3.home_runs, "high"));
        }
        if (offRows.length) { gridRows.push(hhcDivider("Team Offense")); gridRows = gridRows.concat(offRows); }

        var pitRows = [];
        if (ok(pa) || ok(ph)) {
            var pa2 = pa || {}, ph2 = ph || {};
            pitRows.push(hhcRow("Starter ERA", fmt2(pa2.era), fmt2(ph2.era), pa2.era, ph2.era, "low"));
            pitRows.push(hhcRow("Starter WHIP", fmt2(pa2.whip), fmt2(ph2.whip), pa2.whip, ph2.whip, "low"));
            pitRows.push(hhcRow("Starter K%", fmtPct(pa2.k_pct), fmtPct(ph2.k_pct), pa2.k_pct, ph2.k_pct, "high"));
        }
        if (ok(ba) || ok(bh)) {
            var ba2 = ba || {}, bh2 = bh || {};
            pitRows.push(hhcRow("Bullpen ERA", fmt2(ba2.era), fmt2(bh2.era), ba2.era, bh2.era, "low"));
            var baW = ba2.workload, bhW = bh2.workload;
            if (ok(baW) || ok(bhW)) {
                var baIp = ok(baW) ? baW.innings_last_3_games : null, bhIp = ok(bhW) ? bhW.innings_last_3_games : null;
                pitRows.push(hhcRow("Bullpen IP, last 3 G", hasVal(baIp) ? String(baIp) : null, hasVal(bhIp) ? String(bhIp) : null, baIp, bhIp, "low"));
            }
        }
        if (pitRows.length) { gridRows.push(hhcDivider("Pitching")); gridRows = gridRows.concat(pitRows); }

        var gridBody = gridRows.length
            ? '<div class="hhc-grid">' + gridRows.join("") + '</div>' +
              '<p class="hhc-src">Records/streak/L5/L10 computed from completed-game results · runs allowed &amp; bullpen workload from team pitching lines and box scores · lower is better for ERA/WHIP/runs-allowed/bullpen-innings, higher for everything else. Source: MLB Stats API.</p>'
            : '<p class="hhc-empty-note">Team and pitching statistics are not available for this matchup yet.</p>';
        var gridPanel = hhcPanel("Team Comparison", null, gridBody);

        /* Two deterministic columns on desktop: the tall comparison grid on the
           left, market/community/trends/notes stacked on the right. They stack
           back to one column below 1024px (CSS). Cuts card height roughly in
           half without dropping a single data point. */
        return pitchersHtml +
            '<div class="hhc-cols">' +
                '<div class="hhc-col">' + gridPanel + '</div>' +
                '<div class="hhc-col">' + hhcMarketPanel(game) + hhcCommunityPanel(game) + hhcTrendsPanel(game, d, uid) + hhcNotesPanel(game, d) + '</div>' +
            '</div>';
    }

    /* ---------------- OVERVIEW ---------------- */
    function overviewHtml(d, game) {
        var na = sectionNa(d.overview, "Probable pitchers and venue are not available for this matchup.");
        var errs = (d.errors && d.errors.length)
            ? '<div class="hh-state hh-state--err"><strong>Some providers failed</strong><p>' +
              esc(d.errors.map(function (e) { return typeof e === "string" ? e : (e.message || e.reason || JSON.stringify(e)); }).join(" · ")) +
              '</p></div>'
            : "";
        if (na) return errs + na;
        var ov = d.overview;
        var t = ov.game_time ? new Date(ov.game_time) : null;
        var timeStr = t && !isNaN(t) ? t.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;

        function starter(s, side) {
            if (!s || !s.name) {
                return '<div class="hh-start"><span class="hh-start__side">' + side + '</span><strong>Not announced</strong></div>';
            }
            return '<div class="hh-start">' +
                '<span class="hh-start__side">' + side + '</span>' +
                '<strong>' + esc(s.name) + '</strong>' +
                (s.hand ? '<span class="hh-hand">' + esc(s.hand) + 'HP</span>' : "") +
                '</div>';
        }
        var facts = [];
        if (ov.venue) facts.push(["Venue", ov.venue]);
        if (timeStr) facts.push(["First pitch", timeStr]);
        if (hasVal(ov.game_pk)) facts.push(["MLB game ID", ov.game_pk]);

        /* At-a-glance pulls only values that already exist elsewhere in the payload. */
        var glance = [];
        var pa = d.pitchers && d.pitchers.away, ph = d.pitchers && d.pitchers.home;
        var oa = d.offense && d.offense.away, oh = d.offense && d.offense.home;
        if (pa && pa.available && ph && ph.available && hasVal(pa.era) && hasVal(ph.era)) {
            glance.push(["Starter ERA", pa.era + " / " + ph.era]);
        }
        if (oa && oa.available && oh && oh.available && hasVal(oa.runs_per_game) && hasVal(oh.runs_per_game)) {
            glance.push(["Runs per game", oa.runs_per_game + " / " + oh.runs_per_game]);
        }

        return errs +
            '<div class="hh-starters">' + starter(ov.away_starter, "Away") + '<span class="hh-vs">vs</span>' + starter(ov.home_starter, "Home") + '</div>' +
            (facts.length ? '<dl class="hh-facts">' + facts.map(function (f) {
                return '<div><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd></div>';
            }).join("") + '</dl>' : "") +
            (glance.length ? '<dl class="hh-facts hh-facts--glance"><div class="hh-facts__cap">' + esc(shortTeam(game.away_team)) + ' / ' + esc(shortTeam(game.home_team)) + '</div>' + glance.map(function (f) {
                return '<div><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd></div>';
            }).join("") + '</dl>' : "");
        /* The overview deliberately renders NO provider-gap list and no source
           credit. Its gaps (weather, park factor, lineups, line movement) are
           whole features that simply are not built yet, not columns missing from
           a table on screen — listing raw feed tokens on a public research page
           read as a developer TODO and told a bettor nothing. Sections that DO
           show a stat table still disclose which of its columns are absent. */
    }

    /* ---------------- PITCHERS ---------------- */
    /* ERA / FIP / xERA is the whole point of this tab, so it leads rather than
       sitting in a table row. ERA is what happened; FIP strips out defence and
       sequencing; xERA prices the contact quality actually allowed. When they
       diverge, that gap is the handicapping read. The ERA-xERA delta below is
       plain subtraction of two real provider numbers, labelled as such. It is a
       description of the gap, never a projection. */
    function runPrevCard(name, hand, side, p, sv) {
        var xera = (sv && sv.available) ? sv.xera : null;
        var vals = [
            { k: "ERA", v: p.era, t: "Earned runs actually allowed" },
            { k: "FIP", v: p.fip, t: "Fielding independent: strips out defence and sequencing" },
            { k: "xERA", v: xera, t: "Expected ERA from the contact quality allowed (Statcast)" }
        ];
        var cells = vals.map(function (c) {
            return '<div class="hh-rp__cell" title="' + esc(c.t) + '">' +
                '<span class="hh-rp__k">' + esc(c.k) + '</span>' +
                '<span class="hh-rp__v">' + (hasVal(c.v) ? esc(Number(c.v).toFixed(2)) : '<span class="hh-na">n/a</span>') + '</span>' +
                '</div>';
        }).join('<span class="hh-rp__sep" aria-hidden="true">/</span>');

        var verdict = "";
        if (hasVal(p.era) && hasVal(xera)) {
            var delta = Number(p.era) - Number(xera);
            var abs = Math.abs(delta).toFixed(2);
            var cls, txt;
            if (delta <= -0.5) {
                cls = "is-warn";
                txt = "ERA is " + abs + " lower than xERA. The run prevention is running ahead of the contact quality allowed.";
            } else if (delta >= 0.5) {
                cls = "is-good";
                txt = "ERA is " + abs + " higher than xERA. The contact quality allowed has been better than the ERA shows.";
            } else {
                cls = "is-flat";
                txt = "ERA and xERA are within " + abs + ". Results line up with the contact allowed.";
            }
            verdict = '<p class="hh-rp__verdict ' + cls + '">' + esc(txt) + '</p>';
        } else if (hasVal(p.era) && !hasVal(xera)) {
            verdict = '<p class="hh-rp__verdict is-flat">xERA is unavailable for this starter, so ERA cannot be compared to contact quality.</p>';
        }
        return '<div class="hh-rp__card">' +
            '<div class="hh-rp__head"><span class="hh-rp__side">' + esc(side) + '</span>' +
                '<strong>' + esc(name) + '</strong>' + (hand ? '<span class="hh-hand">' + esc(hand) + 'HP</span>' : "") + '</div>' +
            '<div class="hh-rp__row">' + cells + '</div>' + verdict +
            '</div>';
    }

    function statcastHtml(aName, hName, asv, hsv) {
        var aOk = asv && asv.available, hOk = hsv && hsv.available;
        if (!aOk && !hOk) {
            var why = [];
            if (asv && asv.reason) why.push(aName + ": " + asv.reason + (asv.detail ? " (" + asv.detail + ")" : ""));
            if (hsv && hsv.reason) why.push(hName + ": " + hsv.reason + (hsv.detail ? " (" + hsv.detail + ")" : ""));
            return unavailableHtml("Statcast data is not available for either starter.", why.join(" · ") || undefined);
        }
        var a = aOk ? asv : {}, h = hOk ? hsv : {};
        var partial = "";
        if (!aOk && asv) partial += '<div class="hh-half-na">' + esc(aName) + ': ' + esc(asv.reason || "no Statcast row") + (asv.detail ? " (" + esc(asv.detail) + ")" : "") + '</div>';
        if (!hOk && hsv) partial += '<div class="hh-half-na">' + esc(hName) + ': ' + esc(hsv.reason || "no Statcast row") + (hsv.detail ? " (" + esc(hsv.detail) + ")" : "") + '</div>';

        var quality = compareTable(aName, hName, [
            { label: "xERA", a: a.xera, h: h.xera, better: "low", fmt: fmt2 },
            { label: "Barrel%", a: a.barrel_pct, h: h.barrel_pct, better: "low", fmt: fmtPct },
            { label: "Hard-hit%", a: a.hard_hit_pct, h: h.hard_hit_pct, better: "low", fmt: fmtPct },
            { label: "Barrels", a: a.barrels, h: h.barrels, better: "low" },
            { label: "Batted balls", a: a.batted_balls, h: h.batted_balls },
            { label: "wOBA against", a: a.woba, h: h.woba, better: "low", fmt: fmtRate },
            { label: "xwOBA against", a: a.est_woba, h: h.est_woba, better: "low", fmt: fmtRate },
            { label: "xBA against", a: a.est_ba, h: h.est_ba, better: "low", fmt: fmtRate },
            { label: "xSLG against", a: a.est_slg, h: h.est_slg, better: "low", fmt: fmtRate }
        ]);
        /* These two Savant columns are AVERAGE EXIT VELOCITY in mph for each
           batted-ball group. They are NOT GB%/FB% and no rate is derived from
           them. Unit is rendered on every value so they can't be misread. */
        function mph(v) { return hasVal(v) ? Number(v).toFixed(1) + " mph" : null; }
        var ev = compareTable(aName, hName, [
            { label: "Avg exit velocity", a: a.avg_exit_velocity, h: h.avg_exit_velocity, better: "low", fmt: mph },
            { label: "Max exit velocity", a: a.max_exit_velocity, h: h.max_exit_velocity, better: "low", fmt: mph },
            { label: "Avg EV, ground balls", a: a.avg_exit_velocity_groundballs, h: h.avg_exit_velocity_groundballs, better: "low", fmt: mph },
            { label: "Avg EV, fly balls + line drives", a: a.avg_exit_velocity_fb_ld, h: h.avg_exit_velocity_fb_ld, better: "low", fmt: mph }
        ]);
        return partial +
            (quality ? '<div class="hh-sub"><h4 class="hh-sub__title">Contact quality allowed <span class="hh-count">lower is better for the pitcher</span></h4>' + quality + '</div>' : "") +
            (ev ? '<div class="hh-sub"><h4 class="hh-sub__title">Exit velocity splits <span class="hh-count">mph, not batted-ball rates</span></h4>' + ev +
                  '<p class="hh-trend__why">These are average exit velocities in mph for each batted-ball group. They are not GB% / FB% and no batted-ball rate is derived from them.</p></div>' : "");
    }

    function pitchMixTable(name, sv) {
        if (!sv || !sv.available) {
            return '<div class="hh-mix"><h5 class="hh-mix__name">' + esc(name) + '</h5>' +
                unavailableHtml("Pitch mix is not available for this starter.",
                    sv && sv.reason ? sv.reason + (sv.detail ? " (" + sv.detail + ")" : "") : undefined) + '</div>';
        }
        var mix = (sv.pitch_mix || []).slice().sort(function (x, y) { return (Number(y.usage_pct) || 0) - (Number(x.usage_pct) || 0); });
        if (!mix.length) {
            return '<div class="hh-mix"><h5 class="hh-mix__name">' + esc(name) + '</h5>' +
                unavailableHtml("No pitch-mix rows were returned for this starter.") + '</div>';
        }
        var rows = mix.map(function (p) {
            var usage = Number(p.usage_pct) || 0;
            return '<tr>' +
                '<td class="hh-mix__pitch"><span class="hh-mix__bar" style="width:' + Math.max(0, Math.min(100, usage)) + '%" aria-hidden="true"></span>' +
                    '<span class="hh-mix__label">' + esc(p.pitch || "") + '</span></td>' +
                '<td>' + (hasVal(p.usage_pct) ? esc(usage.toFixed(1)) + "%" : '<span class="hh-na">n/a</span>') + '</td>' +
                '<td>' + (hasVal(p.pitches) ? esc(p.pitches) : '<span class="hh-na">n/a</span>') + '</td>' +
                '<td>' + (hasVal(p.whiff_pct) ? esc(Number(p.whiff_pct).toFixed(1)) + "%" : '<span class="hh-na">n/a</span>') + '</td>' +
                '<td>' + (hasVal(p.k_pct) ? esc(Number(p.k_pct).toFixed(1)) + "%" : '<span class="hh-na">n/a</span>') + '</td>' +
                '<td>' + (hasVal(p.est_woba) ? esc(fmtRate(p.est_woba)) : '<span class="hh-na">n/a</span>') + '</td>' +
                '<td>' + (hasVal(p.hard_hit_pct) ? esc(Number(p.hard_hit_pct).toFixed(1)) + "%" : '<span class="hh-na">n/a</span>') + '</td>' +
                '</tr>';
        }).join("");
        return '<div class="hh-mix"><h5 class="hh-mix__name">' + esc(name) + ' <span class="hh-count">' + mix.length + ' pitches</span></h5>' +
            '<div class="hh-mixscroll"><table class="hh-mixtbl">' +
            '<thead><tr><th>Pitch</th><th>Usage</th><th>#</th><th>Whiff%</th><th>K%</th><th>xwOBA</th><th>Hard-hit%</th></tr></thead>' +
            '<tbody>' + rows + '</tbody></table></div></div>';
    }

    function pitchersHtml(d, game) {
        var sec = d.pitchers;
        if (!sec) return unavailableHtml("Starting pitcher stats were not returned by the research API.");
        var na = sectionNa(sec, "Starting pitcher stats are not available for this matchup.");
        if (na) return na;
        var a = sec.away || {}, h = sec.home || {};
        var aNa = sectionNa(a), hNa = sectionNa(h);
        if (aNa && hNa) return unavailableHtml((a.reason || "") + (h.reason && h.reason !== a.reason ? " " + h.reason : "") || "Neither starter has stats available.");

        var ov = d.overview || {};
        var aS = ov.away_starter || {}, hS = ov.home_starter || {};
        var aName = aS.name || shortTeam(game.away_team) + " starter";
        var hName = hS.name || shortTeam(game.home_team) + " starter";
        var asv = a.savant || null, hsv = h.savant || null;

        var partial = "";
        if (aNa) partial += '<div class="hh-half-na">' + esc(aName) + ': ' + esc(a.reason || "stats unavailable") + '</div>';
        if (hNa) partial += '<div class="hh-half-na">' + esc(hName) + ': ' + esc(h.reason || "stats unavailable") + '</div>';

        var fipSrc = a.fip_constant_source || h.fip_constant_source;
        var runPrev = '<div class="hh-sub"><h4 class="hh-sub__title">Run prevention <span class="hh-count">ERA vs FIP vs xERA</span></h4>' +
            '<div class="hh-rp">' +
                runPrevCard(aName, aS.hand, "Away", a, asv) +
                runPrevCard(hName, hS.hand, "Home", h, hsv) +
            '</div>' +
            (fipSrc ? '<p class="hh-src">FIP constant: ' + esc(fipSrc) + '. xERA: Baseball Savant.</p>' : "") +
            '</div>';

        /* Rate stats keep a fixed 2dp so the season line and the run-prevention
           cards can't disagree cosmetically (4.1 vs 4.10). */
        var trad = compareTable(aName, hName, [
            { label: "ERA", a: a.era, h: h.era, better: "low", fmt: fmt2 },
            { label: "FIP", a: a.fip, h: h.fip, better: "low", fmt: fmt2 },
            { label: "WHIP", a: a.whip, h: h.whip, better: "low", fmt: fmt2 },
            { label: "Innings", a: a.innings_pitched, h: h.innings_pitched },
            { label: "Games started", a: a.games_started, h: h.games_started },
            { label: "Strikeouts", a: a.strikeouts, h: h.strikeouts, better: "high" },
            { label: "Walks", a: a.walks, h: h.walks, better: "low" },
            { label: "Hit by pitch", a: a.hit_by_pitch, h: h.hit_by_pitch, better: "low" },
            { label: "Batters faced", a: a.batters_faced, h: h.batters_faced },
            { label: "K%", a: a.k_pct, h: h.k_pct, better: "high", fmt: fmtPct },
            { label: "BB%", a: a.bb_pct, h: h.bb_pct, better: "low", fmt: fmtPct },
            { label: "K-BB%", a: a.k_bb_pct, h: h.k_bb_pct, better: "high", fmt: fmtPct },
            { label: "HR allowed", a: a.home_runs_allowed, h: h.home_runs_allowed, better: "low" }
        ]);
        var tradBlock = trad
            ? '<div class="hh-sub"><h4 class="hh-sub__title">Season line</h4>' + trad + '</div>'
            : unavailableHtml("No starter stat lines were returned.");

        var mixBlock = '<div class="hh-sub"><h4 class="hh-sub__title">Pitch mix <span class="hh-count">usage, whiff and contact by pitch</span></h4>' +
            pitchMixTable(aName, asv) + pitchMixTable(hName, hsv) + '</div>';

        return partial + runPrev + tradBlock +
            statcastHtml(aName, hName, asv, hsv) +
            mixBlock +
            notAvailableList([
                a.unavailable_metrics, h.unavailable_metrics,
                asv && asv.unavailable_metrics, hsv && hsv.unavailable_metrics
            ]) +
            sourceLine(d, ["pitchers", "savant"]);
    }

    /* ---------------- OFFENSE ---------------- */
    function offenseHtml(d, game) {
        var sec = d.offense;
        if (!sec) return unavailableHtml("Team offense stats were not returned by the research API.");
        var na = sectionNa(sec, "Team offense stats are not available for this matchup.");
        if (na) return na;
        var a = sec.away || {}, h = sec.home || {};
        var aNa = sectionNa(a), hNa = sectionNa(h);
        if (aNa && hNa) return unavailableHtml("Team offense stats are not available for either club.");
        var table = compareTable(shortTeam(game.away_team), shortTeam(game.home_team), [
            { label: "Games", a: a.games, h: h.games },
            { label: "Runs", a: a.runs, h: h.runs, better: "high" },
            { label: "Runs / game", a: a.runs_per_game, h: h.runs_per_game, better: "high" },
            { label: "AVG", a: a.avg, h: h.avg, better: "high", fmt: fmtRate },
            { label: "OBP", a: a.obp, h: h.obp, better: "high", fmt: fmtRate },
            { label: "SLG", a: a.slg, h: h.slg, better: "high", fmt: fmtRate },
            { label: "OPS", a: a.ops, h: h.ops, better: "high", fmt: fmtRate },
            { label: "ISO", a: a.iso, h: h.iso, better: "high", fmt: fmtRate },
            { label: "Home runs", a: a.home_runs, h: h.home_runs, better: "high" },
            { label: "Walks", a: a.walks, h: h.walks, better: "high" },
            { label: "Strikeouts", a: a.strikeouts, h: h.strikeouts, better: "low" }
        ]);
        var partial = "";
        if (aNa) partial += '<div class="hh-half-na">' + esc(shortTeam(game.away_team)) + ': ' + esc(a.reason || "stats unavailable") + '</div>';
        if (hNa) partial += '<div class="hh-half-na">' + esc(shortTeam(game.home_team)) + ': ' + esc(h.reason || "stats unavailable") + '</div>';
        return partial + (table || unavailableHtml("No offense stat lines were returned.")) +
            notAvailableList([a.unavailable_metrics, h.unavailable_metrics]) +
            sourceLine(d, ["offense"]);
    }

    /* ---------------- BULLPENS ---------------- */
    function bullpensHtml(d, game) {
        var sec = d.bullpens;
        if (!sec) return unavailableHtml("Bullpen stats were not returned by the research API.");
        var na = sectionNa(sec, "Bullpen stats are not available for this matchup.");
        if (na) return na;
        var a = sec.away || {}, h = sec.home || {};
        var aNa = sectionNa(a), hNa = sectionNa(h);
        if (aNa && hNa) return unavailableHtml("Bullpen stats are not available for either club.");
        var table = compareTable(shortTeam(game.away_team) + " bullpen", shortTeam(game.home_team) + " bullpen", [
            { label: "ERA", a: a.era, h: h.era, better: "low" },
            { label: "WHIP", a: a.whip, h: h.whip, better: "low" },
            { label: "Innings", a: a.innings_pitched, h: h.innings_pitched },
            { label: "Strikeouts", a: a.strikeouts, h: h.strikeouts, better: "high" },
            { label: "Walks", a: a.walks, h: h.walks, better: "low" }
        ]);
        var partial = "";
        if (aNa) partial += '<div class="hh-half-na">' + esc(shortTeam(game.away_team)) + ': ' + esc(a.reason || "stats unavailable") + '</div>';
        if (hNa) partial += '<div class="hh-half-na">' + esc(shortTeam(game.home_team)) + ': ' + esc(h.reason || "stats unavailable") + '</div>';
        return partial + (table || unavailableHtml("No bullpen stat lines were returned.")) +
            notAvailableList([a.unavailable_metrics, h.unavailable_metrics]) +
            sourceLine(d, ["bullpen"]);
    }

    /* ---------------- TRENDS (verified engine) ---------------- */
    function confBadge(c) {
        var k = String(c || "").toLowerCase();
        var cls = k === "high" ? "rel-high" : k === "moderate" ? "rel-moderate" : k === "low" ? "rel-low" : "rel-supporting";
        return '<span class="hh-trend__rel ' + cls + '">' + esc(k ? k + " confidence" : "confidence n/a") + '</span>';
    }
    function apiTrendHtml(t, idx, uid) {
        var edge = Number(t.edge_pct);
        var edgeKnown = hasVal(t.edge_pct) && !isNaN(edge);
        /* edge_pct is signed: positive beats the baseline, negative under-performs
           it (a fade signal). Both are real findings and are labelled as such. */
        var edgeCls = !edgeKnown ? "" : edge > 0 ? "is-pos" : edge < 0 ? "is-neg" : "";
        var edgeTxt = !edgeKnown ? null : (edge > 0 ? "+" : "") + edge.toFixed(1) + " pts vs baseline";

        var stats = [];
        if (t.record) stats.push("Record <b>" + esc(t.record) + "</b>");
        if (hasVal(t.win_pct)) stats.push("Win% <b>" + esc(Number(t.win_pct).toFixed(2)) + "%</b>");
        if (hasVal(t.expected_win_pct)) stats.push("Baseline <b>" + esc(Number(t.expected_win_pct).toFixed(2)) + "%</b>");
        if (hasVal(t.sample)) stats.push("Sample <b>" + esc(t.sample) + "</b>");
        if (t.date_range) stats.push("Range <b>" + esc(t.date_range) + "</b>");
        if (hasVal(t.seasons_covered)) stats.push("Seasons <b>" + esc(t.seasons_covered) + "</b>");
        var u = fmtSigned(t.units, "u");
        if (u) stats.push("Units <b class=\"" + (Number(t.units) >= 0 ? "is-pos" : "is-neg") + "\">" + esc(u) + "</b>");
        var roi = fmtSigned(t.roi_pct, "%");
        if (roi) stats.push("ROI <b class=\"" + (Number(t.roi_pct) >= 0 ? "is-pos" : "is-neg") + "\">" + esc(roi) + "</b>");

        var baseline = t.baseline_type
            ? '<p class="hh-trend__why">Measured against <b>' + esc(String(t.baseline_type).replace(/_/g, " ")) + '</b>' +
              (hasVal(t.expected_win_pct) ? " (" + esc(Number(t.expected_win_pct).toFixed(2)) + "% expected)" : "") + '.</p>'
            : "";

        var gid = "tg-" + uid + "-" + idx;
        var games = (t.games && t.games.length)
            ? '<details class="hh-trend__games" data-games="' + esc(gid) + '">' +
                '<summary>View all ' + t.games.length + ' sample game' + (t.games.length === 1 ? "" : "s") + '</summary>' +
                '<div class="hh-gamesbox" data-gamesbox><p class="hh-skel">Building game list…</p></div>' +
              '</details>'
            : "";

        var related = (t.related && t.related.length)
            ? '<details class="hh-trend__related"><summary>' + t.related.length + ' related trend' + (t.related.length > 1 ? "s" : "") + '</summary><ul>' +
              t.related.map(function (r) { return "<li>" + esc(r.statement || r.claim || "") + (r.record ? " (" + esc(r.record) + ")" : "") + "</li>"; }).join("") +
              '</ul></details>'
            : "";

        return '<div class="hh-trend">' +
            '<div class="hh-trend__top">' +
                '<span class="hh-trend__side">' + esc(String(t.market || "").replace(/_/g, " ")) + (t.side ? ' · <b>' + esc(t.side) + '</b>' : "") + '</span>' +
                confBadge(t.confidence) +
            '</div>' +
            '<p class="hh-trend__claim">' + esc(t.statement || "") + '</p>' +
            (edgeTxt ? '<div class="hh-edge ' + edgeCls + '">' + esc(edgeTxt) + (edge < 0 ? ' <span class="hh-edge__note">under-performs the baseline (fade signal)</span>' : "") + '</div>' : "") +
            '<div class="hh-trend__stats">' + stats.map(function (s) { return "<span>" + s + "</span>"; }).join("") + '</div>' +
            baseline +
            games + related +
            '</div>';
    }
    /* Sample-game tables are built on first open: some trends carry 180+ games
       and eagerly rendering every row for every trend bloats the DOM. */
    function wireTrendGames(scope, trends) {
        Array.prototype.forEach.call(scope.querySelectorAll("[data-games]"), function (det) {
            det.addEventListener("toggle", function () {
                if (!det.open || det.dataset.built === "1") return;
                det.dataset.built = "1";
                var idx = Number(det.getAttribute("data-games").split("-").pop());
                var t = trends[idx];
                var box = det.querySelector("[data-gamesbox]");
                if (!t || !box) return;
                var rows = t.games.map(function (g) {
                    var oc = String(g.outcome || "").toLowerCase();
                    var cls = oc === "win" ? "is-win" : oc === "loss" ? "is-loss" : "is-push";
                    return '<tr>' +
                        '<td>' + esc(String(g.date || "").slice(0, 10)) + '</td>' +
                        '<td>' + esc(g.matchup || "") + '</td>' +
                        '<td>' + esc(g.score || "") + '</td>' +
                        '<td>' + esc(hasVal(g.odds) ? fmtOdds(g.odds) : "") + '</td>' +
                        '<td class="' + cls + '">' + esc(g.outcome || "") + '</td>' +
                        '</tr>';
                }).join("");
                var sql = (t.query && t.query.sql)
                    ? '<details class="hh-sql"><summary>Query used</summary><pre>' + esc(t.query.sql) +
                      (t.query.params ? "\n\nparams: " + esc(JSON.stringify(t.query.params)) : "") + '</pre></details>'
                    : "";
                box.innerHTML = '<div class="hh-gamesscroll"><table class="hh-gamestbl">' +
                    '<thead><tr><th>Date</th><th>Matchup</th><th>Score</th><th>Odds</th><th>Result</th></tr></thead>' +
                    '<tbody>' + rows + '</tbody></table></div>' + sql;
            });
        });
    }

    /* Compact trend block pinned under Overview so opening a matchup shows the
       research dashboard AND its verified trends without a second click. Same
       ranked data the Trends tab renders — top 3, then a jump to the full tab.
       Renders nothing at all when there is no trend to show. */
    function overviewTrendsHtml(d, game) {
        var api = (d.trends || []).length;
        var legacy = STATE.trendsByMatchup[game.matchupKey] || [];
        var reps = legacy.length ? rankTrends(legacy) : [];
        var total = api + reps.length;
        if (!total) return "";
        var TOP = 3;
        return '<section class="hh-tsec hh-tsec--ov">' +
            '<div class="hh-tsec__head">' +
                '<h4 class="hh-tsec__title">Matchup Trends</h4>' +
                '<span class="hh-tsec__count">' + total + ' verified</span>' +
            '</div>' +
            '<div class="hh-tsec__list">' + reps.slice(0, TOP).map(trendCardHtml).join("") + '</div>' +
            '<button type="button" class="hh-tsec__all" data-gototrends>' +
                '<span>' + (total > TOP ? 'See all ' + total + ' trends' : 'Open the Trends tab') + '</span>' +
                '<span class="hh-tsec__arrow" aria-hidden="true">→</span>' +
            '</button></section>';
    }

    /* Trends panel order: real trends first, engine notices after. The strict
       matchup engine and the TrendSpotter slate feed run different thresholds,
       so the engine returning nothing while the feed has verified trends is
       normal — leading with its "no verified trends" state made a panel holding
       real trends read as empty. Nothing about the data itself changes here. */
    function trendsHtml(d, game, uid) {
        var out = "";
        var trends = d.trends || [];
        var meta = d.trend_meta || {};
        if (trends.length) {
            out += '<div class="hh-sub"><h4 class="hh-sub__title">Verified trends <span class="hh-count">' + trends.length + ' cleared the engine</span></h4>' +
                trends.map(function (t, i) { return apiTrendHtml(t, i, uid); }).join("") + '</div>';
        }

        /* TrendSpotter slate feed, kept alive alongside the verified engine. */
        var legacy = STATE.trendsByMatchup[game.matchupKey] || [];
        var reps = legacy.length ? rankTrends(legacy) : [];
        if (reps.length) {
            var TOP = 6;
            out += '<section class="hh-tsec">' +
                '<div class="hh-tsec__head">' +
                    '<h4 class="hh-tsec__title">Matchup Trends</h4>' +
                    '<span class="hh-tsec__count">' + reps.length + ' verified</span>' +
                '</div>' +
                '<div class="hh-tsec__list">' + reps.slice(0, TOP).map(trendCardHtml).join("") + '</div>' +
                (reps.length > TOP
                    ? '<button type="button" class="hh-tsec__all" data-viewall><span>Show the remaining ' + (reps.length - TOP) + '</span><span class="hh-tsec__arrow" aria-hidden="true">↓</span></button>' +
                      '<div class="hh-tsec__list" data-more hidden>' + reps.slice(TOP).map(trendCardHtml).join("") + '</div>'
                    : "") +
                '</section>';
        }

        if (!trends.length) {
            /* No invented filler. State the engine's real reason + real thresholds.
               Demoted to a footnote when the feed already supplied trends above,
               kept as the full empty state when the panel is genuinely empty. */
            var note = meta.note ||
                ("No trend cleared the engine's thresholds for this matchup" +
                 (hasVal(meta.min_sample) ? " (minimum sample " + meta.min_sample + " games)" : "") + ".");
            if (reps.length) {
                var bl = meta.baseline ? String(meta.baseline) : "";
                if (bl) bl = " " + bl.charAt(0).toUpperCase() + bl.slice(1) + ".";
                out += '<p class="hh-src">Strict matchup engine: ' + esc(note) + esc(bl) + '</p>';
            } else {
                out += '<div class="hh-state hh-state--na"><strong>No verified trends</strong><p>' + esc(note) + '</p>' +
                    (meta.baseline ? '<p class="hh-state__detail">' + esc(meta.baseline) + '</p>' : "") + '</div>';
            }
        } else if (meta.baseline) {
            out += '<p class="hh-src">Baseline: ' + esc(meta.baseline) + '</p>';
        }
        return out;
    }

    /* ---------------- legacy trend ranking + dedup ---------------- */
    function marketBucket(t) {
        var m = String(t.market || t.bet_type || "").toUpperCase();
        if (m.indexOf("TEAM_TOTAL") >= 0 || m.indexOf("TEAM TOTAL") >= 0) return "TEAM_TOTAL";
        if (m.indexOf("TOTAL") >= 0) return "TOTAL";
        if (m.indexOf("SPREAD") >= 0 || m.indexOf("RUN") >= 0) return "SPREAD";
        return "MONEYLINE";
    }
    function sideText(t, bucket) {
        if (bucket === "TOTAL" || bucket === "TEAM_TOTAL") {
            var explicit = String(t.side || "").toUpperCase();
            if (explicit === "OVER" || explicit === "UNDER") {
                return { label: explicit === "OVER" ? "Over" : "Under", type: "total" };
            }
            var over = /over/i.test(t.claim || "") && !/under/i.test((t.claim || "").split(/over/i)[0] || "");
            return { label: over ? "Over" : (/under/i.test(t.claim || "") ? "Under" : "Total"), type: "total" };
        }
        return { label: t.team_abbr || t.team || "", type: "side" };
    }

    /* ---------------- reader-facing trend copy ----------------
       The feed ships engineer-grade claim strings: "Los Angeles Dodgers is 7-3
       on the SPREAD in its last 10 completed games with verified spread lines."
       Wrong number agreement, a raw market enum, and a data-provenance clause a
       bettor did not ask for. Every field needed to write the sentence properly
       is already structured on the trend, so the sentence is rebuilt here and
       the backend string is only a fallback. Nothing about the DATA changes —
       record, sample, hit rate and market all still come straight off the feed. */
    var MARKET_LABEL = { MONEYLINE: "Moneyline", SPREAD: "Run line", TOTAL: "Total", TEAM_TOTAL: "Team total" };
    /** "Los Angeles Dodgers" -> "Dodgers"; keeps two-word nicknames intact. */
    function teamNick(name) {
        var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return "";
        var last = parts[parts.length - 1];
        if (parts.length > 1 && /^(sox|jays)$/i.test(last)) return parts.slice(-2).join(" ");
        return last;
    }
    function recordWins(rec) {
        var m = String(rec || "").match(/^(\d+)\s*-\s*(\d+)/);
        return m ? Number(m[1]) : null;
    }
    /** Last-resort cleanup of a backend claim we could not rebuild from fields. */
    function sanitizeClaim(s) {
        return String(s || "")
            .replace(/\bon the SPREAD\b/g, "on the run line")
            .replace(/\bSPREAD\b/g, "run line")
            .replace(/\bMONEYLINE\b/g, "moneyline")
            .replace(/\bTEAM_TOTAL\b/g, "team total")
            .replace(/\bTOTAL\b/g, "total")
            .replace(/\s+with verified [a-z- ]*lines\b/gi, "")
            .replace(/\bin its last\b/g, "in their last")
            .replace(/^(.*?) is (\d+-\d+)/, "The $1 are $2");
    }
    function trendStatement(t, bucket, side) {
        var nick = teamNick(t.team_abbr || t.team || "");
        var n = Number(t.sample) || 0;
        var rec = String(t.record || "");
        var wins = recordWins(rec);
        var kind = String(t.kind || t.trend_type || "").toUpperCase();
        var span = kind === "HOME" ? "home games" : kind === "AWAY" ? "road games" : "games";
        if (!nick || !n || !rec) return sanitizeClaim(t.claim);
        if (bucket === "MONEYLINE") {
            return "The " + nick + " are " + rec + " straight up over their last " + n + " " + span + ".";
        }
        if (bucket === "SPREAD") {
            return "The " + nick + " are " + rec + " against the run line over their last " + n + " " + span + ".";
        }
        if (wins === null) return sanitizeClaim(t.claim);
        if (bucket === "TOTAL") {
            return nick + " games have gone " + side.label + " in " + wins + " of the last " + n + ".";
        }
        return "The " + nick + " have gone " + side.label + " their team total in " + wins +
            " of their last " + n + " games.";
    }
    /** "Supports" is a claim about direction and is only earned above 50%.
        A losing split is still worth showing — it is a fade signal — but saying
        a 4-6 run-line record "supports" that side is simply false. */
    function trendStance(rel, side) {
        var wp = Number(rel.wp);
        /* The card head already names the team, so a team-side badge only has to
           carry the direction; totals still need Over/Under spelled out. */
        var who = side.type === "total" ? (side.label || "") : "";
        if (isNaN(wp) || (side.type === "total" && !who)) return null;
        var suffix = who ? " " + who : "";
        if (wp > 0.5) return { cls: "is-for", text: "Supports" + suffix };
        if (wp < 0.5) return { cls: "is-against", text: "Fades" + suffix };
        return { cls: "is-even", text: "Even split" };
    }
    var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    /** "2026-06-13 to 2026-07-19" -> "Jun 13 – Jul 19". Returns "" if unparsable. */
    function compactRange(dr) {
        var m = String(dr || "").match(/(\d{4})-(\d{2})-(\d{2}).*?(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return "";
        var a = MON[Number(m[2]) - 1] + " " + Number(m[3]);
        var b = MON[Number(m[5]) - 1] + " " + Number(m[6]);
        return a === b ? a : a + " – " + b;
    }
    function relevance(t, bucket) {
        var sample = Number(t.sample) || 0;
        var wp = Number(t.win_percentage);
        if (isNaN(wp)) wp = 0.5;
        var base = Number(t.internal_scoring && t.internal_scoring.score);
        if (isNaN(base)) base = Number(t.mind_blowing_score);
        if (isNaN(base)) base = wp * 7 + Math.min(3, sample / 4);
        var score = base;
        if (sample >= 8) score += 1.2; else if (sample >= 5) score += 0.5; else if (sample < 4) score -= 3;
        score += Math.min(1.5, Math.abs(wp - 0.5) * 4);
        var dr = String(t.date_range || "");
        var m = dr.match(/(\d{4}-\d{2}-\d{2})\s*$/);
        if (m) {
            var days = (Date.now() - Date.parse(m[1])) / 86400000;
            if (days <= 14) score += 1; else if (days <= 30) score += 0.4; else if (days > 90) score -= 1;
        }
        var dataMined = (bucket === "TOTAL" || bucket === "TEAM_TOTAL") &&
            (String(t.kind || t.trend_type || "").toUpperCase().indexOf("SCORING") >= 0 || bucket === "TEAM_TOTAL");
        var tier;
        if (dataMined) tier = sample >= 6 ? "supporting" : "low";
        else if (score >= 8 && sample >= 6) tier = "high";
        else if (score >= 6.5 && sample >= 5) tier = "moderate";
        else if (score >= 5 && sample >= 4) tier = "supporting";
        else tier = "low";
        /* A split within a hair of even is noise however good the rest of the
           score looks — a 5-5 record dressed as "moderate" is the exact kind of
           false confidence this panel is supposed to avoid. */
        if (!isNaN(wp) && Math.abs(wp - 0.5) < 0.06) tier = "low";
        return { score: score, tier: tier, sample: sample, wp: wp, dataMined: dataMined };
    }
    var TIER_RANK = { high: 0, moderate: 1, supporting: 2, low: 3 };
    function rankTrends(trends) {
        var enriched = trends.map(function (t) {
            var bucket = marketBucket(t);
            var side = sideText(t, bucket);
            var e = { t: t, bucket: bucket, rel: relevance(t, bucket), side: side };
            e.statement = trendStatement(t, bucket, side);
            return e;
        });
        /* The slate feed carries the same trend more than once when a game has
           both an ESPN and an Action Network row. Left alone that inflated the
           "N verified" count and filled every card's related list with copies of
           the card above it. Identical statement = same finding, keep one. */
        var seenStatement = {};
        enriched = enriched.filter(function (e) {
            var k = (e.statement || "").toLowerCase();
            if (!k || seenStatement[k]) return false;
            seenStatement[k] = true;
            return true;
        });
        var groups = {};
        enriched.forEach(function (e) {
            var key = (e.side.label || "").toLowerCase() + "|" + e.bucket;
            (groups[key] = groups[key] || []).push(e);
        });
        var reps = [];
        Object.keys(groups).forEach(function (k) {
            var arr = groups[k].sort(function (a, b) { return b.rel.score - a.rel.score; });
            var rep = arr[0];
            rep.related = arr.slice(1);
            reps.push(rep);
        });
        reps.sort(function (a, b) {
            var tr = TIER_RANK[a.rel.tier] - TIER_RANK[b.rel.tier];
            return tr !== 0 ? tr : b.rel.score - a.rel.score;
        });
        return reps;
    }
    var TIER_LABEL = { high: "High relevance", moderate: "Moderate", supporting: "Context", low: "Weak signal" };
    function trendCardHtml(e) {
        var t = e.t, rel = e.rel;
        var subject = e.side.type === "total"
            ? teamNick(t.team_abbr || t.team || "")
            : teamNick(e.side.label);
        var market = MARKET_LABEL[e.bucket] || e.bucket.replace(/_/g, " ");
        var stance = trendStance(rel, e.side);
        var pct = isNaN(rel.wp) ? "" : Math.round(rel.wp * 100) + "%";
        var range = compactRange(t.date_range);

        var related = "";
        if (e.related && e.related.length) {
            related = '<details class="hh-tc__rel"><summary>' + e.related.length + ' related trend' +
                (e.related.length > 1 ? "s" : "") + '</summary><ul>' +
                e.related.map(function (r) {
                    var rb = r.bucket || marketBucket(r.t);
                    return "<li>" + esc(r.statement || trendStatement(r.t, rb, r.side || sideText(r.t, rb))) + "</li>";
                }).join("") + '</ul></details>';
        }
        /* Situational scoring splits are context, not an edge, and say so once. */
        var mined = rel.dataMined
            ? '<p class="hh-tc__note">Situational scoring split, shown as context rather than an edge.</p>' : "";

        return '<article class="hh-tc tier-' + rel.tier + '">' +
            '<div class="hh-tc__rail">' +
                (pct ? '<span class="hh-tc__pct">' + pct + '</span>' : "") +
                (t.record ? '<span class="hh-tc__rec">' + esc(t.record) + '</span>' : "") +
            '</div>' +
            '<div class="hh-tc__body">' +
                '<div class="hh-tc__head">' +
                    '<span class="hh-tc__mkt">' + (subject ? esc(subject) + ' <i>·</i> ' : "") + esc(market) + '</span>' +
                    '<span class="hh-tc__tags">' +
                        (stance ? '<span class="hh-tc__stance ' + stance.cls + '">' + esc(stance.text) + '</span>' : "") +
                        '<span class="hh-tc__tier">' + esc(TIER_LABEL[rel.tier] || rel.tier) + '</span>' +
                    '</span>' +
                '</div>' +
                '<p class="hh-tc__claim">' + esc(e.statement || trendStatement(t, e.bucket, e.side)) + '</p>' +
                '<div class="hh-tc__meta">' +
                    (rel.sample ? '<span>' + rel.sample + ' game' + (rel.sample === 1 ? "" : "s") + '</span>' : "") +
                    (range ? '<span>' + esc(range) + '</span>' : "") +
                '</div>' +
                mined + related +
            '</div>' +
        '</article>';
    }

    /* ---------------- MARKETS ---------------- */
    function pickBook(game) { return (game.bookmakers && game.bookmakers[0]) || null; }
    function groupByKey(game, key) {
        return (game.market_groups || []).filter(function (g) { return (g.key || "") === key; })[0];
    }
    /** A board item is only renderable if the book actually priced it. Unpriced
        shells (odds:null) exist purely as manual-entry slots; rendering them
        would show an empty odds cell that reads as a real number of zero. */
    function priced(it) {
        return hasVal(it.odds) || (hasVal(it.odds_display) && String(it.odds_display).trim() !== "");
    }
    /** The board's selection_label usually already carries the number
        ("New York Mets +1.5", "Over 9.5"); appending line_display duplicates it. */
    function lineSuffix(it) {
        var line = String(it.line_display || (hasVal(it.line) ? it.line : "") || "");
        if (!line) return "";
        var label = String(it.selection_label || it.selection || "");
        var bare = line.replace(/^\+/, "");
        if (label.indexOf(line) >= 0 || (bare && label.indexOf(bare) >= 0)) return "";
        return ' <span class="hh-linenum">' + esc(line) + '</span>';
    }
    function itemRow(it) {
        return '<div class="hh-linerow"><span>' + esc(it.selection_label || it.selection || "") + lineSuffix(it) +
            '</span><span class="hh-odds">' + esc(it.odds_display || fmtOdds(it.odds)) + '</span></div>';
    }
    function card(title, items) {
        var live = (items || []).filter(priced);
        if (!live.length) return "";
        return '<div class="hh-linecard"><h4>' + esc(title) + '</h4>' + live.map(itemRow).join("") + '</div>';
    }
    function itemsOf(g) { return (g && g.items) || []; }
    function byMarketType(g, type) {
        return itemsOf(g).filter(function (it) { return (it.market_type || it.market_key) === type; });
    }
    /** Full game, First 5, and 1st inning are rendered as separate blocks and are
        never mixed: an F5 number is not a full-game number. */
    function marketsHtml(game) {
        var blocks = [];

        /* A group listed by the board but with nothing priced is disclosed, not
           silently dropped — "not priced" is a real and useful state. */
        function unpricedNote(label, g) {
            var items = itemsOf(g);
            return (items.length && !items.some(priced)) ? label : null;
        }
        var ttGroup = groupByKey(game, "team_totals");
        var fullCards = card("Moneyline", itemsOf(groupByKey(game, "full_game"))) +
                        card("Run Line", itemsOf(groupByKey(game, "spread"))) +
                        card("Total", itemsOf(groupByKey(game, "total"))) +
                        card("Team Totals", itemsOf(ttGroup));
        var fullUnpriced = [
            unpricedNote("Team Totals", ttGroup),
            unpricedNote("Moneyline", groupByKey(game, "full_game")),
            unpricedNote("Run Line", groupByKey(game, "spread")),
            unpricedNote("Total", groupByKey(game, "total"))
        ].filter(Boolean);
        if (fullCards || fullUnpriced.length) {
            blocks.push('<section class="hh-mkt hh-mkt--full"><h3 class="hh-mkt__title">Full Game</h3>' +
                '<p class="hh-mkt__note">Nine-inning markets. Settles on the final score.</p>' +
                (fullCards ? '<div class="hh-lines">' + fullCards + '</div>' : "") +
                (fullUnpriced.length ? '<p class="hh-mkt__unpriced">' + esc(fullUnpriced.join(", ")) +
                    (fullUnpriced.length > 1 ? " are" : " is") + ' listed for this game but not currently priced by the book.</p>' : "") +
                '</section>');
        }

        var f5 = groupByKey(game, "first_5");
        var f5Cards = card("F5 Moneyline", byMarketType(f5, "f5_h2h")) +
                      card("F5 Run Line", byMarketType(f5, "f5_spreads")) +
                      card("F5 Total", byMarketType(f5, "f5_totals"));
        if (!f5Cards && itemsOf(f5).length) f5Cards = card(f5.label || "First 5", itemsOf(f5));
        if (f5Cards) {
            blocks.push('<section class="hh-mkt hh-mkt--f5"><h3 class="hh-mkt__title">First 5 Innings</h3>' +
                '<p class="hh-mkt__note">Settles after 5 innings, starters only, no bullpen. Separate market from the full game above.</p>' +
                '<div class="hh-lines">' + f5Cards + '</div></section>');
        }

        var fi = groupByKey(game, "first_inning");
        var fiItems = itemsOf(fi);
        if (fiItems.length) {
            var labeled = fiItems.map(function (it) {
                var sel = String(it.selection || "").toLowerCase();
                var nick = sel === "under" ? "NRFI" : sel === "over" ? "YRFI" : "";
                var copy = Object.keys(it).reduce(function (o, k) { o[k] = it[k]; return o; }, {});
                if (nick) copy.selection_label = nick + " (" + (it.selection_label || it.selection) + ")";
                return copy;
            });
            blocks.push('<section class="hh-mkt hh-mkt--fi"><h3 class="hh-mkt__title">1st Inning · NRFI / YRFI</h3>' +
                '<p class="hh-mkt__note">Settles on the first inning only. NRFI = no run scored, YRFI = a run scores.</p>' +
                '<div class="hh-lines">' + card(fi.label || "1st Inning Total", labeled) + '</div></section>');
        }

        if (!blocks.length) {
            return unavailableHtml(game.lines_pending
                ? "Sportsbook lines for this game are not posted yet."
                : "No sportsbook lines are available for this game right now.");
        }
        var book = pickBook(game);
        var fresh = book && book.title
            ? '<p class="hh-src">Odds: ' + esc(book.title) + (book.last_update ? " · updated " + esc(String(book.last_update).replace("T", " ").slice(0, 16)) + " UTC" : "") + '</p>'
            : "";
        return blocks.join("") + fresh +
            notAvailableList([["opening_line", "line_movement", "steam_moves", "book_to_book_comparison"]]);
    }
    /* ---------------- COMMUNITY ---------------- */
    function consensusFor(game) {
        /* Match on the full nickname ("red sox" / "white sox"), not the bare
           last word — "sox" alone cross-matched Red Sox rows onto White Sox
           games (and vice versa), attaching another game's community picks. */
        var al = norm(teamNick(game.away_team)) || lastName(game.away_team);
        var hl = norm(teamNick(game.home_team)) || lastName(game.home_team);
        var rows = STATE.consensus.filter(function (r) {
            var lbl = norm(r.event_label || r.event || "");
            return lbl.indexOf(al) >= 0 && lbl.indexOf(hl) >= 0;
        });
        if (!rows.length) {
            return '<div class="hh-state hh-state--na"><strong>No community picks yet</strong>' +
                '<p>No public picks have been logged on this matchup in the last 3 days. Be the first to make a public pick.</p></div>';
        }
        var byLabel = {};
        rows.forEach(function (r) {
            var sel = norm(r.selection || "");
            var side = sel.indexOf(al) >= 0 ? "away" : (sel.indexOf(hl) >= 0 ? "home" : (/over/.test(sel) ? "over" : (/under/.test(sel) ? "under" : "other")));
            byLabel[side] = byLabel[side] || { picks: 0, cappers: 0, units: 0 };
            byLabel[side].picks += Number(r.pick_count) || 0;
            byLabel[side].cappers += Number(r.capper_count) || 0;
            byLabel[side].units += (Number(r.avg_units) || 0) * (Number(r.pick_count) || 0);
        });
        function bar(aKey, bKey, aName, bName) {
            var a = byLabel[aKey], b = byLabel[bKey];
            if (!a && !b) return "";
            var ap = a ? a.picks : 0, bp = b ? b.picks : 0, tot = ap + bp || 1;
            var apc = Math.round(ap / tot * 100), bpc = 100 - apc;
            return '<div class="hh-consbar"><div class="hh-consbar__head">' +
                '<span><b>' + esc(aName) + '</b> ' + ap + ' pick' + (ap === 1 ? "" : "s") + ' (' + apc + '%)</span>' +
                '<span>' + bp + ' pick' + (bp === 1 ? "" : "s") + ' (' + bpc + '%) <b>' + esc(bName) + '</b></span></div>' +
                '<div class="hh-consbar__track"><div class="hh-consbar__fill fill-a" style="width:' + apc + '%"></div><div class="hh-consbar__fill fill-b" style="width:' + bpc + '%"></div></div></div>';
        }
        var out = bar("away", "home", shortTeam(game.away_team), shortTeam(game.home_team));
        out += bar("over", "under", "Over", "Under");
        out += '<p class="hh-consnote">Public and external community picks (raw pick counts, last 3 days). Unit-weighted consensus and verified / profitable-handicapper filters are not built yet, so ten 1-unit picks and two 5-unit picks currently count the same way.</p>';
        return '<div class="hh-consensus">' + out + '</div>';
    }

    /* ---------------- tabs ---------------- */
    var TABS = [
        { id: "overview", label: "Overview" },
        { id: "pitchers", label: "Pitchers" },
        { id: "offense", label: "Offense" },
        { id: "bullpens", label: "Bullpens" },
        { id: "trends", label: "Trends" },
        { id: "markets", label: "Markets" },
        { id: "community", label: "Community" }
    ];
    function buildTabs(bodyEl, uid, actionsHtml) {
        var tabs = TABS.map(function (t, i) {
            return '<button type="button" role="tab" class="hh-tab" ' +
                'id="tab-' + uid + '-' + t.id + '" aria-controls="panel-' + uid + '-' + t.id + '" ' +
                'aria-selected="' + (i === 0 ? "true" : "false") + '" tabindex="' + (i === 0 ? "0" : "-1") + '" ' +
                'data-tab="' + t.id + '">' + esc(t.label) + '</button>';
        }).join("");
        var panels = TABS.map(function (t, i) {
            return '<div class="hh-panel" role="tabpanel" id="panel-' + uid + '-' + t.id + '" ' +
                'aria-labelledby="tab-' + uid + '-' + t.id + '" data-panel="' + t.id + '" tabindex="0"' +
                (i === 0 ? "" : " hidden") + '></div>';
        }).join("");
        bodyEl.innerHTML =
            '<div class="hh-tabsbar"><div class="hh-tabs" role="tablist" aria-label="Matchup research sections">' + tabs + '</div></div>' +
            '<div class="hh-panels">' + panels + '</div>' + (actionsHtml || "");

        var tabEls = Array.prototype.slice.call(bodyEl.querySelectorAll('[role="tab"]'));
        function select(id, focus) {
            tabEls.forEach(function (tb) {
                var on = tb.getAttribute("data-tab") === id;
                tb.setAttribute("aria-selected", on ? "true" : "false");
                tb.tabIndex = on ? 0 : -1;
                if (on && focus) tb.focus();
                var p = bodyEl.querySelector('[data-panel="' + tb.getAttribute("data-tab") + '"]');
                if (p) p.hidden = !on;
            });
        }
        tabEls.forEach(function (tb, i) {
            tb.addEventListener("click", function () { select(tb.getAttribute("data-tab")); });
            tb.addEventListener("keydown", function (ev) {
                var k = ev.key, next = null;
                if (k === "ArrowRight") next = tabEls[(i + 1) % tabEls.length];
                else if (k === "ArrowLeft") next = tabEls[(i - 1 + tabEls.length) % tabEls.length];
                else if (k === "Home") next = tabEls[0];
                else if (k === "End") next = tabEls[tabEls.length - 1];
                else return;
                ev.preventDefault();
                select(next.getAttribute("data-tab"), true);
            });
        });
        var map = {};
        TABS.forEach(function (t) { map[t.id] = bodyEl.querySelector('[data-panel="' + t.id + '"]'); });
        return map;
    }

    /* ---------------- render one game body (lazy) ---------------- */
    var UID = 0;
    function renderBody(game, bodyEl) {
        if (bodyEl.dataset.loaded === "1") return;
        bodyEl.dataset.loaded = "1";
        var uid = "g" + (++UID);

        var P = buildTabs(bodyEl, uid, "");

        /* Board-derived tabs render immediately — no network needed. */
        P.markets.innerHTML = marketsHtml(game);
        P.community.innerHTML = consensusFor(game);

        var API_TABS = ["overview", "pitchers", "offense", "bullpens", "trends"];
        function setLoading() {
            API_TABS.forEach(function (id) { P[id].innerHTML = loadingHtml(); });
        }
        /* The deep dive is async like the comparison card, and its card can be
           replaced underneath it by a date switch or a search. Painting a
           detached body is wasted work and, worse, setError would wire retry
           listeners onto nodes nobody can reach. Same guard the card queue
           uses: if this body has left the document, this response is stale. */
        function live() { return bodyEl.isConnected; }
        function setError(msg) {
            if (!live()) return;
            API_TABS.forEach(function (id) {
                P[id].innerHTML = errorHtml(msg);
                var btn = P[id].querySelector("[data-retry]");
                if (btn) btn.addEventListener("click", load);
            });
        }
        function paint(d) {
            if (!live()) return;
            P.overview.innerHTML = overviewHtml(d, game) + overviewTrendsHtml(d, game);
            var goTrends = P.overview.querySelector("[data-gototrends]");
            if (goTrends) goTrends.addEventListener("click", function () {
                var tab = bodyEl.querySelector("#tab-" + uid + "-trends");
                if (tab) { tab.click(); tab.scrollIntoView({ behavior: "smooth", block: "center" }); }
            });
            P.pitchers.innerHTML = pitchersHtml(d, game);
            P.offense.innerHTML = offenseHtml(d, game);
            P.bullpens.innerHTML = bullpensHtml(d, game);
            P.trends.innerHTML = trendsHtml(d, game, uid);
            wireTrendGames(P.trends, d.trends || []);
            var viewall = P.trends.querySelector("[data-viewall]");
            if (viewall) viewall.addEventListener("click", function () {
                var more = P.trends.querySelector("[data-more]");
                if (more) { more.hidden = false; viewall.remove(); }
            });
        }
        function load() {
            setLoading();
            getMatchup(game).then(paint).catch(function (e) {
                var msg = e && e.name === "AbortError"
                    ? "The research API timed out. It may be waking up from idle, retry in a moment."
                    : "The research API returned an error (" + esc(e && e.message ? e.message : "unknown") + ").";
                setError(msg);
            });
        }
        load();
    }

    /** Populates the always-visible comparison card once its matchup fetch
        resolves (or shows a loading/error state while it's in flight). */
    function paintTop(game, node, d) {
        var topEl = node.querySelector("[data-hhctop]");
        if (!topEl) return;
        topEl.innerHTML = hhcTopHtml(game, d, "top" + game.id);
        if (d && d.trends && d.trends.length) wireTrendGames(topEl, d.trends);
        /* The board feed carries no venue; the research API does. */
        var vEl = node.querySelector("[data-venue]");
        if (vEl && !vEl.textContent && d && d.overview && d.overview.venue) vEl.textContent = d.overview.venue;
    }

    /* ---------------- game card render ---------------- */
    function gameEl(game) {
        var node = tpl.content.firstElementChild.cloneNode(true);
        node.id = "game-" + game.id;
        var t = new Date(game.commence_time);
        var timeStr = isNaN(t) ? "" : t.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
        var awayNameEl = node.querySelector("[data-away-name]"), homeNameEl = node.querySelector("[data-home-name]");
        awayNameEl.textContent = game.away_team;
        awayNameEl.title = game.away_team;
        homeNameEl.textContent = game.home_team;
        homeNameEl.title = game.home_team;
        var al = node.querySelector("[data-away-logo]"), hl = node.querySelector("[data-home-logo]");
        var alogo = logoFor(game.away_team), hlogo = logoFor(game.home_team);
        if (alogo) { al.src = alogo; al.alt = game.away_team + " logo"; } else al.remove();
        if (hlogo) { hl.src = hlogo; hl.alt = game.home_team + " logo"; } else hl.remove();
        node.querySelector("[data-time]").textContent = timeStr;
        var venue = (game.venue || (game.simulation_inputs && game.simulation_inputs.venue) || "");
        node.querySelector("[data-venue]").textContent = venue;
        if (game.completed) node.classList.add("is-final");
        /* Already-fetched matchup data paints synchronously, so re-renders
           (date switch, search) never flash a loading skeleton over real data. */
        var cached = STATE.matchup[game.id];
        if (cached) paintTop(game, node, cached);
        else node.querySelector("[data-hhctop]").innerHTML = hhcTopHtml(game, null);

        var shareHref = location.pathname + "#game-" + encodeURIComponent(game.id);
        var share = node.querySelector("[data-share]");
        share.setAttribute("data-href", shareHref);
        share.addEventListener("click", function () {
            var url = location.origin + share.getAttribute("data-href");
            if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () {
                share.textContent = "Link Copied";
                setTimeout(function () { share.textContent = "Copy Matchup Link"; }, 1600);
            });
        });

        var toggle = node.querySelector("[data-toggle]");
        var body = node.querySelector("[data-body]");
        toggle.addEventListener("click", function () {
            var open = node.classList.toggle("is-open");
            toggle.setAttribute("aria-expanded", open ? "true" : "false");
            toggle.querySelector("[data-toggle-label]").textContent = open ? "Hide Full Analysis" : "View Full Analysis";
            body.hidden = !open;
            if (open) renderBody(game, body);
        });
        node._game = game;
        return node;
    }

    /* ---------------- boot ---------------- */
    function buildMatchupIndex(trends) {
        var idx = {};
        (trends || []).forEach(function (t) {
            var away = t.away_abbr || t.away || "";
            var home = t.home_abbr || t.home || "";
            if ((!away || !home) && t.matchup) {
                var p = String(t.matchup).split("@");
                if (p.length === 2) { away = p[0]; home = p[1]; }
            }
            var key = teamKey(away) + "@" + teamKey(home);
            (idx[key] = idx[key] || []).push(t);
        });
        return idx;
    }
    function matchupKeyForGame(g) { return teamKey(g.away_team) + "@" + teamKey(g.home_team); }

    /* ---------------- slate dates + rendering ---------------- */
    function slateLabel(iso) {
        var off = dayOffset(iso, todayET());
        if (off === 0) return "Today’s Slate";
        if (off === 1) return "Tomorrow’s Slate";
        if (off === -1) return "Yesterday’s Slate";
        return fmtSlateDate(iso);
    }
    function updateDatebar() {
        var iso = STATE.selDate;
        var idx = STATE.dates.indexOf(iso);
        var count = (STATE.gamesByDate[iso] || []).length;
        dateMain.textContent = slateLabel(iso);
        dateSub.textContent = (count ? count + " game" + (count === 1 ? "" : "s") : "No games") + " · " + fmtSlateDate(iso);
        prevBtn.disabled = idx <= 0;
        nextBtn.disabled = idx < 0 || idx >= STATE.dates.length - 1;
        var isToday = iso === todayET();
        todayBtn.disabled = isToday;
        if (isToday) todayBtn.setAttribute("aria-current", "date");
        else todayBtn.removeAttribute("aria-current");
        if (slateTitle) slateTitle.textContent = "MLB slate — " + fmtSlateDate(iso);
    }
    function selectDate(iso) {
        if (STATE.dates.indexOf(iso) < 0 || iso === STATE.selDate) return;
        STATE.selDate = iso;
        updateDatebar();
        renderSlate();
    }
    function emptyForDate(iso) {
        var off = dayOffset(iso, todayET());
        var when = off === 0 ? "today" : "on " + fmtSlateDate(iso);
        var nextIso = STATE.dates[STATE.dates.indexOf(iso) + 1];
        var jump = nextIso && (STATE.gamesByDate[nextIso] || []).length
            ? '<br><button type="button" class="hh-status__cta" data-gonext data-date="' + esc(nextIso) + '">View ' + esc(slateLabel(nextIso).toLowerCase()) + ' →</button>'
            : "";
        return "No MLB games are scheduled " + esc(when) + "." + jump;
    }

    function render(list, emptyHtml) {
        gamesEl.innerHTML = "";
        if (!list.length) {
            statusEl.style.display = "";
            statusEl.className = "hh-status is-empty";
            statusEl.innerHTML = emptyHtml || "No MLB games match right now.";
            var gn = statusEl.querySelector("[data-gonext]");
            if (gn) gn.addEventListener("click", function () { selectDate(gn.getAttribute("data-date")); });
            var cf = statusEl.querySelector("[data-clearfind]");
            if (cf) cf.addEventListener("click", function () { findEl.value = ""; renderSlate(); });
            return;
        }
        statusEl.style.display = "none";
        var nodes = list.map(function (g) {
            var node = gameEl(g);
            gamesEl.appendChild(node);
            return node;
        });
        /* Every card's comparison data starts loading immediately — the whole
           point of this layout is that no click is required to see it. Bounded
           concurrency keeps a full slate from firing every fetch at once, and
           cards already painted from cache skip the queue entirely. A node that
           left the DOM (date switch / new search) is never painted into. */
        var pending = nodes.filter(function (node) { return !STATE.matchup[node._game.id]; });
        function wireTopRetry(node, topEl) {
            var btn = topEl.querySelector("[data-retry]");
            if (!btn) return;
            btn.addEventListener("click", function () {
                topEl.innerHTML = hhcTopHtml(node._game, null);
                getMatchup(node._game)
                    .then(function (d) { if (node.isConnected) paintTop(node._game, node, d); })
                    .catch(function (e) {
                        if (!node.isConnected) return;
                        topEl.innerHTML = errorHtml(e && e.message ? e.message : "The research API did not respond.");
                        wireTopRetry(node, topEl);
                    });
            });
        }
        /* Switching date or typing in the find box calls render() again, which
           replaces every card. Painting was already safe — a detached node
           fails the isConnected check below — but the SUPERSEDED queue kept
           running, so a date switch on a 15-game slate still fired the rest of
           the old slate's matchup fetches (each a multi-provider fan-out on the
           backend) for cards nobody can see. STATE.renderSeq marks the current
           render; a queue whose seq is stale stops starting new work. Results
           already cached in STATE.matchup are kept — they are still valid for
           that game, whatever is on screen. */
        STATE.renderSeq++;
        var mySeq = STATE.renderSeq;
        runQueue(pending.map(function (node) {
            return function () {
                if (mySeq !== STATE.renderSeq) return Promise.resolve();
                return getMatchup(node._game)
                    .then(function (d) { if (node.isConnected) paintTop(node._game, node, d); })
                    .catch(function (e) {
                        if (!node.isConnected) return;
                        var topEl = node.querySelector("[data-hhctop]");
                        if (topEl) {
                            topEl.innerHTML = errorHtml(e && e.message ? e.message : "The research API did not respond.");
                            wireTopRetry(node, topEl);
                        }
                    });
            };
        }), 4);
        if (location.hash.indexOf("#game-") === 0) {
            var target = document.getElementById(location.hash.slice(1));
            if (target) {
                target.querySelector("[data-toggle]").click();
                setTimeout(function () { target.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
            }
        }
    }

    function renderSlate() {
        var games = STATE.gamesByDate[STATE.selDate] || [];
        var q = norm(findEl ? findEl.value : "");
        if (!q) { render(games, emptyForDate(STATE.selDate)); return; }
        var hits = games.filter(function (g) { return norm(g.away_team + " " + g.home_team).indexOf(q) >= 0; });
        render(hits, hits.length ? null :
            'No matchup on this slate matches “' + esc(findEl.value) + '”.' +
            '<br><button type="button" class="hh-status__cta" data-clearfind>Clear search</button>');
    }

    function boot() {
        /* Retry can be clicked while an earlier boot is still in flight. Both
           resolve, and without this the OLDER board response lands last and
           overwrites STATE.games / gamesByDate / trendsByMatchup / consensus
           with staler data, then re-renders from it. Stamp each attempt and let
           only the newest one commit. */
        var myBoot = ++STATE.bootSeq;
        function bootStale() { return myBoot !== STATE.bootSeq; }
        statusEl.style.display = "";
        statusEl.className = "hh-status hh-status--sr";
        statusEl.textContent = "Loading today’s MLB slate";
        /* The board is required — its failure is a real error state with a
           retry, never a fake "no games" empty state. Trends and consensus
           stay fail-soft: they enrich cards but don't block the slate. */
        getJSON(API + "/games/board/baseball_mlb?limit=80").then(function (board) {
            return Promise.all([
                board,
                getJSON(API + "/trendspotter/verified?sport=MLB").catch(function () { return { trends: [] }; }),
                getJSON(API + "/external-picks/consensus?days=3").catch(function () { return { groups: [] }; })
            ]);
        }).then(function (res) {
            if (bootStale()) return;
            var board = res[0] || {}, tr = res[1] || {}, cons = res[2] || {};
            var games = (board.games || []).slice().sort(function (a, b) { return new Date(a.commence_time) - new Date(b.commence_time); });
            STATE.gamesByDate = {};
            games.forEach(function (g) {
                g.matchupKey = matchupKeyForGame(g);
                g.slateDate = slateDateET(g.commence_time);
                (STATE.gamesByDate[g.slateDate] = STATE.gamesByDate[g.slateDate] || []).push(g);
            });
            STATE.games = games;
            var today = todayET();
            var dates = Object.keys(STATE.gamesByDate);
            if (dates.indexOf(today) < 0) dates.push(today);
            dates.sort();
            STATE.dates = dates;
            STATE.trendsByMatchup = buildMatchupIndex(tr.trends || []);
            /* The consensus endpoint returns {window_days, groups}. The old code read
               `.consensus || .rows`, which are keys it has never returned — community
               consensus was dead on every matchup. */
            STATE.consensus = cons.groups || [];
            /* Land on today's slate. A deep link to a game on another date
               switches to that date so the link actually resolves. */
            STATE.selDate = today;
            if (location.hash.indexOf("#game-") === 0) {
                var gid = decodeURIComponent(location.hash.slice(6));
                var target = games.filter(function (x) { return String(x.id) === gid; })[0];
                if (target && target.slateDate !== STATE.selDate) STATE.selDate = target.slateDate;
            }
            updateDatebar();
            renderSlate();
        }).catch(function () {
            if (bootStale()) return;
            gamesEl.innerHTML = "";
            dateSub.textContent = "—";
            statusEl.style.display = "";
            statusEl.className = "hh-status is-empty";
            statusEl.innerHTML = "Could not load the MLB slate. The scores API may be waking from idle." +
                '<br><button type="button" class="hh-status__cta" data-reboot>Retry</button>';
            var rb = statusEl.querySelector("[data-reboot]");
            if (rb) rb.addEventListener("click", boot);
        });
    }

    if (findEl) findEl.addEventListener("input", function () { clearTimeout(findEl._t); findEl._t = setTimeout(renderSlate, 180); });
    function stepDate(d) {
        var n = STATE.dates[STATE.dates.indexOf(STATE.selDate) + d];
        if (n) selectDate(n);
    }
    if (prevBtn) prevBtn.addEventListener("click", function () { stepDate(-1); });
    if (nextBtn) nextBtn.addEventListener("click", function () { stepDate(1); });
    if (todayBtn) todayBtn.addEventListener("click", function () { selectDate(todayET()); });
    boot();
})();
