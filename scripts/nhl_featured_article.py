#!/usr/bin/env python3
"""The written half of the NHL Featured Game page. NHL_FEATURED_GAME_20260929,
rebuilt as a full feature preview NHL_FEATURED_REDESIGN_20260930.

Every sentence here is assembled from a value in the page context, the same
context the data modules are rendered from, so the article can never say
something the modules do not show. A paragraph whose inputs are missing is
left out rather than padded, so the length follows the data: a mid season
game with named goalies, odds and a model run reads 1,200 to 2,000 words, an
opener with nothing announced reads shorter. No dashes as punctuation (house
rule), negative numbers take the sign, and a number from last season always
names the season. Model output is always introduced as the model's.

Club names read as plurals ("the Canucks are", "the Wild have").

build(ctx) returns the headline, title, description, the sections keyed by
the page module they sit with, the FAQ and the word count.
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


def _rkp(row, key):
    """' (5th)' after a number, or nothing when the rank is missing."""
    r = _rk(row, key)
    return " (%s)" % r if r else ""


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
    return "this season" if current else "in %s" % ctx["prev_label"]


def _in(ctx, current):
    """' in 2025-26' after a prior season number; nothing for this season."""
    return "" if current else " in %s" % ctx["prev_label"]


def _date(iso):
    import datetime as dt
    d = dt.date.fromisoformat(iso)
    return "%s %d, %d" % (d.strftime("%B"), d.day, d.year)


def _short_date(iso):
    import datetime as dt
    d = dt.date.fromisoformat(iso)
    return "%s %d" % (d.strftime("%b"), d.day)


def _team_name(ctx, abbr):
    return (ctx.get("team_names") or {}).get(abbr) or abbr


def _fair(p1, p2):
    a, b = fg.implied(p1), fg.implied(p2)
    return (a / (a + b), b / (a + b)) if a and b else (None, None)


def _num_word(n):
    return ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] if 0 <= n <= 10 else str(n)


def season_opener(t):
    return t["record"]["gp"] == 0 and (t.get("rest") or {}).get("days") is None


def angle(ctx):
    """The one feature of this game a title can lead with."""
    a, h = ctx["away"], ctx["home"]
    riv = ctx.get("rivalry") or ""
    if riv.startswith("the Battle") or riv.startswith("the Freeway") or riv.startswith("the Hudson") \
            or riv.startswith("the Cascadia"):
        return riv[4:]
    if season_opener(a) and season_opener(h):
        return "Season Opener"
    if season_opener(h):
        return "Home Opener"
    return None


# ------------------------------------------------------------------ meta

def headline(ctx):
    return "%s vs. %s Preview, Prediction, Stats and Trends" % (ctx["away"]["common"], ctx["home"]["common"])


def title(ctx):
    import datetime as dt
    d = dt.date.fromisoformat(ctx["date"]) if ctx.get("date") else None
    when = ("%s %d, %d" % (d.strftime("%b"), d.day, d.year)) if d else ctx["date_text"]
    ang = angle(ctx)
    base = "%s vs. %s Prediction, Odds & %%sPreview (%s)" % (ctx["away"]["common"], ctx["home"]["common"], when)
    # The angle names the game when it fits a title a results page can show
    # in full; otherwise the matchup and date carry it.
    return base % ("%s " % ang) if ang and len(base % ("%s " % ang)) <= 75 else base % ""


def description(ctx):
    a, h = ctx["away"], ctx["home"]
    lead = "%s vs. %s prediction, odds, key players" % (a["common"], h["common"])
    gl = ctx.get("goalies") or {}
    names = [((gl.get(s) or {}).get("profile") or {}).get("last_name") for s in ("away", "home")]
    named = all((gl.get(s) or {}).get("status") in ("confirmed", "expected") for s in ("away", "home"))
    goalie = (", the %s vs. %s goalie matchup" % tuple(names)) if named and all(names) else ", the goalie matchup"
    tail = " and betting trends for %s" % ctx["date_text"]
    venue = (" at %s" % ctx["venue"]) if ctx.get("venue") else ""
    for text in (lead + goalie + tail + venue + ". Puck drop %s ET." % ctx["et_time"],
                 lead + goalie + tail + venue + ".",
                 lead + goalie + tail + ".",
                 lead + ", goalies and betting trends for %s." % ctx["date_text"]):
        if len(text) <= 160:
            return text
    return text[:157].rsplit(" ", 1)[0] + "..."


# ------------------------------------------------------------------ intro and why

def _tv(ctx):
    nets = []
    for b in ctx.get("tv") or []:
        if b.get("market") == "N" and b.get("net") and b["net"] not in nets:
            nets.append(b["net"])
    return nets


def intro(ctx):
    a, h = ctx["away"], ctx["home"]
    out = []
    s = "%s visit %s %s on %s, with puck drop at %s ET (%s PT)." % (
        the(a, True), ("the %s at %s" % (h["common"], ctx["venue"])) if ctx.get("venue") else the(h),
        ("in %s" % ctx["city"]) if ctx.get("city") else "", ctx["long_date"], ctx["et_time"], ctx["pt_time"])
    s = s.replace("  ", " ")
    nets = _tv(ctx)
    if nets:
        s += " It's a national broadcast on %s." % _join(nets)
    if season_opener(a) and season_opener(h):
        s += " It's the %s opener for both clubs." % ctx["season_label"]
    elif season_opener(a) or season_opener(h):
        t = a if season_opener(a) else h
        s += " It's %s first game of %s." % (poss(t), ctx["season_label"])
    if ctx.get("rivalry"):
        riv = ctx["rivalry"]
        s += " And it's %s%s." % (riv, ", which carries its own weight whatever the standings say"
                                  if riv.startswith("the Battle") else "")
    out.append(s)
    s2 = ""
    if a["record"]["gp"] >= 5 and h["record"]["gp"] >= 5:
        s2 = "%s are %s and %s are %s." % (the(a, True), a["record"]["text"], the(h), h["record"]["text"])
    elif not a["record"]["gp"] and not h["record"]["gp"] and a.get("prev") and h.get("prev"):
        s2 = "Last season %s went %s and %s %s." % (the(a), a["prev"]["record"]["text"], the(h),
                                                    h["prev"]["record"]["text"])
    else:
        bits = []
        for t in (a, h):
            if t["record"]["gp"] >= 5 or not t.get("prev"):
                bits.append("%s are %s" % (the(t), t["record"]["text"]))
            else:
                bits.append("%s went %s last season%s" % (the(t), t["prev"]["record"]["text"],
                                                         (" and are %s so far" % t["record"]["text"]) if t["record"]["gp"] else ""))
        s2 = bits[0][0].upper() + bits[0][1:] + "; " + bits[1] + "."
    o = ctx.get("odds") or {}
    ml = o.get("ml") or {}
    fa, fh = _fair(ml.get("away"), ml.get("home"))
    if fa:
        fav, pr = (h, fh) if fh >= fa else (a, fa)
        s2 += " %s has %s as the favorite at %s, about %.0f%% once the margin is removed%s." % (
            o.get("book") or "The book", the(fav), fg.american(ml.get("home" if fav is h else "away")), pr * 100,
            (", with the total at %s" % o["total"]["point"]) if (o.get("total") or {}).get("point") is not None else "")
    m = ctx.get("model") or {}
    if m.get("win"):
        mf = h if m["win"]["home"] >= m["win"]["away"] else a
        s2 += " The TMR NHL simulator also leans %s, at %.1f%%." % (the(mf), max(m["win"]["home"], m["win"]["away"]) * 100) \
            if fa and mf is fav else " The TMR NHL simulator has %s at %.1f%%." % (the(mf), max(m["win"]["home"], m["win"]["away"]) * 100)
    if s2:
        out.append(s2.strip())
    out.append("Below: both clubs broken down, the players and goalies who shape it, the numbers behind the matchup, "
               "the betting market and what the TMR model makes of it. Every figure comes from the data modules on this "
               "page, which refresh through the day.")
    return out


def why(ctx):
    sel = ctx.get("selection") or {}
    factors = {f["label"]: f for f in sel.get("factors") or []}
    a, h = ctx["away"], ctx["home"]
    if not factors:
        return []
    n = len(sel.get("board") or [])
    count = "both games" if n == 2 else "all %d games" % n
    still = " still to be played" if n < (sel.get("slate_games") or n) else ""
    out = [("We scored %s%s on the %s slate on team quality, stakes, rivalry, star power, the goalie matchup, betting "
            "interest and national TV, and this one came out on top with %.1f points." % (
                count, still, ctx["date_text"], sel.get("score") or 0))
           if n > 1 else "It's the only game on the %s schedule, and it gets the full treatment." % ctx["date_text"]]
    s = []
    if "Rivalry" in factors and ctx.get("rivalry"):
        s.append("It's %s, a rivalry that doesn't need a standings reason to get heated." % ctx["rivalry"])
    if "Division game" in factors:
        s.append("It's a %s Division game, so the points come straight out of a direct rival's column."
                 % a["standing"]["division"])
    elif "Conference game" in factors:
        conf = a["standing"]["conference"]
        s.append("It's %s %s Conference game, points taken straight from a club they'll be measured against all "
                 "season." % ("an" if conf[:1] in "AEIOU" else "a", conf))
    if "Original Six" in factors and "Rivalry" not in factors:
        s.append("It's two Original Six clubs.")
    lp = (ctx.get("leaders") or {}).get("points") or {}
    if "Star power" in factors and len(lp) == 2:
        s.append("It puts %s %s, who led %s with %s points in %s, on the ice against %s %s, who led %s with %s." % (
            lp["away"]["first"], lp["away"]["last"], the(a), lp["away"]["value"], ctx.get("leaders_season"),
            lp["home"]["first"], lp["home"]["last"], the(h), lp["home"]["value"]))
    if "Home opener" in factors:
        s.append("It's %s home opener." % poss(h))
    if "Betting interest" in factors and factors["Betting interest"]["points"] >= 3:
        s.append("And the market has it close enough that the price itself is part of the story.")
    if "Playoff race" in factors:
        s.append("The playoff race runs right through it: %s." % factors["Playoff race"]["detail"])
    if s:
        out.append(" ".join(s))
    return out


# ------------------------------------------------------------------ team breakdowns

STRENGTH_KEYS = (("gfpg", "goals per game"), ("gapg", "goals allowed"), ("sfpg", "shots per game"),
                 ("sapg", "shots allowed"), ("shpct", "shooting percentage"), ("svpct", "team save percentage"),
                 ("pp", "power play"), ("pk", "penalty kill"), ("fo", "faceoffs"),
                 ("cf", "five on five shot attempt share"), ("gf5", "five on five goal share"))


def _playoff_text(ctx, t):
    po = (t.get("prev") or {}).get("playoffs")
    if not po or not po.get("series"):
        return ""
    parts = []
    for s in po["series"]:
        if s["result"] == "won":
            parts.append("beat the %s %d games to %d" % (_common_of(ctx, s["opp"]), s["w"], s["l"]))
        elif s["result"] == "lost":
            parts.append("lost to the %s %d games to %d" % (_common_of(ctx, s["opp"]), s["l"], s["w"]))
    if not parts:
        return ""
    return " In the %d playoffs they %s." % (int(ctx["prev_label"][:4]) + 1, _join(parts))


def _common_of(ctx, abbr):
    full = _team_name(ctx, abbr)
    for t in (ctx["away"], ctx["home"]):
        if t["abbr"] == abbr:
            return t["common"]
    if abbr in MULTI_WORD:
        return MULTI_WORD[abbr]
    return full.split(" ")[-1] if full != abbr else abbr


MULTI_WORD = {"TOR": "Maple Leafs", "CBJ": "Blue Jackets", "DET": "Red Wings", "VGK": "Golden Knights"}


def team_record_para(ctx, side):
    t = ctx[side]
    rec, st = t["record"], t["standing"]
    s_row = ((ctx.get("stats") or {}).get(side)) or {}
    prev = t.get("prev")
    where = "at home" if side == "home" else "on the road"
    if rec["gp"] == 0 and prev:
        s = "%s open their %s season here, %s. They finished %s at %s with %d points" % (
            the(t, True), ctx["season_label"], where, prev["label"], prev["record"]["text"], prev["record"]["pts"])
        st_prev = s_row if not (ctx.get("stats") or {}).get("current") else {}
        if st_prev.get("ptpct") is not None:
            s += ", a %s points percentage that ranked %s in the league" % (
                ("%.3f" % st_prev["ptpct"]).lstrip("0"), _rk(st_prev, "ptpct"))
        s += ", going %s at home and %s on the road." % (prev["home"]["text"], prev["road"]["text"])
        s += _playoff_text(ctx, t)
        return s
    s = "%s are %s with %d %s" % (the(t, True), rec["text"], rec["pts"], "point" if rec["pts"] == 1 else "points")
    if rec["gp"] >= 5 and st.get("division_rank") and st.get("division"):
        s += ", %s in the %s Division" % (fg.ordinal(st["division_rank"]), st["division"])
        if st.get("conference_rank"):
            s += " and %s in the %s Conference" % (fg.ordinal(st["conference_rank"]), st["conference"])
    s += "."
    g5 = t.get("games5") or []
    if rec["gp"] <= 3 and g5:
        parts = ["%s the %s %s" % (_res_word(r), _common_of(ctx, r["opp"]), _score_text(r)) for r in g5]
        s += " So far they %s." % ", then ".join(parts)
    else:
        l10, sk = t.get("last10"), t.get("streak")
        if l10:
            s += " They're %s over their last %d, with %d goals for and %d against." % (
                l10["text"], l10["gp"], l10["gf"], l10["ga"])
        if sk and sk["n"] >= 3:
            kind = {"W": "won", "L": "lost", "OTL": "lost in overtime"}[sk["kind"]]
            s += " They've %s %d straight." % (kind, sk["n"])
        hr = t["home_rec"] if side == "home" else t["road_rec"]
        if hr["gp"] >= 3:
            s += " %s this season they're %s." % ("At home" if side == "home" else "On the road", hr["text"])
    if prev and rec["gp"] < 10:
        s += " Last season they finished %s." % prev["record"]["text"]
    return s


def team_offense_para(ctx, side):
    s = ctx.get("stats") or {}
    r = s.get(side)
    if not r or r.get("gfpg") is None:
        return None
    t = ctx[side]
    cur = s.get("current")
    out = "Offensively, %s scored %s goals a game %s%s on %s shots%s" % (
        the(t), fg.num(r["gfpg"]), _season_word(ctx, cur), _rkp(r, "gfpg"), fg.num(r["sfpg"], 1), _rkp(r, "sfpg"))
    if r.get("shpct"):
        out += ", converting %s of them%s" % (fg.pct(r["shpct"]), _rkp(r, "shpct"))
    out += "."
    if r.get("pp") is not None:
        out += " The power play ran at %s%s" % (fg.pct(r["pp"]), _rkp(r, "pp"))
        if r.get("ppo") is not None:
            out += " on %s chances a game%s" % (fg.num(r["ppo"], 2), _rkp(r, "ppo"))
        out += "."
    avg = s.get("avg") or {}
    if avg.get("gfpg") and r.get("gfpg"):
        diff = r["gfpg"] - avg["gfpg"]
        if abs(diff) >= 0.25:
            out += " That's %s goals a game %s the league average of %s." % (
                fg.num(abs(diff)), "above" if diff > 0 else "below", fg.num(avg["gfpg"]))
    return out


def team_defense_para(ctx, side):
    s = ctx.get("stats") or {}
    r = s.get(side)
    if not r or r.get("gapg") is None:
        return None
    out = "Without the puck they allowed %s goals a game%s and %s shots%s, with a team save percentage of %s%s." % (
        fg.num(r["gapg"]), _rkp(r, "gapg"), fg.num(r["sapg"], 1), _rkp(r, "sapg"), fg.svpct(r.get("svpct")),
        _rkp(r, "svpct"))
    if r.get("pk") is not None:
        out += " The penalty kill worked at %s%s" % (fg.pct(r["pk"]), _rkp(r, "pk"))
        if r.get("tsh") is not None:
            out += ", shorthanded %s times a game%s" % (fg.num(r["tsh"], 2), _rkp(r, "tsh"))
        out += "."
    if r.get("sapg") and r.get("gapg") and r.get("svpct"):
        rs, rg = r["rank"].get("sapg"), r["rank"].get("svpct")
        if rs and rg and rs <= 10 and rg >= 20:
            out += (" Few teams allowed fewer shots, so the goals against came from the save percentage, which "
                    "puts more weight on who starts in goal.")
        elif rs and rg and rs >= 20 and rg <= 10:
            out += " Their goaltending covered for a lot of shots against."
    return out


def team_goalie_line(ctx, side):
    gl = (ctx.get("goalies") or {}).get(side) or {}
    t = ctx[side]
    prof = gl.get("profile") or {}
    if gl.get("status") in ("confirmed", "expected") and prof.get("name"):
        return "In goal, %s is %s to start%s." % (
            prof["name"], "confirmed" if gl["status"] == "confirmed" else "expected",
            (" (%s)" % gl["source"]) if gl.get("source") else "")
    roster = [p for p in gl.get("roster") or [] if p.get("name")]
    if not roster:
        return None
    lines = []
    for p in roster:
        ln = p.get("current") if (p.get("current") or {}).get("gp", 0) >= 3 else p.get("last_season")
        lbl = p.get("current_label") if ln is p.get("current") else p.get("last_label")
        if ln and ln.get("gp"):
            lines.append((ln["gp"], p["name"], ln, lbl))
    lines.sort(key=lambda x: -x[0])
    s = "%s haven't named a starter yet." % the(t, True)
    if lines:
        gp, nm, ln, lbl = lines[0]
        s += " %s carried the biggest load of the goalies on the roster in %s, %s games with a %s save percentage" % (
            nm, lbl, gp, fg.svpct(ln.get("sv")))
        if len(lines) > 1:
            gp2, nm2, ln2, lbl2 = lines[1]
            s += ", ahead of %s (%d games, %s)" % (nm2, gp2, fg.svpct(ln2.get("sv")))
        s += "."
    return s


def team_injury_line(ctx, side):
    inj = (ctx.get("injuries") or {}).get(side) or []
    t = ctx[side]
    out = [r for r in inj if r.get("status") in ("Out", "Injured Reserve", "Long Term Injured Reserve")]
    dtd = [r for r in inj if r.get("status") == "Day-To-Day"]
    if not out and not dtd:
        return None
    s = the(t, True)
    if out:
        named = ["%s (%s)" % (r["name"], (r.get("type") or r["status"]).lower()) for r in out[:4]]
        s += " are without %s" % _join(named)
        if len(out) > 4:
            s += ", with %d more on the injury report" % (len(out) - 4)
    if dtd:
        s += "%s %s listed day to day" % (" and have" if out else " have", _join([r["name"] for r in dtd[:3]]))
    return s + "."


def team_profile_line(ctx, side):
    r = ((ctx.get("stats") or {}).get(side)) or {}
    rk = r.get("rank") or {}
    good = [lbl for k, lbl in STRENGTH_KEYS if rk.get(k) and rk[k] <= 8]
    bad = [lbl for k, lbl in STRENGTH_KEYS if rk.get(k) and rk[k] >= 25]
    if not good and not bad:
        return None
    t = ctx[side]
    when = _in(ctx, (ctx.get("stats") or {}).get("current"))
    parts = []
    if good:
        parts.append("top eight in the league in %s" % _join(good[:4]))
    if bad:
        parts.append("bottom eight in %s" % _join(bad[:3]))
    s = "The profile%s: %s were %s." % (when, the(t), "; ".join(parts))
    return s


def team_breakdown(ctx, side):
    return [p for p in (team_record_para(ctx, side),
                        " ".join(x for x in (team_offense_para(ctx, side), team_defense_para(ctx, side)) if x) or None,
                        team_goalie_short(ctx, side), team_injury_line(ctx, side), team_profile_line(ctx, side)) if p]


def team_goalie_short(ctx, side):
    gl = (ctx.get("goalies") or {}).get(side) or {}
    prof = gl.get("profile") or {}
    if gl.get("status") in ("confirmed", "expected") and prof.get("name"):
        line, when = _gline(prof)
        s = "%s gets the net, %s." % (prof["name"], "confirmed" if gl["status"] == "confirmed" else "as the expected starter")
        if line:
            s += " He saved %s over %d games %s." % (fg.svpct(line["sv"]), line["gp"], when)
        return s
    n = len([p for p in gl.get("roster") or [] if p.get("name")])
    if not n:
        return None
    other = (ctx.get("goalies") or {}).get("home" if side == "away" else "away") or {}
    if side == "home" and other.get("status") == "unknown":
        return "No starter is reported here either, with %s goalies on the roster." % _num_word(n)
    return "The crease is still open: %s goalies on the roster and no starter reported yet." % _num_word(n)


# ------------------------------------------------------------------ players

POS = {"C": "center", "L": "left wing", "R": "right wing", "D": "defenseman"}


def _last5_text(p, ctx):
    rows = [r for r in p.get("last5") or [] if r.get("date")]
    if len(rows) < 3:
        return ""
    pts = sum(r.get("pts") or 0 for r in rows)
    g = sum(r.get("goals") or r.get("g") or 0 for r in rows)
    shots = sum(r.get("shots") or 0 for r in rows)
    po = [r for r in rows if r.get("playoff")]
    when = ("all in the %s playoffs" % rows[0]["date"][:4]) if len(po) == len(rows) else \
        ("including %d playoff %s" % (len(po), "game" if len(po) == 1 else "games")) if po else \
        "from %s to %s" % (_short_date(rows[-1]["date"]), _short_date(rows[0]["date"]))
    return " His last %d games, %s, produced %d %s (%d %s) on %d shots." % (
        len(rows), when, pts, "point" if pts == 1 else "points", g, "goal" if g == 1 else "goals", shots)


def player_para(ctx, side, p):
    t = ctx[side]
    ln = p.get("season") or {}
    if not ln.get("gp"):
        return None
    pos = POS.get(p.get("pos"), "")
    s = "%s (%s%s) had %d points for %s in %s: %d goals and %d assists in %d games" % (
        p["name"], pos, (", No. %s" % p["num"]) if p.get("num") else "", ln.get("pts") or 0, the(t),
        p.get("season_label") or "", ln.get("g") or 0, ln.get("a") or 0, ln["gp"])
    extra = []
    if ln.get("ppp"):
        extra.append("%d of the points on the power play" % ln["ppp"])
    elif ln.get("ppg"):
        extra.append("%d power play %s" % (ln["ppg"], "goal" if ln["ppg"] == 1 else "goals"))
    if ln.get("shpct") and ln.get("shots"):
        extra.append("a %s shooting rate on %d shots" % (fg.pct(ln["shpct"]), ln["shots"]))
    if ln.get("toi"):
        extra.append("%s of ice time a night" % ln["toi"])
    if extra:
        s += ", with %s" % _join(extra)
    s += "."
    cur = p.get("current") or {}
    if cur.get("gp") and p.get("current_label") != p.get("season_label"):
        s += " Through %d %s of %s he has %d goals and %d assists." % (
            cur["gp"], "game" if cur["gp"] == 1 else "games", p["current_label"], cur.get("g") or 0, cur.get("a") or 0)
    s += _last5_text(p, ctx)
    car = p.get("career") or {}
    if car.get("gp") and car["gp"] >= 300:
        s += " Over his career that's %s points in %s regular season games." % (
            "{:,}".format(car.get("pts") or 0), "{:,}".format(car["gp"]))
    inj = {r["name"]: r for r in (ctx.get("injuries") or {}).get(side) or []}
    if p["name"] in inj:
        s += " He is listed as %s on the injury report." % inj[p["name"]].get("status", "").lower().replace("-", " ")
    return s


def players(ctx):
    kp = ctx.get("key_players") or {}
    paras = []
    for side in ("away", "home"):
        for p in kp.get(side) or []:
            para = player_para(ctx, side, p)
            if para:
                paras.append(para)
    if not paras:
        # fall back to the game center's leaders when the player feed is down
        lead = ctx.get("leaders") or {}
        pts = lead.get("points") or {}
        for side in ("away", "home"):
            p = pts.get(side)
            if p:
                paras.append("%s %s led %s with %s points in %s." % (p["first"], p["last"], the(ctx[side]), p["value"],
                                                                      ctx.get("leaders_season")))
    return paras


# ------------------------------------------------------------------ goalies

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
            s += " %s in %s he saved %s." % ("On the road" if side == "away" else "At home", prof.get("split_label"),
                                          fg.svpct(split["sv"]))
        vs = prof.get("vs")
        if vs and vs["gp"] >= 2:
            s += " He's %s against %s since the start of %s, with a %s save percentage in %d games." % (
                vs["record"], the(opp), prof["vs_span"].split(" through ")[0], fg.svpct(vs["sv"]), vs["gp"])
        rec = [r for r in prof.get("recent") or [] if r.get("sv") is not None and r.get("sa")]
        if len(rec) >= 3:
            sv = sum(r["sa"] - r["ga"] for r in rec) / float(max(1, sum(r["sa"] for r in rec)))
            s += " Over his last %d appearances he stopped %s of the shots he faced." % (len(rec), fg.svpct(sv))
        car = prof.get("career") or {}
        if car.get("gp") and car["gp"] >= 100:
            s += " For his career: %s games, a %s save percentage." % (car["gp"], fg.svpct(car.get("sv")))
        paras.append(s)
    unknown = [(side, t) for side, t in (("away", a), ("home", h)) if (gl.get(side) or {}).get("status") == "unknown"]
    for side, t in unknown:
        line = team_goalie_line(ctx, side)
        if line:
            paras.append(line)
    if unknown:
        paras.append("The goalie cards update through the day and switch the moment a starter is reported.")
    if len(named) == 2:
        la, _ = _gline(named[0])
        lh, _ = _gline(named[1])
        if la and lh and la.get("sv") and lh.get("sv"):
            gap = abs(la["sv"] - lh["sv"]) * 1000
            if gap >= 8:
                better = named[0] if la["sv"] > lh["sv"] else named[1]
                paras.append("That's a real gap in the crease: %s's save percentage sits about %d points higher, and "
                             "over 30 shots that works out to roughly %.1f goals a night." % (
                                 better["name"], round(gap), gap * 30 / 1000.0))
            else:
                paras.append("On paper the crease is close to even, the two save percentages within %d points of each "
                             "other, so the skaters in front of them are more likely to decide it." % max(1, round(gap)))
    return paras


# ------------------------------------------------------------------ advanced

def advanced(ctx):
    s = ctx.get("stats") or {}
    ra, rh = s.get("away") or {}, s.get("home") or {}
    a, h = ctx["away"], ctx["home"]
    if ra.get("cf") is None or rh.get("cf") is None:
        return []
    when = "this season" if s.get("current") else "in %s" % ctx["prev_label"]
    paras = []
    p = "At five on five %s, %s took %s of the shot attempts (Corsi%s) and %s took %s%s." % (
        when, the(a), fg.pct(ra["cf"]), (", %s in the NHL" % _rk(ra, "cf")) if _rk(ra, "cf") else "",
        the(h), fg.pct(rh["cf"]), _rkp(rh, "cf"))
    if ra.get("ff") is not None and rh.get("ff") is not None:
        p += " Counting only unblocked attempts (Fenwick) it was %s to %s." % (fg.pct(ra["ff"]), fg.pct(rh["ff"]))
    if ra.get("cf_close") is not None and rh.get("cf_close") is not None:
        p += " With the score close, where teams play straight up, the split was %s to %s." % (
            fg.pct(ra["cf_close"]), fg.pct(rh["cf_close"]))
    paras.append(p)
    if ra.get("gf5") is not None and rh.get("gf5") is not None:
        bits = []
        for t, r in ((a, ra), (h, rh)):
            gap = (r["gf5"] - r["cf"]) * 100
            if gap >= 1.5:
                bits.append("%s outscored their shot share by %.1f points" % (the(t), gap))
            elif gap <= -1.5:
                bits.append("%s scored %.1f points below their shot share" % (the(t), -gap))
        p = "The goals followed a different split: %s took %s of five on five goals and %s %s." % (
            the(a), fg.pct(ra["gf5"]), the(h), fg.pct(rh["gf5"]))
        if bits:
            p += " " + _join(bits)[0].upper() + _join(bits)[1:] + "."
        if ra.get("pdo") and rh.get("pdo"):
            p += " PDO, shooting percentage plus save percentage at five on five, explains most of that: %s ran at %s (%s shooting, %s saves) and %s at %s (%s, %s)." % (
                the(a), fg.num(ra["pdo"], 3), fg.pct(ra.get("sh5")), fg.svpct(ra.get("sv5")),
                the(h), fg.num(rh["pdo"], 3), fg.pct(rh.get("sh5")), fg.svpct(rh.get("sv5")))
            hi = [t for t, r in ((a, ra), (h, rh)) if r["pdo"] >= 1.010]
            lo = [t for t, r in ((a, ra), (h, rh)) if r["pdo"] <= 0.990]
            if hi:
                p += " A PDO above 1.010 is hard to hold, so %s results leaned on percentages that usually drift back toward 1.000." % _join([poss(t) for t in hi])
            if lo:
                p += " A PDO under .990 usually says a club was unlucky, which points to better results ahead for %s." % _join([the(t) for t in lo])
        paras.append(p)
    phys = []
    if ra.get("hits60") is not None and rh.get("hits60") is not None:
        big = a if ra["hits60"] > rh["hits60"] else h
        phys.append("%s were the heavier side, %s hits per 60 minutes to %s" % (
            the(big, True), fg.num(max(ra["hits60"], rh["hits60"]), 1), fg.num(min(ra["hits60"], rh["hits60"]), 1)))
    if ra.get("blk60") is not None and rh.get("blk60") is not None:
        phys.append("%s blocked %s shots per 60 to %s for %s" % (
            the(a), fg.num(ra["blk60"], 1), fg.num(rh["blk60"], 1), the(h)))
    if ra.get("tk60") is not None and rh.get("gv60") is not None and ra.get("gv60") is not None and rh.get("tk60") is not None:
        phys.append("in puck management %s had %s takeaways and %s giveaways per 60, %s %s and %s" % (
            the(a), fg.num(ra["tk60"], 1), fg.num(ra["gv60"], 1), the(h), fg.num(rh["tk60"], 1), fg.num(rh["gv60"], 1)))
    if phys:
        txt = "; ".join(phys) + "."
        paras.append(txt[0].upper() + txt[1:])
    if ra.get("zs") is not None and rh.get("zs") is not None and abs(ra["zs"] - rh["zs"]) >= 0.02:
        more = a if ra["zs"] > rh["zs"] else h
        paras.append("Deployment tilted too: %s started %s of their five on five shifts in the offensive zone, against %s for %s." % (
            the(more), fg.pct(max(ra["zs"], rh["zs"])), fg.pct(min(ra["zs"], rh["zs"])), the(h if more is a else a)))
    return paras


# ------------------------------------------------------------------ form and schedule

def form(ctx):
    paras = []
    a, h = ctx["away"], ctx["home"]
    if not a["record"]["gp"] and not h["record"]["gp"]:
        bits = []
        for t in (a, h):
            pv = t.get("prev") or {}
            l10, l5, sk = pv.get("last10"), pv.get("last5"), pv.get("streak")
            if l10 and l10["gp"]:
                s = "%s finished %s %s over their last %d regular season games and %s over the final five" % (
                    the(t, True), pv["label"], l10["text"], l10["gp"], l5["text"] if l5 else "")
                if sk and sk["n"] >= 3:
                    s += ", ending on %s %d game %s" % ("a" if sk["kind"] != "OTL" else "an",
                                                      sk["n"], {"W": "winning streak", "L": "losing streak",
                                                                "OTL": "run of overtime losses"}[sk["kind"]])
                bits.append(s + ".")
        if bits:
            paras.append("Neither club has played a %s game yet, so recent form means the end of last season. %s" % (
                ctx["season_label"], " ".join(bits)))
    else:
        for side in ("away", "home"):
            t = ctx[side]
            if t["record"]["gp"] < 3:
                pv = t.get("prev") or {}
                l10 = pv.get("last10")
                if not l10 or not l10["gp"]:
                    continue
                s = "%s closed %s %s over their final %d regular season games." % (
                    the(t, True), pv["label"], l10["text"], l10["gp"])
                g5 = t.get("games5") or []
                if g5:
                    s += " This season they've played %s: %s." % (
                        _num_word(len(g5)), ", then ".join("%s the %s %s" % (_res_word(r), _common_of(ctx, r["opp"]),
                                                                              _score_text(r)) for r in g5))
                else:
                    s += " They haven't played a %s game yet." % ctx["season_label"]
                paras.append(s)
                continue
            l5, l10, sk = t.get("last5"), t.get("last10"), t.get("streak")
            s = "%s are %s over their last %d%s" % (the(t, True), l5["text"], l5["gp"],
                                                   (" and %s over their last %d" % (l10["text"], l10["gp"])) if l10 and l10["gp"] > l5["gp"] else "")
            s += ", averaging %.1f goals for and %.1f against in the last %d." % (
                l5["gf"] / float(l5["gp"]), l5["ga"] / float(l5["gp"]), l5["gp"])
            if sk and sk["n"] >= 2:
                s += " They come in on %s." % {"W": "a %d game winning streak", "L": "a %d game losing streak",
                                               "OTL": "%d straight overtime losses"}[sk["kind"]] % sk["n"]
            paras.append(s)
    rest = []
    for t in (a, h):
        r = t.get("rest") or {}
        if r.get("b2b"):
            last = r.get("last") or {}
            rest.append("%s played last night (%s the %s, %s), so this is the second half of a back to back" % (
                the(t, True), "a win over" if last.get("res") == "W" else "a loss to", _common_of(ctx, last.get("opp")),
                _score_text(last)) if last else "%s are on the second half of a back to back" % the(t, True))
        elif r.get("days") is not None:
            rest.append("%s have had %d %s off" % (the(t, True), r["days"], "day" if r["days"] == 1 else "days"))
    if rest:
        paras.append("On the schedule, " + "; ".join([rest[0][0].lower() + rest[0][1:]] + [x[0].lower() + x[1:] for x in rest[1:]]) + ".")
    return paras


# ------------------------------------------------------------------ head to head

def h2h(ctx):
    hh = ctx.get("h2h") or []
    if not hh:
        return []
    a, h = ctx["away"], ctx["home"]
    wins = sum(1 for r in hh if r["winner"] == a["abbr"])
    extra = sum(1 for r in hh if r.get("ended") in ("OT", "SO"))
    one = sum(1 for r in hh if abs(r["a_goals"] - r["h_goals"]) == 1)
    avg = sum(r["total"] for r in hh) / float(len(hh))
    po = [r for r in hh if r.get("playoff")]
    s = "%s have won %d of the last %d meetings since the start of %s, with %s taking %d." % (
        the(a, True), wins, len(hh), hh[-1]["season"], the(h), len(hh) - wins)
    if one or extra:
        s += " %s of those games %s decided by one goal, %s needed overtime or a shootout, and they averaged %.1f total goals." % (
            _num_word(one).capitalize(), "was" if one == 1 else "were", _num_word(extra) if extra else "none", avg)
    else:
        s += " None of them was decided by one goal, and they averaged %.1f total goals." % avg
    paras = [s]
    last = hh[0]
    win = a if last["winner"] == a["abbr"] else h
    wg, lg = (last["a_goals"], last["h_goals"]) if win is a else (last["h_goals"], last["a_goals"])
    s2 = "The most recent meeting, on %s%s, went to %s %d-%d%s." % (
        _date(last["date"]), " in the playoffs" if last.get("playoff") else "", the(win), wg, lg,
        {"OT": " in overtime", "SO": " in a shootout"}.get(last.get("ended"), ""))
    if po:
        pw = sum(1 for r in po if r["winner"] == a["abbr"])
        yrs = sorted({r["date"][:4] for r in po})
        s2 += " %s came in the %s playoffs, where %s went %d-%d." % (
            ("All %s" % _num_word(len(hh))) if len(po) == len(hh) else _num_word(len(po)).capitalize(),
            " and ".join(yrs), the(a), pw, len(po) - pw)
    paras.append(s2)
    return paras


# ------------------------------------------------------------------ market

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
    fair_a, fair_h = _fair(ml.get("away"), ml.get("home")) if ml else (None, None)
    if ml:
        s = "%s has %s at %s and %s at %s on the moneyline." % (
            o.get("book") or "The book", the(a), fg.american(ml.get("away")), the(h), fg.american(ml.get("home")))
        if fair_h:
            fav = h if fair_h >= 0.5 else a
            s += " Take out the margin and that makes %s a %.1f%% favorite, %s %.1f%%." % (
                the(fav), (fair_h if fav is h else fair_a) * 100, the(a if fav is h else h),
                (fair_a if fav is h else fair_h) * 100)
            ia, ih = fg.implied(ml.get("away")), fg.implied(ml.get("home"))
            s += " The book's margin on the pair is %.1f%%." % ((ia + ih - 1) * 100)
        paras.append(s)
    if pl:
        fa, fh = _fair(pl["away"]["price"], pl["home"]["price"])
        s = "On the puck line it's %s %s at %s and %s %s at %s." % (
            the(a), _pl(pl["away"]["point"]), fg.american(pl["away"]["price"]),
            the(h), _pl(pl["home"]["point"]), fg.american(pl["home"]["price"]))
        if fa:
            fav_side = "home" if float(pl["home"]["point"]) < 0 else "away"
            ft = h if fav_side == "home" else a
            s += " That prices %s winning by two or more at about %.0f%% once the margin comes out." % (
                the(ft), (fh if fav_side == "home" else fa) * 100)
        paras.append(s)
    if tot:
        fo, fu = _fair(tot.get("over"), tot.get("under"))
        s = "The total sits at %s, over %s and under %s." % (
            tot.get("point"), fg.american(tot.get("over")), fg.american(tot.get("under")))
        if fo:
            s += " Without the margin that's %.1f%% over, %.1f%% under." % (fo * 100, fu * 100)
        paras.append(s)
    lt = ctx.get("line_track") or {}
    f, l = lt.get("first"), lt.get("last")
    if f and l and f.get("at") != l.get("at"):
        moves = []
        for side, t in (("home", h), ("away", a)):
            if (f.get("ml") or {}).get(side) is not None and (l.get("ml") or {}).get(side) is not None \
                    and f["ml"][side] != l["ml"][side]:
                moves.append("%s moneyline has moved from %s to %s" % (poss(t), fg.american(f["ml"][side]),
                                                                        fg.american(l["ml"][side])))
                break
        if (f.get("total") or {}).get("point") is not None and (l.get("total") or {}).get("point") is not None \
                and f["total"]["point"] != l["total"]["point"]:
            moves.append("the total has gone from %s to %s" % (f["total"]["point"], l["total"]["point"]))
        if moves:
            paras.append("Since the TMR board first posted this game on %s, %s." % (
                fg.pacific_stamp(fg.parse_utc(f["at"])), _join(moves)))
        elif ml:
            paras.append("The price hasn't moved since the TMR board first posted it on %s." %
                         fg.pacific_stamp(fg.parse_utc(f["at"])))
    return paras


def key_trends(ctx):
    tr = ctx.get("trends") or []
    if not tr:
        return []
    return ["Each of these is calculated from the results and prices on this page:"]


# ------------------------------------------------------------------ keys and model

def keys(ctx):
    a, h = ctx["away"], ctx["home"]
    s = ctx.get("stats") or {}
    out = []
    when = _in(ctx, s.get("current"))
    if s:
        ra, rh = s["away"], s["home"]
        if None not in (ra.get("pp"), rh.get("pp"), ra.get("pk"), rh.get("pk")):
            na, nh = ra["pp"] + ra["pk"], rh["pp"] + rh["pk"]
            better = a if na > nh else h
            if abs(na - nh) < 0.03:
                out.append("Special teams. The two clubs' power play and penalty kill add up within %.1f points of each "
                           "other%s, so neither side should expect to win the game on the man advantage alone." % (
                               abs(na - nh) * 100, when))
            else:
                out.append("Special teams. %s power play and penalty kill percentages add up to %.1f%s against %.1f for %s, "
                       "so a game with a lot of penalties leans their way." % (
                           poss(better, True), (na if better is a else nh) * 100, when, (nh if better is a else na) * 100,
                           the(h if better is a else a)))
        if ra.get("cf") is not None and rh.get("cf") is not None and abs(ra["cf"] - rh["cf"]) >= 0.015:
            tilt = a if ra["cf"] > rh["cf"] else h
            out.append("Territory. %s owned more of the five on five shot attempts%s (%s to %s). If that holds, the "
                       "other side needs its goaltender to steal it." % (
                           the(tilt, True), when, fg.pct(max(ra["cf"], rh["cf"])), fg.pct(min(ra["cf"], rh["cf"]))))
        elif ra.get("sdpg") is not None and rh.get("sdpg") is not None:
            tilt = a if ra["sdpg"] > rh["sdpg"] else h
            out.append("Shot share. %s had the better shot differential%s, %+.1f a game against %+.1f." % (
                the(tilt, True), when, max(ra["sdpg"], rh["sdpg"]), min(ra["sdpg"], rh["sdpg"])))
    gl = ctx.get("goalies") or {}
    named = [((gl.get(x) or {}).get("profile") or {}).get("name") for x in ("away", "home")
             if (gl.get(x) or {}).get("status") in ("confirmed", "expected")]
    if len(named) == 2 and all(named):
        out.append("The crease. %s against %s is the matchup inside the matchup." % tuple(named))
    elif not named:
        heavy = []
        for side in ("away", "home"):
            best = None
            for p in (gl.get(side) or {}).get("roster") or []:
                ln = p.get("last_season") or {}
                if ln.get("gp") and (best is None or ln["gp"] > best[1]["gp"]):
                    best = (p, ln)
            if best:
                heavy.append("%s saved %s in %d games for %s" % (best[0]["name"], fg.svpct(best[1]["sv"]), best[1]["gp"],
                                                                 the(ctx[side])))
        out.append("The starters. Neither goalie is named yet.%s" % (
            (" The heaviest workloads on the two rosters last season: %s." % _join(heavy)) if len(heavy) == 2 else ""))
    else:
        out.append("The other crease. %s is named; the other club's starter is still to come, and the goalie cards "
                   "update when it is." % named[0])
    kp = ctx.get("key_players") or {}
    if kp.get("away") and kp.get("home"):
        pa, ph = kp["away"][0], kp["home"][0]
        la, lh = pa.get("season") or {}, ph.get("season") or {}
        if la.get("pts") is not None and lh.get("pts") is not None:
            s_ = "The stars. %s (%d points) and %s (%d) led their clubs%s" % (
                pa["name"], la["pts"], ph["name"], lh["pts"], (" in %s" % pa["season_label"]) if pa.get("season_label") else "")
            if la.get("ppp") is not None and lh.get("ppp") is not None:
                s_ += ", with %d and %d of those points on the power play, so the penalty count shapes their night too" % (
                    la["ppp"], lh["ppp"])
            out.append(s_ + ".")
    for t in (a, h):
        if (t.get("rest") or {}).get("b2b"):
            out.append("Legs. %s are playing their second game in two nights." % the(t, True))
    return out[:5]


def model_lean(ctx):
    m = ctx.get("model") or {}
    if not m.get("win") or not m.get("score"):
        return []
    a, h = ctx["away"], ctx["home"]
    paras = []
    fav = h if m["win"]["home"] >= m["win"]["away"] else a
    s = ("Model output, not data: the TMR NHL simulator played this game %s times. Its average score is %s %s, %s %s, "
         "with %s winning %.1f%% of the simulations and %.1f%% of games going past regulation." % (
             "{:,}".format(m.get("sims") or 10000), a["common"], fg.num(m["score"].get("away"), 1), h["common"],
             fg.num(m["score"].get("home"), 1), the(fav), max(m["win"]["home"], m["win"]["away"]) * 100,
             (m.get("ot") or 0) * 100))
    if m.get("stats_season") and m["stats_season"] != ctx["season_label"]:
        s += " Its team ratings come from %s stats." % m["stats_season"]
    paras.append(s)
    o = ctx.get("odds") or {}
    ml = o.get("ml") or {}
    fa, fh = _fair(ml.get("away"), ml.get("home"))
    leans = []
    if fh is not None:
        diff = (m["win"]["home"] - fh) * 100
        if abs(diff) >= 3:
            side = h if diff > 0 else a
            leans.append("Moneyline lean: %s. The model has them %.1f points above the %.1f%% the price implies." % (
                the(side), abs(diff), (fh if side is h else fa) * 100))
        else:
            leans.append("Moneyline: no lean. The model lands within %.1f points of the market's %.1f%% for %s." % (
                abs(diff), max(fh, fa) * 100, the(h if fh >= fa else a)))
    pl = o.get("pl") or {}
    mp = m.get("puckline") or {}
    if pl and mp.get("home_minus_1_5") is not None:
        fav_side = "home" if float(pl["home"]["point"]) < 0 else "away"
        pfa, pfh = _fair(pl["away"]["price"], pl["home"]["price"])
        if pfa:
            mkt = pfh if fav_side == "home" else pfa
            mod = mp["home_minus_1_5"] if fav_side == "home" else mp.get("away_minus_1_5")
            if mod is not None:
                ft = h if fav_side == "home" else a
                diff = (mod - mkt) * 100
                leans.append("Puck line: the model has %s winning by two or more %.1f%% of the time against %.1f%% in the "
                             "price, %s." % (the(ft), mod * 100, mkt * 100,
                                             "a lean to %s -1.5" % the(ft) if diff >= 3 else
                                             "a lean to %s +1.5" % the(h if ft is a else a) if diff <= -3 else "no lean"))
    tot = o.get("total") or {}
    mt = m.get("total") or {}
    if tot.get("point") is not None and mt.get("mean") is not None:
        gap = mt["mean"] - float(tot["point"])
        leans.append("Total: the model averages %s goals with a median of %s, against a posted %s, %s." % (
            fg.num(mt["mean"], 1), mt.get("p50"), tot["point"],
            "a lean to the over" if gap >= 0.4 else "a lean to the under" if gap <= -0.4 else "no lean"))
    paras += leans
    if leans:
        paras.append("These leans come from the simulator alone. They are not a pick from TrustMyRecord and not betting advice.")
    return paras


# ------------------------------------------------------------------ FAQ

def faq(ctx):
    a, h = ctx["away"], ctx["home"]
    vs = "%s vs. %s" % (a["common"], h["common"])
    out = [("What time is %s?" % vs,
            "Puck drop is %s ET (%s PT) on %s." % (ctx["et_time"], ctx["pt_time"], ctx["long_date"]))]
    if ctx.get("venue"):
        loc = ", ".join(x for x in (ctx.get("city"), ctx.get("region")) if x)
        out.append(("Where is %s being played?" % vs, "At %s%s, home of the %s." % (
            ctx["venue"], (" in %s" % loc) if loc else "", h["name"])))
    nets = _tv(ctx)
    regional = []
    for b in ctx.get("tv") or []:
        if b.get("market") in ("A", "H") and b.get("net") and b["net"] not in regional:
            regional.append(b["net"])
    if nets or regional:
        ans = ("Nationally on %s." % _join(nets)) if nets else ""
        if regional:
            ans += (" " if ans else "") + "Regional broadcasts: %s." % _join(regional)
        out.append(("What channel is %s on?" % vs, ans))
    o = ctx.get("odds") or {}
    ml = o.get("ml") or {}
    if ml:
        stamp = fg.pacific_stamp(fg.parse_utc(ctx["odds_checked"])) if ctx.get("odds_checked") else None
        ans = "%s has %s %s and %s %s%s." % (o.get("book") or "The book", the(a), fg.american(ml["away"]),
                                             the(h), fg.american(ml["home"]),
                                             (" as of %s" % stamp) if stamp else "")
        if (o.get("total") or {}).get("point") is not None:
            ans += " The total is %s." % o["total"]["point"]
        out.append(("What is the %s moneyline?" % vs, ans))
    gl = ctx.get("goalies") or {}
    gparts = []
    for side, t in (("away", a), ("home", h)):
        g = gl.get(side) or {}
        prof = g.get("profile") or {}
        if g.get("status") in ("confirmed", "expected") and prof.get("name"):
            gparts.append("%s %s for %s" % (prof["name"], "is confirmed" if g["status"] == "confirmed" else "is expected to start",
                                          the(t)))
        else:
            gparts.append("%s have not announced a starter" % the(t))
    if all((gl.get(x) or {}).get("status") not in ("confirmed", "expected") for x in ("away", "home")):
        gparts = ["neither club has announced a starter yet"]
    if gparts:
        out.append(("Who is starting in goal for %s?" % vs, (_join(gparts) + ".")[0].upper() + (_join(gparts) + ".")[1:]
                    + " This updates through the day."))
    m = ctx.get("model") or {}
    if m.get("win") and m.get("score"):
        fav = h if m["win"]["home"] >= m["win"]["away"] else a
        out.append(("What is the %s prediction?" % vs,
                    "The TMR NHL simulator has %s winning %.1f%% of %s simulations, with an average score of %s %s, %s %s. "
                    "That's a model projection, not a pick." % (
                        the(fav), max(m["win"]["home"], m["win"]["away"]) * 100, "{:,}".format(m.get("sims") or 10000),
                        a["common"], fg.num(m["score"]["away"], 1), h["common"], fg.num(m["score"]["home"], 1))))
    hh = ctx.get("h2h") or []
    if hh:
        last = hh[0]
        win = a if last["winner"] == a["abbr"] else h
        wg, lg = (last["a_goals"], last["h_goals"]) if win is a else (last["h_goals"], last["a_goals"])
        out.append(("When did the %s and %s last play?" % (a["common"], h["common"]),
                    "On %s, when %s won %d-%d%s%s." % (_date(last["date"]), the(win), wg, lg,
                                                       {"OT": " in overtime", "SO": " in a shootout"}.get(last.get("ended"), ""),
                                                       " in the playoffs" if last.get("playoff") else "")))
    return [(q, fg.undash(ans)) for q, ans in out]


# ------------------------------------------------------------------ build

SECTIONS = (
    ("intro", None, intro),
    ("why", "Why this is the featured game", why),
    ("team_away", None, lambda c: team_breakdown(c, "away")),
    ("team_home", None, lambda c: team_breakdown(c, "home")),
    ("players", "Key players to watch", players),
    ("goalies", "Goaltender matchup", goaltending),
    ("advanced", "Advanced stats", advanced),
    ("form", "Recent form", form),
    ("h2h", "Head to head", h2h),
    ("market", "The betting market", market),
    ("trends", "Betting trends", key_trends),
    ("keys", "Matchup keys", keys),
    ("model", "Prediction and model lean", model_lean),
)


def build(ctx):
    sections = {}
    order = []
    for key, h2, fn in SECTIONS:
        if key == "team_away":
            h2 = "%s breakdown" % ctx["away"]["name"]
        elif key == "team_home":
            h2 = "%s breakdown" % ctx["home"]["name"]
        try:
            paras = [fg.undash(p) for p in fn(ctx) if p]
        except (KeyError, TypeError, ValueError, ZeroDivisionError, IndexError) as exc:
            print("  article section %r skipped: %s" % (key, exc))
            paras = []
        if paras:
            sections[key] = {"h2": h2, "paras": paras, "list": key == "keys"}
            order.append(key)
    try:
        qa = faq(ctx)
    except (KeyError, TypeError, ValueError, ZeroDivisionError, IndexError) as exc:
        print("  faq skipped: %s" % exc)
        qa = []
    words = sum(len(p.split()) for s in sections.values() for p in s["paras"])
    words += sum(len(q.split()) + len(a.split()) for q, a in qa)
    return {"headline": headline(ctx), "title": title(ctx), "description": description(ctx),
            "sections": sections, "order": order, "faq": qa, "words": words}
