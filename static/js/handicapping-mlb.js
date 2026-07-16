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

    var STATE = { games: [], trendsByMatchup: {}, consensus: [], matchup: {} };

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
        var out = order.map(function (k) { return byKey[k]; });
        if (!out.length) return "";
        var prose = out.some(function (m) { return m.length > 40; });
        var body = prose
            ? '<ul class="hh-nm__list">' + out.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("") + '</ul>'
            : out.map(function (m) { return '<span class="hh-nm__chip">' + esc(m) + '</span>'; }).join("");
        return '<div class="hh-nm">' +
            '<span class="hh-nm__label">Not available from current providers:</span>' +
            (prose ? "" : " ") + body +
            '</div>';
    }
    function sourceLine(d, keys) {
        var srcs = [];
        (keys || []).forEach(function (k) {
            var v = d && d.data_sources && d.data_sources[k];
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
            }).join("") + '</dl>' : "") +
            notAvailableList([ov.unavailable_metrics]) +
            sourceLine(d, ["pitchers", "handedness"]);
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
                '<summary>Inspect all ' + t.games.length + ' sample game' + (t.games.length === 1 ? "" : "s") + '</summary>' +
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
            (t.data_source ? '<p class="hh-src">Source: ' + esc(t.data_source) + '</p>' : "") +
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

    function trendsHtml(d, game, uid) {
        var out = "";
        var trends = d.trends || [];
        var meta = d.trend_meta || {};
        if (trends.length) {
            out += '<div class="hh-sub"><h4 class="hh-sub__title">Verified trends <span class="hh-count">' + trends.length + ' cleared the engine</span></h4>' +
                trends.map(function (t, i) { return apiTrendHtml(t, i, uid); }).join("") + '</div>';
        } else {
            /* No invented filler. State the engine's real reason + real thresholds. */
            var note = meta.note ||
                ("No trend cleared the engine's thresholds for this matchup" +
                 (hasVal(meta.min_sample) ? " (minimum sample " + meta.min_sample + " games)" : "") + ".");
            out += '<div class="hh-state hh-state--na"><strong>No verified trends</strong><p>' + esc(note) + '</p>' +
                (meta.baseline ? '<p class="hh-state__detail">' + esc(meta.baseline) + '</p>' : "") + '</div>';
        }
        if (meta.baseline && trends.length) {
            out += '<p class="hh-src">Baseline: ' + esc(meta.baseline) + '</p>';
        }

        /* Legacy TrendSpotter slate feed, kept alive alongside the verified engine. */
        var legacy = STATE.trendsByMatchup[game.matchupKey] || [];
        if (legacy.length) {
            var reps = rankTrends(legacy);
            var TOP = 6;
            out += '<div class="hh-sub"><h4 class="hh-sub__title">Slate trends <span class="hh-count">TrendSpotter feed · ' + reps.length + '</span></h4>' +
                reps.slice(0, TOP).map(trendCardHtml).join("") +
                (reps.length > TOP ? '<button type="button" class="hh-viewall" data-viewall>View all ' + reps.length + ' slate trends</button><div data-more hidden>' + reps.slice(TOP).map(trendCardHtml).join("") + '</div>' : "") +
                '</div>';
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
        return { score: score, tier: tier, sample: sample, wp: wp, dataMined: dataMined };
    }
    var TIER_RANK = { high: 0, moderate: 1, supporting: 2, low: 3 };
    function rankTrends(trends) {
        var enriched = trends.map(function (t) {
            var bucket = marketBucket(t);
            return { t: t, bucket: bucket, rel: relevance(t, bucket), side: sideText(t, bucket) };
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
    function trendCardHtml(e) {
        var t = e.t, rel = e.rel;
        var relLabel = { high: "High Relevance", moderate: "Moderate", supporting: "Supporting", low: "Low Sample" }[rel.tier];
        var sideLabel = e.side.type === "total"
            ? ("Supports " + esc(e.side.label))
            : ("Supports " + esc(e.side.label) + " " + esc(e.bucket === "MONEYLINE" ? "ML" : e.bucket === "SPREAD" ? "run line" : ""));
        var pct = isNaN(rel.wp) ? "" : Math.round(rel.wp * 100) + "%";
        var why = (t.applies_because && t.applies_because.length) ? t.applies_because[0] : "";
        var related = "";
        if (e.related && e.related.length) {
            related = '<details class="hh-trend__related"><summary>' + e.related.length + ' related trend' + (e.related.length > 1 ? "s" : "") + '</summary><ul>' +
                e.related.map(function (r) { return "<li>" + esc(r.t.claim || "") + " (" + esc(r.t.record || "") + ")</li>"; }).join("") + '</ul></details>';
        }
        var mined = rel.dataMined ? '<p class="hh-trend__why">Situational scoring split, shown as context rather than a predictive edge.</p>' : "";
        return '<div class="hh-trend">' +
            '<div class="hh-trend__top"><span class="hh-trend__side">' + sideLabel + '</span><span class="hh-trend__rel rel-' + rel.tier + '">' + relLabel + '</span></div>' +
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
    function quickLinesHtml(game) {
        var chips = [];
        var ml = groupByKey(game, "full_game");
        if (ml && ml.items) {
            ml.items.slice(0, 2).forEach(function (it) {
                chips.push('<span class="hh-chip">' + esc(shortTeam((it.selection_label || it.selection || "").replace(/ ML$/i, ""))) + ' <b>' + esc(it.odds_display || fmtOdds(it.odds)) + '</b></span>');
            });
        }
        var tot = groupByKey(game, "total");
        if (tot && tot.items && tot.items[0]) {
            chips.push('<span class="hh-chip">O/U <b>' + esc((tot.items[0].line_display || tot.items[0].line || "").toString().replace(/^\+/, "")) + '</b></span>');
        }
        if (!chips.length) chips.push('<span class="hh-chip hh-chip--muted">' + (game.lines_pending ? "Lines pending" : "No line") + '</span>');
        return chips.join("");
    }

    /* ---------------- COMMUNITY ---------------- */
    function consensusFor(game) {
        var al = lastName(game.away_team), hl = lastName(game.home_team);
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
    function renderBody(game, bodyEl, node) {
        if (bodyEl.dataset.loaded === "1") return;
        bodyEl.dataset.loaded = "1";
        var uid = "g" + (++UID);

        var sportsbookHref = "/sportsbook/?sport=baseball_mlb#picks";
        var shareHref = location.pathname + "#game-" + encodeURIComponent(game.id);
        var actions = '<div class="hh-actions">' +
            '<a class="hh-btn hh-btn--primary" href="' + sportsbookHref + '">Make Pick</a>' +
            '<button type="button" class="hh-btn hh-btn--ghost" data-share data-href="' + esc(shareHref) + '">Copy Matchup Link</button>' +
            '</div>';

        var P = buildTabs(bodyEl, uid, actions);

        /* Board-derived tabs render immediately — no network needed. */
        P.markets.innerHTML = marketsHtml(game);
        P.community.innerHTML = consensusFor(game);

        var API_TABS = ["overview", "pitchers", "offense", "bullpens", "trends"];
        function setLoading() {
            API_TABS.forEach(function (id) { P[id].innerHTML = loadingHtml(); });
        }
        function setError(msg) {
            API_TABS.forEach(function (id) {
                P[id].innerHTML = errorHtml(msg);
                var btn = P[id].querySelector("[data-retry]");
                if (btn) btn.addEventListener("click", load);
            });
        }
        function paint(d) {
            P.overview.innerHTML = overviewHtml(d, game);
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
            /* The board feed carries no venue; the research API does. */
            var vEl = node && node.querySelector("[data-venue]");
            if (vEl && !vEl.textContent && d.overview && d.overview.venue) vEl.textContent = d.overview.venue;
        }
        function load() {
            setLoading();
            var url = API + "/handicapping/mlb/matchup?away=" + encodeURIComponent(game.away_team) +
                "&home=" + encodeURIComponent(game.home_team) +
                "&date=" + encodeURIComponent(slateDateET(game.commence_time));
            var cached = STATE.matchup[game.id];
            (cached ? Promise.resolve(cached) : getJSON(url).then(function (d) { STATE.matchup[game.id] = d; return d; }))
                .then(paint)
                .catch(function (e) {
                    var msg = e && e.name === "AbortError"
                        ? "The research API timed out. It may be waking up from idle, retry in a moment."
                        : "The research API returned an error (" + esc(e && e.message ? e.message : "unknown") + ").";
                    setError(msg);
                });
        }
        load();

        var share = bodyEl.querySelector("[data-share]");
        if (share) share.addEventListener("click", function () {
            var url = location.origin + share.getAttribute("data-href");
            if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () {
                share.textContent = "Link Copied";
                setTimeout(function () { share.textContent = "Copy Matchup Link"; }, 1600);
            });
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
            if (open) renderBody(game, body, node);
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

    function render(list) {
        gamesEl.innerHTML = "";
        if (!list.length) {
            statusEl.style.display = "";
            statusEl.className = "hh-status is-empty";
            statusEl.innerHTML = "No MLB games match right now.";
            return;
        }
        statusEl.style.display = "none";
        list.forEach(function (g) { gamesEl.appendChild(gameEl(g)); });
        if (location.hash.indexOf("#game-") === 0) {
            var target = document.getElementById(location.hash.slice(1));
            if (target) {
                target.querySelector("[data-toggle]").click();
                setTimeout(function () { target.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
            }
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
            getJSON(API + "/external-picks/consensus?days=3").catch(function () { return { groups: [] }; })
        ]).then(function (res) {
            var board = res[0] || {}, tr = res[1] || {}, cons = res[2] || {};
            var games = (board.games || []).slice().sort(function (a, b) { return new Date(a.commence_time) - new Date(b.commence_time); });
            games.forEach(function (g) { g.matchupKey = matchupKeyForGame(g); });
            STATE.games = games;
            STATE.trendsByMatchup = buildMatchupIndex(tr.trends || []);
            /* The consensus endpoint returns {window_days, groups}. The old code read
               `.consensus || .rows`, which are keys it has never returned — community
               consensus was dead on every matchup. */
            STATE.consensus = cons.groups || [];
            dateSub.textContent = games.length ? (games.length + " game" + (games.length === 1 ? "" : "s") + " on the board") : "No games posted";
            if (!games.length) {
                statusEl.className = "hh-status is-empty";
                statusEl.innerHTML = "No MLB games are posted on the board right now.<br><a class=\"hh-status__cta\" href=\"/handicapping/\">Back to the Handicapping Hub →</a>";
                return;
            }
            render(games);
        }).catch(function () {
            statusEl.className = "hh-status is-empty";
            statusEl.textContent = "Could not load the MLB slate. Please refresh in a moment.";
        });
    }

    if (findEl) findEl.addEventListener("input", function () { clearTimeout(findEl._t); findEl._t = setTimeout(applyFilter, 180); });
    var todayBtn = document.getElementById("hh-today");
    if (todayBtn) todayBtn.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
    boot();
})();
