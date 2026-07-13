/* TrustMyRecord — MLB Handicapping Hub (sport sub-hub).
   Client-rendered against existing production APIs:
     GET /games/board/baseball_mlb          -> games + submittable market items
     GET /trendspotter/verified?sport=MLB   -> verified/generated MLB trends
     GET /mlb-simulator/projection/:gameId  -> probable pitchers + team stats (lazy)
     GET /external-picks/consensus?days=3   -> public community consensus
   Trend relevance ranking + de-duplication run here for now; Phase 2 moves the
   ranking into a backend trendRelevanceService and adds verified-user consensus,
   ESPN records/injuries, and prerendered dedicated matchup pages. */
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
    function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim(); }
    function lastName(s) { var p = norm(s).split(" "); return p[p.length - 1] || ""; }
    function logoFor(name) {
        var a = MLB_ABBR[norm(name)];
        return a ? ("https://a.espncdn.com/i/teamlogos/mlb/500/" + a + ".png") : "";
    }
    function fmtOdds(o) { if (o === null || o === undefined || o === "") return ""; var n = Number(o); if (isNaN(n)) return String(o); return n > 0 ? "+" + n : String(n); }
    function esc(s) { return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
    function el(html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }

    var statusEl = document.getElementById("hh-status");
    var gamesEl = document.getElementById("hh-games");
    var tpl = document.getElementById("hh-game-tpl");
    var findEl = document.getElementById("hh-find");
    var dateSub = document.getElementById("hh-dateSub");

    var STATE = { games: [], trendsByMatchup: {}, consensus: [] };

    function getJSON(url) {
        return fetch(url, { headers: { "Accept": "application/json" } })
            .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(r.status)); });
    }

    /* ---------------- trend ranking + dedup ---------------- */
    function marketBucket(t) {
        var m = String(t.market || t.bet_type || "").toUpperCase();
        if (m.indexOf("TEAM_TOTAL") >= 0 || m.indexOf("TEAM TOTAL") >= 0) return "TEAM_TOTAL";
        if (m.indexOf("TOTAL") >= 0) return "TOTAL";
        if (m.indexOf("SPREAD") >= 0 || m.indexOf("RUN") >= 0) return "SPREAD";
        return "MONEYLINE";
    }
    function sideText(t, bucket) {
        if (bucket === "TOTAL" || bucket === "TEAM_TOTAL") {
            var rec = String(t.record || "");
            // generated totals encode the chosen side in the claim
            var over = /over/i.test(t.claim || "") && !/under/i.test((t.claim || "").split(/over/i)[0] || "");
            return { label: over ? "Over" : (/under/i.test(t.claim || "") ? "Under" : "Total"), type: "total" };
        }
        return { label: t.team_abbr || t.team || "", type: "side" };
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
        // recency: date_range like "YYYY-MM-DD to YYYY-MM-DD"
        var dr = String(t.date_range || "");
        var m = dr.match(/(\d{4}-\d{2}-\d{2})\s*$/);
        if (m) {
            var days = (Date.now() - Date.parse(m[1])) / 86400000;
            if (days <= 14) score += 1; else if (days <= 30) score += 0.4; else if (days > 90) score -= 1;
        }
        // data-mined over/under side-selection: informative, not predictive -> demote
        var dataMined = (bucket === "TOTAL" || bucket === "TEAM_TOTAL") &&
            (String(t.kind || t.trend_type || "").toUpperCase().indexOf("SCORING") >= 0 || bucket === "TEAM_TOTAL");
        var tier;
        if (dataMined) tier = sample >= 6 ? "supporting" : "low";
        else if (score >= 8 && sample >= 6) tier = "high";
        else if (score >= 6.5 && sample >= 5) tier = "moderate";
        else if (score >= 5 && sample >= 4) tier = "supporting";
        else tier = "low";
        return { score: score, tier: tier, sample: sample, wp: wp, dataMined: dataMined };
    }
    var TIER_RANK = { high: 0, moderate: 1, supporting: 2, low: 3 };

    function rankTrends(trends) {
        var enriched = trends.map(function (t) {
            var bucket = marketBucket(t);
            var rel = relevance(t, bucket);
            return { t: t, bucket: bucket, rel: rel, side: sideText(t, bucket) };
        });
        // dedup: group by team/side + market bucket; keep strongest, fold rest into related
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

    function trendCardHtml(e) {
        var t = e.t, rel = e.rel;
        var relClass = "rel-" + rel.tier;
        var relLabel = { high: "High Relevance", moderate: "Moderate", supporting: "Supporting", low: "Low Sample" }[rel.tier];
        var sideLabel = e.side.type === "total"
            ? ("Supports " + esc(e.side.label))
            : ("Supports " + esc(e.side.label) + " " + esc(e.bucket === "MONEYLINE" ? "ML" : e.bucket === "SPREAD" ? "run line" : ""));
        var pct = isNaN(rel.wp) ? "" : Math.round(rel.wp * 100) + "%";
        var why = (t.applies_because && t.applies_because.length) ? t.applies_because[0] : "";
        var related = "";
        if (e.related && e.related.length) {
            related = '<details class="hh-trend__related"><summary>' + e.related.length + ' related trend' + (e.related.length > 1 ? "s" : "") + '</summary><ul>' +
                e.related.map(function (r) { return "<li>" + esc(r.t.claim || "") + " (" + esc(r.t.record || "") + ")</li>"; }).join("") + "</ul></details>";
        }
        var mined = rel.dataMined ? '<p class="hh-trend__why">Situational scoring split, shown as context rather than a predictive edge.</p>' : "";
        return '<div class="hh-trend">' +
            '<div class="hh-trend__top"><span class="hh-trend__side">' + sideLabel + '</span><span class="hh-trend__rel ' + relClass + '">' + relLabel + '</span></div>' +
            '<p class="hh-trend__claim">' + esc(t.claim || "") + '</p>' +
            '<div class="hh-trend__stats">' +
                (t.record ? '<span>Record <b>' + esc(t.record) + '</b></span>' : "") +
                (pct ? '<span>Hit <b>' + pct + '</b></span>' : "") +
                (rel.sample ? '<span>Sample <b>' + rel.sample + '</b></span>' : "") +
                (t.date_range ? '<span>Range <b>' + esc(t.date_range) + '</b></span>' : "") +
                '<span>Market <b>' + esc(e.bucket.replace("_", " ")) + '</b></span>' +
            '</div>' +
            (why ? '<p class="hh-trend__why">' + esc(why) + '</p>' : "") +
            mined + related +
            '</div>';
    }

    /* ---------------- betting lines ---------------- */
    function pickBook(game) { return (game.bookmakers && game.bookmakers[0]) || null; }
    function groupByKey(game, key) {
        return (game.market_groups || []).filter(function (g) { return (g.key || "") === key; })[0];
    }
    function linesHtml(game) {
        function itemsRows(g) {
            return (g.items || []).slice(0, 4).map(function (it) {
                var label = esc(it.selection_label || it.selection || "");
                var line = it.line_display || (it.line !== null && it.line !== undefined ? it.line : "");
                return '<div class="hh-linerow"><span>' + label + (line !== "" ? ' <span style="color:var(--hh-muted)">' + esc(line) + '</span>' : "") + '</span><span class="hh-odds">' + esc(it.odds_display || fmtOdds(it.odds)) + '</span></div>';
            }).join("");
        }
        function block(title, g) {
            if (!g || !(g.items || []).length) return "";
            var body = itemsRows(g);
            return body ? '<div class="hh-linecard"><h4>' + esc(title) + '</h4>' + body + '</div>' : "";
        }
        var html = block("Moneyline", groupByKey(game, "full_game")) +
                   block("Run Line", groupByKey(game, "spread")) +
                   block("Total", groupByKey(game, "total")) +
                   block("Team Totals", groupByKey(game, "team_totals"));
        if (!html) return '<p class="hh-empty">' + (game.lines_pending ? "Lines for this game are not posted yet." : "No sportsbook lines available for this game right now.") + '</p>';
        var book = pickBook(game);
        var fresh = book && book.title ? '<p class="hh-linefresh">Source: ' + esc(book.title) + (book.last_update ? " · updated " + esc(String(book.last_update).replace("T", " ").slice(0, 16)) + " UTC" : "") + '</p>' : "";
        return '<div class="hh-lines">' + html + '</div>' + fresh;
    }
    function quickLinesHtml(game) {
        var chips = [];
        var ml = groupByKey(game, "full_game");
        if (ml && ml.items) {
            ml.items.slice(0, 2).forEach(function (it) {
                chips.push('<span class="hh-chip">' + esc((it.selection_label || it.selection || "").replace(/ ML$/i, "").split(" ").slice(-1)[0]) + ' <b>' + esc(it.odds_display || fmtOdds(it.odds)) + '</b></span>');
            });
        }
        var tot = groupByKey(game, "total");
        if (tot && tot.items && tot.items[0]) {
            chips.push('<span class="hh-chip">O/U <b>' + esc((tot.items[0].line_display || tot.items[0].line || "").toString().replace(/^\+/, "")) + '</b></span>');
        }
        if (!chips.length) chips.push('<span class="hh-chip" style="color:var(--hh-muted)">' + (game.lines_pending ? "Lines pending" : "No line") + '</span>');
        return chips.join("");
    }

    /* ---------------- probable pitchers + team comparison ----------------
       Read from the board game object. The dedicated stats/projection endpoint
       (probable pitchers, runs/game, bullpen ERA, venue, weather, splits) is
       Phase 2 backend work; until it ships we surface whatever the board carries
       and show an honest empty state otherwise — never placeholder numbers. */
    function projectionHtml(game) {
        var inp = game.simulation_inputs || game.inputs || {};
        function side(which) {
            return game[which + "_team_stats"] || inp[which] || game[which] || {};
        }
        var away = side("away"), home = side("home");
        function pit(s, whichName) {
            var pp = game.probable_pitchers || game.probables || {};
            var byside = pp[whichName] || {};
            var p = s.probable_pitcher || s.starting_pitcher || s.pitcher || byside || {};
            return { name: p.name || byside.name || s.probable_pitcher_name || game[whichName + "_probable_pitcher"] || "", era: (p.era !== undefined ? p.era : (byside.era !== undefined ? byside.era : s.starter_era)) };
        }
        var ap = pit(away, "away"), hp = pit(home, "home");
        var rows = [];
        function row(label, a, h, betterHigh) {
            if ((a === undefined || a === null || a === "") && (h === undefined || h === null || h === "")) return;
            var an = Number(a), hn = Number(h);
            var aBetter = !isNaN(an) && !isNaN(hn) && (betterHigh ? an > hn : an < hn);
            var hBetter = !isNaN(an) && !isNaN(hn) && (betterHigh ? hn > an : hn < an);
            rows.push('<tr><td class="hh-val' + (aBetter ? " is-better" : "") + '">' + esc(a === undefined || a === null ? "—" : a) + '</td><td class="hh-stat">' + esc(label) + '</td><td class="hh-val' + (hBetter ? " is-better" : "") + '">' + esc(h === undefined || h === null ? "—" : h) + '</td></tr>');
        }
        var starters = "";
        if (ap.name || hp.name) {
            starters = '<div class="hh-linecard" style="margin-bottom:12px"><h4>Probable Starters</h4>' +
                '<div class="hh-linerow"><span>' + esc(ap.name || "TBD") + (ap.era !== undefined && ap.era !== null ? ' <span style="color:var(--hh-muted)">' + esc(ap.era) + ' ERA</span>' : "") + '</span><span style="color:var(--hh-muted)">Away</span></div>' +
                '<div class="hh-linerow"><span>' + esc(hp.name || "TBD") + (hp.era !== undefined && hp.era !== null ? ' <span style="color:var(--hh-muted)">' + esc(hp.era) + ' ERA</span>' : "") + '</span><span style="color:var(--hh-muted)">Home</span></div></div>';
        }
        row("Starter ERA", ap.era, hp.era, false);
        row("Runs / game", away.runs_per_game || away.rpg, home.runs_per_game || home.rpg, true);
        row("Bullpen ERA", away.bullpen_era, home.bullpen_era, false);
        var table = rows.length
            ? '<table class="hh-compare"><thead><tr><th>' + esc((game.away_team || "").split(" ").slice(-1)[0]) + '</th><th>Stat</th><th>' + esc((game.home_team || "").split(" ").slice(-1)[0]) + '</th></tr></thead><tbody>' + rows.join("") + '</tbody></table>'
            : "";
        var ctx = [];
        var venue = game.venue || inp.venue;
        if (venue) ctx.push("Venue: " + venue);
        var weather = game.weather || inp.weather;
        if (weather && (weather.summary || weather.temp || typeof weather === "string")) ctx.push("Weather: " + (weather.summary || (weather.temp ? weather.temp + "°" : weather)));
        var ctxHtml = ctx.length ? '<p class="hh-trend__why">' + esc(ctx.join(" · ")) + '</p>' : "";
        if (!starters && !table) return '<p class="hh-empty">Advanced team stats are not available for this game yet.</p>';
        return starters + table + ctxHtml;
    }

    /* ---------------- community consensus ---------------- */
    function consensusFor(game) {
        var al = lastName(game.away_team), hl = lastName(game.home_team);
        var rows = STATE.consensus.filter(function (r) {
            var lbl = norm(r.event_label || r.event || "");
            return lbl.indexOf(al) >= 0 && lbl.indexOf(hl) >= 0;
        });
        if (!rows.length) return '<p class="hh-empty">No community picks logged on this matchup yet. Be the first to make a public pick.</p>';
        // moneyline sides
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
            return '<div class="hh-consbar"><div class="hh-consbar__head"><span><b>' + esc(aName) + '</b> ' + ap + ' pick' + (ap === 1 ? "" : "s") + ' (' + apc + '%)</span><span>' + bp + ' pick' + (bp === 1 ? "" : "s") + ' (' + bpc + '%) <b>' + esc(bName) + '</b></span></div>' +
                '<div class="hh-consbar__track"><div class="hh-consbar__fill fill-a" style="width:' + apc + '%"></div><div class="hh-consbar__fill fill-b" style="width:' + bpc + '%"></div></div></div>';
        }
        var out = bar("away", "home", game.away_team.split(" ").slice(-1)[0], game.home_team.split(" ").slice(-1)[0]);
        out += bar("over", "under", "Over", "Under");
        out += '<p class="hh-consnote">Public and external community picks (raw pick counts). Unit-weighted consensus and verified / profitable-handicapper filters arrive with the full matchup engine, and will separate ten 1-unit picks from two 5-unit picks.</p>';
        return '<div class="hh-consensus">' + out + '</div>';
    }

    /* ---------------- key factors ---------------- */
    function keyFactorsHtml(game, reps) {
        var f = [];
        var pp = game.probable_pitchers || game.probables || {};
        var ap = (pp.away && pp.away.name) || game.away_probable_pitcher;
        var hp = (pp.home && pp.home.name) || game.home_probable_pitcher;
        if (ap || hp) f.push("Probable pitching matchup: " + (ap || "TBD") + " vs " + (hp || "TBD") + ".");
        var top = reps && reps[0];
        if (top && (top.rel.tier === "high" || top.rel.tier === "moderate")) {
            f.push("Strongest trend: " + (top.t.claim || "") + " (" + (top.t.record || "") + ").");
        }
        if (game.lines_pending) f.push("Sportsbook lines are still pending for this game.");
        var venue = game.venue || (game.simulation_inputs && game.simulation_inputs.venue);
        if (venue) f.push("Ballpark: " + venue + ".");
        if (!f.length) return '<p class="hh-empty">Key factors populate as pitching, lines, and trend data confirm for this game.</p>';
        return '<ul class="hh-factors">' + f.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    }

    /* ---------------- render one game body (lazy) ---------------- */
    function renderBody(game, bodyEl) {
        if (bodyEl.dataset.loaded === "1") return;
        bodyEl.dataset.loaded = "1";
        var mk = game.matchupKey;
        var trends = STATE.trendsByMatchup[mk] || [];
        var reps = rankTrends(trends);
        var TOP = 6;
        var topReps = reps.slice(0, TOP), rest = reps.slice(TOP);

        var sportsbookHref = "/sportsbook/?sport=baseball_mlb#picks";
        var shareHref = location.pathname + "#game-" + encodeURIComponent(game.id);

        var trendsBody = reps.length
            ? topReps.map(trendCardHtml).join("") +
              (rest.length ? '<button type="button" class="hh-viewall" data-viewall>View all ' + reps.length + ' trends (' + rest.length + ' more)</button><div data-more hidden>' + rest.map(trendCardHtml).join("") + "</div>" : "")
            : '<p class="hh-empty">No verified trends met the relevance threshold for this matchup. We only show trends backed by real completed games, not filler.</p>';

        bodyEl.innerHTML =
            '<div class="hh-sec"><h3 class="hh-sec__title">Betting Lines</h3><div data-lines></div></div>' +
            '<div class="hh-sec"><h3 class="hh-sec__title">Team &amp; Starter Comparison</h3><div data-proj></div></div>' +
            '<div class="hh-sec"><h3 class="hh-sec__title">Injuries &amp; Availability</h3><p class="hh-empty">No MLB injury report is wired into this feed yet. Confirmed lineups and injuries arrive with the full matchup engine.</p></div>' +
            '<div class="hh-sec"><h3 class="hh-sec__title">Key Handicapping Factors</h3><div data-factors></div></div>' +
            '<div class="hh-sec"><h3 class="hh-sec__title">Relevant Trends <span class="hh-count">' + (reps.length ? "top " + Math.min(TOP, reps.length) + " of " + reps.length : "") + '</span></h3>' + trendsBody + '</div>' +
            '<div class="hh-sec"><h3 class="hh-sec__title">Community Consensus</h3>' + consensusFor(game) + '</div>' +
            '<div class="hh-actions">' +
                '<a class="hh-btn hh-btn--primary" href="' + sportsbookHref + '">Make Pick</a>' +
                '<button type="button" class="hh-btn hh-btn--ghost" data-share data-href="' + esc(shareHref) + '">Copy Matchup Link</button>' +
            '</div>';

        bodyEl.querySelector("[data-lines]").innerHTML = linesHtml(game);
        bodyEl.querySelector("[data-proj]").innerHTML = projectionHtml(game);
        bodyEl.querySelector("[data-factors]").innerHTML = keyFactorsHtml(game, reps);

        var viewall = bodyEl.querySelector("[data-viewall]");
        if (viewall) viewall.addEventListener("click", function () {
            var more = bodyEl.querySelector("[data-more]");
            if (more) { more.hidden = false; viewall.remove(); }
        });
        var share = bodyEl.querySelector("[data-share]");
        if (share) share.addEventListener("click", function () {
            var url = location.origin + share.getAttribute("data-href");
            if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { share.textContent = "Link Copied"; setTimeout(function () { share.textContent = "Copy Matchup Link"; }, 1600); });
        });
    }

    /* ---------------- game header render ---------------- */
    function gameEl(game) {
        var node = tpl.content.firstElementChild.cloneNode(true);
        node.id = "game-" + game.id;
        var t = new Date(game.commence_time);
        var timeStr = isNaN(t) ? "" : t.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
        node.querySelector("[data-away-name]").textContent = game.away_team;
        node.querySelector("[data-home-name]").textContent = game.home_team;
        var al = node.querySelector("[data-away-logo]"), hl = node.querySelector("[data-home-logo]");
        var alogo = logoFor(game.away_team), hlogo = logoFor(game.home_team);
        if (alogo) { al.src = alogo; al.alt = game.away_team + " logo"; } else al.remove();
        if (hlogo) { hl.src = hlogo; hl.alt = game.home_team + " logo"; } else hl.remove();
        node.querySelector("[data-time]").textContent = timeStr;
        var venue = (game.venue || (game.simulation_inputs && game.simulation_inputs.venue) || "");
        node.querySelector("[data-venue]").textContent = venue;
        if (game.completed) node.classList.add("is-final");
        node.querySelector("[data-quicklines]").innerHTML = quickLinesHtml(game);

        var header = node.querySelector("[data-toggle]");
        var body = node.querySelector("[data-body]");
        header.addEventListener("click", function () {
            var open = node.classList.toggle("is-open");
            header.setAttribute("aria-expanded", open ? "true" : "false");
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
            var key = norm(t.away_abbr || t.away || "") + "@" + norm(t.home_abbr || t.home || "");
            // fall back to matchup string "Away @ Home"
            if (!t.away_abbr && t.matchup) {
                var p = String(t.matchup).split("@");
                if (p.length === 2) key = norm(p[0]) + "@" + norm(p[1]);
            }
            (idx[key] = idx[key] || []).push(t);
        });
        return idx;
    }
    function matchupKeyForGame(g) { return norm(g.away_team) + "@" + norm(g.home_team); }

    function render(list) {
        gamesEl.innerHTML = "";
        if (!list.length) {
            statusEl.className = "hh-status is-empty";
            statusEl.innerHTML = "No MLB games match right now.";
            return;
        }
        statusEl.style.display = "none";
        list.forEach(function (g) { gamesEl.appendChild(gameEl(g)); });
        // hash deep-link auto-expand
        if (location.hash.indexOf("#game-") === 0) {
            var target = document.getElementById(location.hash.slice(1));
            if (target) { target.querySelector("[data-toggle]").click(); setTimeout(function () { target.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60); }
        }
    }

    function applyFilter() {
        var q = norm(findEl.value);
        if (!q) return render(STATE.games);
        render(STATE.games.filter(function (g) { return norm(g.away_team + " " + g.home_team).indexOf(q) >= 0; }));
    }

    function boot() {
        Promise.all([
            getJSON(API + "/games/board/baseball_mlb?limit=80").catch(function () { return { games: [] }; }),
            getJSON(API + "/trendspotter/verified?sport=MLB").catch(function () { return { trends: [] }; }),
            getJSON(API + "/external-picks/consensus?days=3").catch(function () { return { consensus: [] }; })
        ]).then(function (res) {
            var board = res[0] || {}, tr = res[1] || {}, cons = res[2] || {};
            var games = (board.games || []).slice().sort(function (a, b) { return new Date(a.commence_time) - new Date(b.commence_time); });
            games.forEach(function (g) { g.matchupKey = matchupKeyForGame(g); });
            STATE.games = games;
            STATE.trendsByMatchup = buildMatchupIndex(tr.trends || []);
            STATE.consensus = cons.consensus || cons.rows || [];
            dateSub.textContent = games.length ? (games.length + " game" + (games.length === 1 ? "" : "s") + " on the board") : "No games posted";
            if (!games.length) {
                statusEl.className = "hh-status is-empty";
                statusEl.innerHTML = "No MLB games are posted on the board right now.<br><a class=\"hh-status__cta\" href=\"/handicapping/\">Back to the Handicapping Hub →</a>";
                return;
            }
            render(games);
        }).catch(function (e) {
            statusEl.className = "hh-status is-empty";
            statusEl.textContent = "Could not load the MLB slate. Please refresh in a moment.";
        });
    }

    if (findEl) findEl.addEventListener("input", function () { clearTimeout(findEl._t); findEl._t = setTimeout(applyFilter, 180); });
    document.getElementById("hh-today").addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
    boot();
})();
