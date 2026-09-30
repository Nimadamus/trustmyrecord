#!/usr/bin/env python3
"""The written half of the NHL Featured Game page. NHL_FEATURED_GAME_20260929.

Every sentence here is assembled from a value in the page context, the same
context the stat sections are rendered from, so the article can never say
something the tables do not show. A paragraph whose inputs are missing is
left out rather than padded. No dashes as punctuation (house rule), negative
numbers take the sign, and a number from last season always names the season.

Club names read as plurals ("the Canucks are", "the Wild have").
"""

import featured_game_engine as fg


def the(t, cap=False):
    s = "the %s" % t["common"]
    return s[0].upper() + s[1:] if cap else s


def poss(t, cap=False):
    s = the(t, cap)
    return s + ("'" if s.endswith("s") else "'s")


def _rk(row, key):
    r = (row or {}).get("rank", {}).get(key)
    return fg.ordinal(r) if r else None


def _res_word(r):
    return {"W": "beat", "L": "lost to", "OTL": "lost in overtime to"}.get(r["res"], "played")


def _score_text(r):
    hi, lo = max(r["gf"], r["ga"]), min(r["gf"], r["ga"])
    tail = {"SO": " in a shootout", "OT": " in overtime"}.get(r.get("ended"), "")
    if r["res"] == "OTL":
        tail = ""
    return "%d-%d%s" % (hi, lo, tail)


def _join(items):
    items = [i for i in items if i]
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def _season_word(ctx, current):
    return "this season" if current else "last season"


def headline(ctx):
    return "%s vs. %s Preview, Prediction, Stats and Trends" % (ctx["away"]["common"], ctx["home"]["common"])


def title(ctx):
    return "%s vs. %s Prediction, Odds and Preview: %s" % (ctx["away"]["common"], ctx["home"]["common"],
                                                         ctx["date_text"])


def description(ctx):
    a, h = ctx["away"], ctx["home"]
    text = "%s at %s, %s, %s ET. " % (a["name"], h["name"], ctx["date_text"], ctx["et_time"])
    gl = ctx.get("goalies") or {}
    names = [((gl.get(s) or {}).get("profile") or {}).get("last_name") for s in ("away", "home")]
    named = all((gl.get(s) or {}).get("status") in ("confirmed", "expected") for s in ("away", "home"))
    if named and all(names):
        text += "%s vs. %s in goal. " % tuple(names)
    text += "Odds, advanced stats, trends and the TMR model."
    return text if len(text) <= 165 else text[:162].rsplit(" ", 1)[0] + "..."


# ------------------------------------------------------------------ sections

def why(ctx):
    sel = ctx.get("selection") or {}
    factors = {f["label"]: f for f in sel.get("factors") or []}
    a, h = ctx["away"], ctx["home"]
    if not factors:
        return []
    n = len(sel.get("board") or [])
    count = "both games" if n == 2 else "all %d games" % n
    still = " still to be played" if n < (sel.get("slate_games") or n) else ""
    out = [("We looked at %s%s on the %s slate, and this is the one we're featuring." % (count, still, ctx["date_text"]))
           if n > 1 else "It's the only game on the %s schedule, and it deserves the full treatment." % ctx["date_text"]]
    s = []
    if "Rivalry" in factors and ctx.get("rivalry"):
        s.append("It's %s, a rivalry that doesn't need a good standings reason to get heated." % ctx["rivalry"])
    if "Division game" in factors:
        s.append("It's a %s Division game, so whatever the winner takes comes straight out of a direct rival's column."
                 % a["standing"]["division"])
    elif "Conference game" in factors:
        s.append("It's a %s Conference game with seeding implications down the line." % a["standing"]["conference"])
    if "Original Six" in factors and "Rivalry" not in factors:
        s.append("Two Original Six clubs, which never needs much selling.")
    lp = (ctx.get("leaders") or {}).get("points") or {}
    if "Star power" in factors and len(lp) == 2:
        s.append("It puts %s %s, who led %s with %s points in %s, on the ice against %s %s, who led %s with %s." % (
            lp["away"]["first"], lp["away"]["last"], the(a), lp["away"]["value"], ctx.get("leaders_season"),
            lp["home"]["first"], lp["home"]["last"], the(h), lp["home"]["value"]))
    if "Home opener" in factors:
        s.append("It's %s home opener." % poss(h))
    if "National TV" in factors:
        d = factors["National TV"]["detail"]
        s.append("It's a %s." % (d[0].lower() + d[1:]))
    if "Betting interest" in factors and factors["Betting interest"]["points"] >= 3:
        s.append("And the market has it close enough that the price itself is part of the story.")
    if "Playoff race" in factors:
        s.append("The playoff race runs right through it: %s." % factors["Playoff race"]["detail"])
    if "Team quality" in factors and len(s) < 3:
        s.append("By combined points percentage it's the strongest pairing on the board.")
    if s:
        out.append(" ".join(s))
    return out


def form(ctx):
    paras = []
    a, h = ctx["away"], ctx["home"]
    for t in (a, h):
        rec, st = t["record"], t["standing"]
        if rec["gp"] == 0:
            prev = t.get("prev")
            if prev:
                paras.append("%s open their season here. Last season they finished %s with %d points, going %s at home "
                             "and %s on the road, and scored %d goals while allowing %d." % (
                                 the(t, True), prev["record"]["text"], prev["record"]["pts"], prev["home"]["text"],
                                 prev["road"]["text"], prev["record"]["gf"], prev["record"]["ga"]))
            continue
        s = "%s are %s with %d points" % (the(t, True), rec["text"], rec["pts"])
        if st.get("division_rank") and st.get("division"):
            s += ", %s in the %s Division" % (fg.ordinal(st["division_rank"]), st["division"])
            if st.get("conference_rank"):
                s += " and %s in the %s Conference" % (fg.ordinal(st["conference_rank"]), st["conference"])
        s += "."
        g5 = t.get("games5") or []
        if rec["gp"] <= 3 and g5:
            parts = ["%s %s %s" % (_res_word(r), r["opp"], _score_text(r)) for r in g5]
            s += " So far they %s." % ", then ".join(parts)
        else:
            l10, sk = t.get("last10"), t.get("streak")
            if l10:
                s += " They're %s over their last %d, with %d goals for and %d against." % (
                    l10["text"], l10["gp"], l10["gf"], l10["ga"])
            if sk and sk["n"] >= 3:
                kind = {"W": "won", "L": "lost", "OTL": "lost in overtime"}[sk["kind"]]
                s += " They've %s %d straight." % (kind, sk["n"])
        paras.append(s)
    rest = []
    for t in (a, h):
        r = t.get("rest") or {}
        if r.get("b2b"):
            last = r.get("last") or {}
            rest.append("%s played last night (%s %s, %s), so this is the second half of a back to back" % (
                the(t, True), "a win over" if last.get("res") == "W" else "a loss to", last.get("opp"), _score_text(last))
                if last else "%s are on the second half of a back to back" % the(t, True))
        elif r.get("days") is not None:
            rest.append("%s have had %d %s off" % (the(t, True), r["days"], "day" if r["days"] == 1 else "days"))
    if rest:
        paras.append("On the schedule, " + "; ".join(rest[:1] + [x[0].lower() + x[1:] for x in rest[1:]]) + ".")
    return paras


def players(ctx):
    lead = ctx.get("leaders") or {}
    pts, gls = lead.get("points") or {}, lead.get("goals") or {}
    a, h = ctx["away"], ctx["home"]
    if len(pts) < 2:
        return []
    season = ctx.get("leaders_season")
    paras = []
    for side, t in (("away", a), ("home", h)):
        p, g = pts.get(side), gls.get(side)
        s = "For %s, %s %s led the club with %s points in %s" % (the(t), p["first"], p["last"], p["value"], season)
        if g and g["last"] != p["last"]:
            s += ", and %s %s led in goals with %s" % (g["first"], g["last"], g["value"])
        elif g:
            s += ", including a team best %s goals" % g["value"]
        s += "."
        paras.append(s)
    inj = ctx.get("injuries") or {}
    out_names = {r["name"] for side in ("away", "home") for r in inj.get(side) or []
                 if r.get("status") in ("Out", "Injured Reserve", "Long Term Injured Reserve")}
    missing = [("%s %s" % (p["first"], p["last"])) for p in list(pts.values()) + list(gls.values())
               if "%s %s" % (p["first"], p["last"]) in out_names]
    if missing:
        paras.append("Worth flagging: %s %s on the injury report." % (_join(sorted(set(missing))),
                                                                      "is" if len(set(missing)) == 1 else "are"))
    return paras


def offense(ctx):
    s, adv = ctx.get("stats") or {}, ctx.get("adv") or {}
    if not s:
        return []
    a, h = ctx["away"], ctx["home"]
    ra, rh = s["away"], s["home"]
    cur = s.get("current")
    when = "this season" if cur else "last season (%s)" % s["label"].replace(" regular season", "")
    paras = ["%s scored %s goals a game %s, %s in the league, on %s shots a game. %s scored %s, %s, on %s shots." % (
        the(a, True), fg.num(ra["gfpg"]), when, _rk(ra, "gfpg"), fg.num(ra["sfpg"], 1), the(h, True),
        fg.num(rh["gfpg"]), _rk(rh, "gfpg"), fg.num(rh["sfpg"], 1))]
    if ra.get("shpct") and rh.get("shpct"):
        sharp, dull = (a, h) if ra["shpct"] > rh["shpct"] else (h, a)
        rs, rd = (ra, rh) if sharp is a else (rh, ra)
        gap = rs["shpct"] - rd["shpct"]
        paras.append("%s converted %s of their shots on goal to %s for %s. %s" % (
            the(sharp, True), fg.pct(rs["shpct"]), fg.pct(rd["shpct"]), the(dull),
            "A finishing gap that wide usually has a volume story behind it, and here the shot counts point the same "
            "way." if gap > 0.012 and rs["sfpg"] > rd["sfpg"] else
            "A finishing gap that wide tends to shrink over a long season, so don't lean on it too hard." if gap > 0.012
            else "Neither side relied on unusual finishing, so shot volume carries most of the weight."))
    if adv:
        xa, xh = adv["away"], adv["home"]
        lbl = adv["label"].replace(" regular season", "")
        paras.append("MoneyPuck's expected goals model tells the same story from a different angle. In %s %s created "
                     "%s expected goals a game (%s) with %s high danger shots, while %s created %s (%s) with %s. "
                     "Those attacks now run into %s defense, which allowed %s expected goals a game, and %s, which "
                     "allowed %s." % (
                         lbl, the(a), fg.num(xa["xgf"]), _rk(xa, "xgf"), fg.num(xa["hdf"], 1), the(h), fg.num(xh["xgf"]),
                         _rk(xh, "xgf"), fg.num(xh["hdf"], 1), poss(h), fg.num(xh["xga"]), poss(a),
                         fg.num(xa["xga"])))
    return paras


def defense(ctx):
    s, adv = ctx.get("stats") or {}, ctx.get("adv") or {}
    if not s:
        return []
    a, h = ctx["away"], ctx["home"]
    ra, rh = s["away"], s["home"]
    when = _season_word(ctx, s.get("current"))
    paras = ["Defensively, %s allowed %s goals a game %s (%s) and %s shots against. %s gave up %s goals (%s) on %s "
             "shots a game." % (the(a), fg.num(ra["gapg"]), when, _rk(ra, "gapg"), fg.num(ra["sapg"], 1),
                                the(h, True), fg.num(rh["gapg"]), _rk(rh, "gapg"), fg.num(rh["sapg"], 1))]
    if ra.get("sdpg") is not None and rh.get("sdpg") is not None and abs(ra["sdpg"] - rh["sdpg"]) >= 0.5:
        better = a if ra["sdpg"] > rh["sdpg"] else h
        rb, rw = (ra, rh) if better is a else (rh, ra)
        paras.append("The shot differential is where the gap shows. %s finished at %+.1f shots a game against %+.1f "
                     "for %s, and the team that owns the puck usually decides what kind of game this is." % (
                         the(better, True), rb["sdpg"], rw["sdpg"], the(h if better is a else a)))
    if adv and adv["away"].get("hda") is not None and adv["home"].get("hda") is not None:
        xa, xh = adv["away"], adv["home"]
        tight = a if xa["hda"] < xh["hda"] else h
        paras.append("Around the net, %s were the stingier side, allowing %s high danger shots a game to %s %s." % (
            the(tight), fg.num(min(xa["hda"], xh["hda"]), 1), poss(h if tight is a else a),
            fg.num(max(xa["hda"], xh["hda"]), 1)))
    return paras


def _gline(prof):
    cur, last = prof.get("current"), prof.get("last_season")
    if cur and cur["gp"] >= 3:
        return cur, "this season"
    if last and last["gp"]:
        return last, "in %s" % prof.get("last_label")
    return None, None


def goaltending(ctx):
    gl = ctx.get("goalies") or {}
    a, h = ctx["away"], ctx["home"]
    paras = []
    named = []
    for side, t, opp in (("away", a, h), ("home", h, a)):
        g = gl.get(side) or {}
        prof = g.get("profile") or {}
        word = {"confirmed": "is confirmed to start", "expected": "is expected to start"}.get(g.get("status"))
        if not word or not prof.get("name"):
            continue
        named.append(prof)
        line, when = _gline(prof)
        s = "%s %s for %s." % (prof["name"], word, the(t))
        if line:
            s += " He went %s with a %s save percentage and a %s goals against average %s, over %d games." % (
                line["record"], fg.svpct(line["sv"]), fg.num(line["gaa"]), when, line["gp"])
        split = prof.get("road") if side == "away" else prof.get("home")
        if split and split["gp"] >= 5:
            s += " %s that season he saved %s." % ("On the road" if side == "away" else "At home", fg.svpct(split["sv"]))
        vs = prof.get("vs")
        if vs and vs["gp"] >= 2:
            s += " He's %s against %s since the start of %s, with a %s save percentage in %d games." % (
                vs["record"], the(opp), prof["vs_span"].split(" through ")[0], fg.svpct(vs["sv"]), vs["gp"])
        rec = [r for r in prof.get("recent") or [] if r.get("sv") is not None]
        if len(rec) >= 3:
            sv = sum(r["sa"] - r["ga"] for r in rec) / float(max(1, sum(r["sa"] for r in rec)))
            s += " Over his last %d appearances he stopped %s of the shots he faced." % (len(rec), fg.svpct(sv))
        paras.append(s)
    unknown = [t for side, t in (("away", a), ("home", h)) if (gl.get(side) or {}).get("status") == "unknown"]
    if len(unknown) == 2:
        paras.append("Neither club has named a starter yet. The goalie cards above update through the day and switch "
                     "the moment a starter is reported.")
    elif unknown:
        paras.append("%s haven't named a starter yet, and the card above updates as soon as one is reported."
                     % the(unknown[0], True))
    if len(named) == 2:
        la, _ = _gline(named[0])
        lh, _ = _gline(named[1])
        if la and lh and la.get("sv") and lh.get("sv"):
            gap = abs(la["sv"] - lh["sv"]) * 1000
            if gap >= 8:
                better = named[0] if la["sv"] > lh["sv"] else named[1]
                paras.append("That's a real gap in the crease: %s's save percentage sits about %d points higher, and "
                             "on 30 shots that's close to a quarter of a goal a night." % (better["name"], round(gap)))
            else:
                paras.append("On paper the crease is close to even, the two save percentages within %d points of each "
                             "other, so the skaters in front of them are more likely to decide it." % max(1, round(gap)))
    return paras


def special_teams(ctx):
    s = ctx.get("stats") or {}
    if not s:
        return []
    a, h = ctx["away"], ctx["home"]
    ra, rh = s["away"], s["home"]
    when = _season_word(ctx, s.get("current"))
    paras = []
    if ra.get("pp") is not None and rh.get("pk") is not None:
        paras.append("%s power play ran at %s %s, %s in the league, and it goes up against %s penalty kill, which "
                     "worked at %s (%s). The other way, %s power play clicked at %s (%s) against %s kill at %s (%s)." % (
                         poss(a, True), fg.pct(ra["pp"]), when, _rk(ra, "pp"), poss(h), fg.pct(rh["pk"]),
                         _rk(rh, "pk"), poss(h), fg.pct(rh["pp"]), _rk(rh, "pp"), poss(a), fg.pct(ra["pk"]),
                         _rk(ra, "pk")))
        net_a, net_h = ra["pp"] + ra["pk"], rh["pp"] + rh["pk"]
        if abs(net_a - net_h) >= 0.03:
            better = a if net_a > net_h else h
            ml = (ctx.get("odds") or {}).get("ml") or {}
            ia, ih = fg.implied(ml.get("away")), fg.implied(ml.get("home"))
            tight = bool(ia and ih and 0.4 <= ih / (ia + ih) <= 0.6)
            paras.append("Add the two units together and %s carry a special teams edge of %.1f points. %s" % (
                the(better), abs(net_a - net_h) * 100,
                "In a game priced this tight, one power play goal can be the whole difference." if tight else
                "That's often where a favorite pulls away, or where an underdog finds the goal it needs."))
    if ra.get("fo") is not None and rh.get("fo") is not None:
        fo = a if ra["fo"] > rh["fo"] else h
        paras.append("In the faceoff circle %s won %s of their draws to %s for %s." % (
            the(fo), fg.pct(max(ra["fo"], rh["fo"])), fg.pct(min(ra["fo"], rh["fo"])), the(h if fo is a else a)))
    return paras


def injuries(ctx):
    inj = ctx.get("injuries") or {}
    paras = []
    for side in ("away", "home"):
        t = ctx[side]
        out = [r for r in inj.get(side) or [] if r.get("status") in ("Out", "Injured Reserve", "Long Term Injured Reserve")]
        dtd = [r for r in inj.get(side) or [] if r.get("status") == "Day-To-Day"]
        if not out and not dtd:
            continue
        s = the(t, True)
        if out:
            named = ["%s (%s)" % (r["name"], (r.get("type") or r["status"]).lower()) for r in out[:4]]
            s += " are without %s" % _join(named)
            if len(out) > 4:
                s += ", with %d more on the injury report" % (len(out) - 4)
        if dtd:
            s += "%s %s listed day to day" % (" and have" if out else " have", _join([r["name"] for r in dtd[:3]]))
        paras.append(s + ".")
    return paras


def tactics(ctx):
    adv = ctx.get("adv") or {}
    a, h = ctx["away"], ctx["home"]
    paras = []
    if adv and adv["away"].get("cf5") is not None and adv["home"].get("cf5") is not None:
        xa, xh = adv["away"], adv["home"]
        lbl = adv["label"].replace(" regular season", "")
        paras.append("At five on five in %s, %s took %s of the shot attempts in their games and %s of the expected "
                     "goals. %s sat at %s and %s." % (lbl, the(a), fg.pct(xa["cf5"]), fg.pct(xa.get("xgpct5")),
                                                     the(h, True), fg.pct(xh["cf5"]), fg.pct(xh.get("xgpct5"))))
        tilt = a if (xa.get("xgpct5") or 0) > (xh.get("xgpct5") or 0) else h
        other = h if tilt is a else a
        paras.append("So the likely shape of this one has %s spending more time in the offensive zone, and %s needing "
                     "their goaltender and their transition game to make fewer looks count." % (the(tilt), the(other)))
        avg = (adv.get("avg") or {}).get("pace")
        if avg:
            both = (xa["xgf"] + xa["xga"] + xh["xgf"] + xh["xga"]) / 2
            paras.append("Games involving these two produced %s expected goals a night on average, against a league "
                         "norm of %s. %s" % (fg.num(both), fg.num(avg),
                                             "That's a higher event pairing than usual." if both > avg * 1.03 else
                                             "That's a lower event pairing than usual." if both < avg * 0.97 else
                                             "That's right around league average for pace."))
    return paras


def _pl(p):
    try:
        return "%+.1f" % float(p)
    except (TypeError, ValueError):
        return str(p)


def market(ctx):
    o = ctx.get("odds") or {}
    a, h = ctx["away"], ctx["home"]
    paras = []
    ml, pl, tot = o.get("ml") or {}, o.get("pl") or {}, o.get("total") or {}
    fair_h = None
    if ml:
        ia, ih = fg.implied(ml.get("away")), fg.implied(ml.get("home"))
        fair_h = ih / (ia + ih) if ia and ih else None
        s = "%s has %s at %s and %s at %s on the moneyline." % (
            o.get("book") or "The book", the(a), fg.american(ml.get("away")), the(h), fg.american(ml.get("home")))
        if fair_h:
            fav = h if fair_h >= 0.5 else a
            s += " Take out the margin and that makes %s a %.1f%% favorite." % (
                the(fav), (fair_h if fav is h else 1 - fair_h) * 100)
        paras.append(s)
    if pl:
        paras.append("On the puck line it's %s %s at %s and %s %s at %s." % (
            the(a, False), _pl(pl["away"]["point"]), fg.american(pl["away"]["price"]),
            the(h), _pl(pl["home"]["point"]), fg.american(pl["home"]["price"])))
    if tot:
        paras.append("The total sits at %s, over %s and under %s." % (
            tot.get("point"), fg.american(tot.get("over")), fg.american(tot.get("under"))))
    lt = ctx.get("line_track") or {}
    f, l = lt.get("first"), lt.get("last")
    if f and l and f.get("at") != l.get("at"):
        moves = []
        if (f.get("ml") or {}).get("home") is not None and (l.get("ml") or {}).get("home") is not None \
                and f["ml"]["home"] != l["ml"]["home"]:
            moves.append("%s moneyline has moved from %s to %s" % (poss(h), fg.american(f["ml"]["home"]),
                                                                    fg.american(l["ml"]["home"])))
        if (f.get("total") or {}).get("point") is not None and (l.get("total") or {}).get("point") is not None \
                and f["total"]["point"] != l["total"]["point"]:
            moves.append("the total has gone from %s to %s" % (f["total"]["point"], l["total"]["point"]))
        if moves:
            paras.append("Since the TMR board first posted this game on %s, %s." % (
                fg.pacific_stamp(fg.parse_utc(f["at"])), _join(moves)))
    m = ctx.get("model") or {}
    if m.get("win") and fair_h:
        mh = m["win"].get("home")
        if mh is not None:
            diff = (mh - fair_h) * 100
            if abs(diff) >= 3:
                side = h if diff > 0 else a
                paras.append("The TMR NHL simulator has %s winning %.1f%% of the time, %.1f points more than the "
                             "moneyline implies. That's a gap worth knowing about, not a pick." % (
                                 the(side), (mh if side is h else 1 - mh) * 100, abs(diff)))
            else:
                paras.append("The TMR NHL simulator lands within %.1f points of the market on the moneyline, so the "
                             "model doesn't see much daylight in the price." % abs(diff))
    if (m.get("total") or {}).get("p50") is not None and tot.get("point") is not None:
        paras.append("Across 10,000 simulated games the model's median total is %s goals, with the book at %s." % (
            m["total"]["p50"], tot["point"]))
    return paras


def key_trends(ctx):
    tr = ctx.get("trends") or []
    if not tr:
        return []
    return ["A few numbers worth carrying into puck drop:"] + [t["text"] for t in tr[:6]]


def decide(ctx):
    a, h = ctx["away"], ctx["home"]
    s = ctx.get("stats") or {}
    keys = []
    if s:
        ra, rh = s["away"], s["home"]
        if None not in (ra.get("pp"), rh.get("pp"), ra.get("pk"), rh.get("pk")):
            better = a if (ra["pp"] + ra["pk"]) > (rh["pp"] + rh["pk"]) else h
            keys.append("Special teams. %s have the better combined units, so a game full of penalties leans their way."
                        % the(better, True))
        if ra.get("sdpg") is not None and rh.get("sdpg") is not None:
            tilt = a if ra["sdpg"] > rh["sdpg"] else h
            keys.append("Shot share. If %s tilt the ice the way their shot differential says they should, the other side "
                        "needs its goalie to steal one." % the(tilt))
    gl = ctx.get("goalies") or {}
    named = [((gl.get(x) or {}).get("profile") or {}).get("name") for x in ("away", "home")
             if (gl.get(x) or {}).get("status") in ("confirmed", "expected")]
    if len(named) == 2 and all(named):
        keys.append("The goalies. %s against %s is the matchup inside the matchup." % tuple(named))
    for t in (a, h):
        if (t.get("rest") or {}).get("b2b"):
            keys.append("Legs. %s are playing their second game in two nights." % the(t, True))
    m = ctx.get("model") or {}
    out = keys[:4]
    if m.get("score") and m.get("win"):
        fav = h if m["win"]["home"] >= m["win"]["away"] else a
        out.append("The model's view. The TMR simulator's average score is %s %s, %s %s, with %s winning %.1f%% of "
                   "10,000 runs and %.1f%% of games going past regulation." % (
                       a["common"], fg.num(m["score"].get("away"), 1), h["common"], fg.num(m["score"].get("home"), 1),
                       the(fav), max(m["win"]["home"], m["win"]["away"]) * 100, (m.get("ot") or 0) * 100))
    return out


def build(ctx):
    sections = []
    for h2, fn in (("Why this is the featured game", why), ("Current form", form), ("Players to watch", players),
                   ("The offensive matchup", offense), ("The defensive matchup", defense),
                   ("In goal", goaltending), ("Special teams", special_teams),
                   ("Injuries and lineup notes", injuries), ("How the game should be played", tactics),
                   ("The betting market", market), ("Key trends", key_trends), ("What could decide it", decide)):
        try:
            paras = [fg.undash(p) for p in fn(ctx) if p]
        except (KeyError, TypeError, ValueError, ZeroDivisionError) as exc:
            print("  article section %r skipped: %s" % (h2, exc))
            paras = []
        if paras:
            sections.append({"h2": h2, "paras": paras, "list": h2 in ("Key trends", "What could decide it")})
    words = sum(len(p.split()) for s in sections for p in s["paras"])
    return {"headline": headline(ctx), "title": title(ctx), "description": description(ctx),
            "sections": sections, "words": words}
