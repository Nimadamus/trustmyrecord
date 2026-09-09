/* TrustMyRecord — Handicapping Hub live board.

   HUB_KEEPS_ITSELF_CURRENT_20260909. Nima's operating model: a Handicapping Hub
   is a LIVING daily research page. It shows today's slate, it rolls forward on
   its own when the date changes, and the prices on it are the prices right now,
   not the prices at the last bake.

   MLB and tennis already render their hubs from the feed in the browser. The
   five hubs baked by scripts/build_sport_matchup_pages.py (NFL, NBA, NHL,
   NCAAF, Soccer) did not: they were static tables refreshed four times a day,
   so between 22:40 and 10:40 UTC the board on the page was up to twelve hours
   behind the board in the sportsbook, and a game that moved from +3.5 to +6.5
   overnight still read +3.5 in the morning.

   This file puts the same live layer on those five. The baked table stays
   exactly as it is and is what a crawler and a reader with no JavaScript get;
   this repaints it from /api/games/board/<key> on load and every 90 seconds the
   tab is visible, and says when it last read the feed.

   HARD RULES it keeps:
     * nothing is invented. A market the feed does not carry renders exactly the
       string the builder renders, "not priced".
     * a fixture links to its permanent research page ONLY if that page already
       exists. The hrefs are harvested from the baked table, so a fixture the
       bake has not seen yet is plain text rather than a link into a 404.
     * a failed or slow feed changes nothing. The baked board stays on screen. */
(function () {
    "use strict";

    var BOARDS = {
        nfl: "americanfootball_nfl",
        nba: "basketball_nba",
        nhl: "icehockey_nhl",
        ncaaf: "americanfootball_ncaaf"
    };
    /* MLB, soccer and tennis are not here on purpose: each of those three has
       its own richer hub renderer with its own markup, and MLB and tennis
       already read the feed in the browser. This file is only for the hubs
       render_hub() writes as a plain mm-table. */
    var m = location.pathname.match(/^\/handicapping\/([a-z]+)\/?$/);
    var sport = m && BOARDS[m[1]] ? m[1] : null;
    if (!sport) return;

    var API = (window.CONFIG && CONFIG.api && CONFIG.api.baseUrl)
        || "https://trustmyrecord-api.onrender.com/api";
    var POLL_MS = 90000;

    function esc(v) {
        return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }
    /* Same shape the builder writes, so the page does not change character when
       the live layer takes over: +150, -180, +3.5, o44.5. */
    function odds(v) {
        if (v == null || v === "") return null;
        var n = Math.round(Number(v));
        if (!isFinite(n)) return null;
        return n > 0 ? "+" + n : String(n);
    }
    function line(v) {
        if (v == null || v === "") return null;
        var n = Number(v);
        if (!isFinite(n)) return null;
        var t = String(n);
        return n > 0 ? "+" + t : t;
    }
    function etTime(iso) {
        if (!iso) return "TBD";
        var d = new Date(iso);
        if (isNaN(d.getTime())) return "TBD";
        try {
            return d.toLocaleTimeString("en-US", {
                timeZone: "America/New_York", hour: "numeric", minute: "2-digit"
            });
        } catch (err) {
            return "TBD";
        }
    }
    function etClock() {
        try {
            return new Date().toLocaleTimeString("en-US", {
                timeZone: "America/New_York", hour: "numeric", minute: "2-digit"
            }) + " ET";
        } catch (err) {
            return new Date().toISOString().slice(11, 16) + " UTC";
        }
    }

    /* The first bookmaker carrying each market, which is what best_markets()
       does server side. Deliberately not an average: an averaged line is a
       number nobody can bet. */
    function markets(g) {
        var out = { h2h: null, spread: null, total: null };
        (g.bookmakers || []).forEach(function (b) {
            (b.markets || []).forEach(function (mk) {
                var outcomes = mk.outcomes || [];
                if (mk.key === "h2h" && !out.h2h) {
                    out.h2h = {};
                    outcomes.forEach(function (o) { out.h2h[o.name] = o.price; });
                } else if (mk.key === "spreads" && !out.spread) {
                    out.spread = {};
                    outcomes.forEach(function (o) { out.spread[o.name] = [o.point, o.price]; });
                } else if (mk.key === "totals" && !out.total) {
                    outcomes.forEach(function (o) {
                        if (String(o.name || "").toLowerCase() === "over") {
                            out.total = { point: o.point, price: o.price };
                        }
                    });
                }
            });
        });
        return out;
    }

    function cells(g) {
        var mk = markets(g);
        var away = g.away_team, home = g.home_team;
        var ml = "not priced";
        if (mk.h2h && (odds(mk.h2h[away]) || odds(mk.h2h[home]))) {
            ml = esc(away) + " " + esc(odds(mk.h2h[away]) || "not priced") + " / "
                + esc(home) + " " + esc(odds(mk.h2h[home]) || "not priced");
        }
        var sp = "not priced";
        if (mk.spread && mk.spread[home] && mk.spread[home][0] != null) {
            sp = esc(home) + " " + esc(line(mk.spread[home][0]))
                + " (" + esc(odds(mk.spread[home][1]) || "not priced") + ")";
        }
        var tot = "not priced";
        if (mk.total && mk.total.point != null) {
            tot = "o" + esc(String(Number(mk.total.point)))
                + " (" + esc(odds(mk.total.price) || "not priced") + ")";
        }
        return [ml, sp, tot];
    }

    var table = null, tbody = null, lede = null, stamp = null, hrefs = {};

    function key(away, home) {
        return (String(away) + "@" + String(home)).toLowerCase().replace(/\s+/g, " ").trim();
    }

    /* The permanent research pages are minted by the bake, so the browser has no
       way to know a fixture's URL. It learns them from the table it is about to
       replace, and a fixture with no known page stays plain text. */
    function harvest() {
        Array.prototype.forEach.call(tbody.querySelectorAll("tr"), function (tr) {
            var a = tr.querySelector("td a[href^='/handicapping/']");
            if (!a) return;
            var txt = a.textContent.split(/\s+at\s+/);
            if (txt.length === 2) hrefs[key(txt[0], txt[1])] = a.getAttribute("href");
        });
    }

    function paint(games) {
        var isSoccer = sport === "soccer";
        var priced = 0;
        var rows = games.map(function (g) {
            var away = g.away_team, home = g.home_team;
            var c = cells(g);
            if (c[0] !== "not priced" || c[1] !== "not priced" || c[2] !== "not priced") priced += 1;
            var href = hrefs[key(away, home)];
            var fixture = href
                ? '<a href="' + esc(href) + '">' + esc(away) + " at " + esc(home) + "</a>"
                : esc(away) + " at " + esc(home);
            var comp = isSoccer
                ? "<td>" + esc(g.tournament_name || g.sport_title || "") + "</td>" : "";
            return "<tr><td>" + fixture + "</td>" + comp + "<td>" + esc(etTime(g.commence_time))
                + "</td><td>" + c[0] + "</td><td>" + c[1] + "</td><td>" + c[2] + "</td></tr>";
        }).join("");
        if (!rows) return false;
        tbody.innerHTML = rows;
        if (lede) {
            lede.textContent = games.length + " game" + (games.length === 1 ? "" : "s")
                + " listed, " + priced + " priced by the sportsbook feed. Times are Eastern.";
        }
        if (!stamp) {
            stamp = document.createElement("p");
            stamp.className = "mm-lede";
            stamp.id = "hub-live-stamp";
            table.parentNode.insertBefore(stamp, table.nextSibling);
        }
        stamp.textContent = "Board read live at " + etClock()
            + ". This page re-reads the sportsbook feed every 90 seconds while it is open.";
        return true;
    }

    function load() {
        var url = API + "/games/board/" + BOARDS[sport] + "?limit=80&cb=" + Date.now();
        fetch(url, { headers: { accept: "application/json" } })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                var games = (d && d.games ? d.games : []).filter(function (g) {
                    return g && g.home_team && g.away_team && !g.has_placeholder_teams;
                });
                games.sort(function (a, b) {
                    var x = String(a.commence_time || ""), y = String(b.commence_time || "");
                    return x === y ? String(a.away_team).localeCompare(String(b.away_team))
                        : x.localeCompare(y);
                });
                paint(games);
            })
            .catch(function () { /* the baked board stays exactly as it was */ });
    }

    function start() {
        table = document.querySelector("main table.mm-table");
        if (!table) return;
        tbody = table.querySelector("tbody");
        if (!tbody || !tbody.querySelector("tr")) return;
        var sec = table.closest("section");
        lede = sec ? sec.querySelector("p.mm-lede") : null;
        harvest();
        load();
        setInterval(function () {
            if (document.visibilityState === "visible") load();
        }, POLL_MS);
        document.addEventListener("visibilitychange", function () {
            if (document.visibilityState === "visible") load();
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
