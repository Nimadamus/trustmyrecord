#!/usr/bin/env python3
"""Assembles one handicapping matchup page out of the components in
handicap_ui.py and the feeds in handicap_enrich.py.

HANDICAP_REDESIGN_20260909.

This is the sport-aware layer, and the only place a sport's own modules are
decided. Everything it produces is composed of the same components, so the NFL
page, the NBA page and a future tennis page are recognisably one product.

  every sport   hero, market board, comparison, form, series dial, betting
                trends, storylines, provenance
  NFL           quarterback duel, TrustMyRecord simulation, skill-player
                features, status notes
  MLB           the pitching duel and park/weather slot the duel and comparison
                components already accept (the MLB pages have their own builder
                today; this is where they land when they move across)
  NBA / NHL     star duel and pace/rating comparison off the same components

WHAT IT WILL NOT DO
Invent a module for a sport whose feeds cannot fill it. If the simulation is not
available the model section does not render; if a club's season has not started
the comparison says which season it is reading and does not pretend it is this
one. Every sentence in the storyline cards is generated FROM a number that is
also printed somewhere on the page - there is no free-text commentary anywhere
in this file that a reader cannot check against the data above it.
"""

import datetime
import hashlib
import io
import os

import handicap_enrich as enrich
import handicap_ui as ui

esc = ui.esc

HERE = os.path.dirname(os.path.abspath(__file__))
SHEET = os.path.join(os.path.dirname(HERE), "static", "css", "tmr-handicap.css")


def _sheet_link():
    """The design system sheet, cache busted by its own content.

    It is added to the head here rather than in the shared HEAD_ASSETS so the
    MLB pages, which have their own mm- sheet and are not part of this redesign
    yet, do not start downloading a stylesheet they never use."""
    try:
        with io.open(SHEET, "rb") as fh:
            v = hashlib.sha256(fh.read()).hexdigest()[:12]
    except OSError:
        v = "dev"
    return ('    <link rel="stylesheet" href="/static/css/tmr-handicap.css?v=%s">' % v) + "\n"


# ---------------------------------------------------------------- helpers

def _season_for(sport, iso):
    """The season a date belongs to. NFL's year rolls in March, not January."""
    try:
        d = datetime.date.fromisoformat((iso or "")[:10])
    except ValueError:
        d = datetime.date.today()
    if sport in ("nfl", "ncaaf"):
        return d.year if d.month >= 3 else d.year - 1
    if sport in ("nba", "nhl", "ncaab"):
        return d.year if d.month >= 8 else d.year - 1
    return d.year


def _fmt_line(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return ("%+g" % f)


def _odds(v):
    try:
        f = int(round(float(v)))
    except (TypeError, ValueError):
        return None
    return "%+d" % f


def _per_game(flat, key, gp):
    v = enrich.statf(flat, key)
    if v is None or not gp:
        return None
    return round(v / gp, 1)


# ---------------------------------------------------------------- clubs

def club(sport, name, board_team, espn, teams_by_name):
    """One club, merged from the odds board, ESPN and TMR's own franchise table."""
    c = {"name": name, "short": None, "abbr": None, "logo": None, "color": None,
         "alt": None, "espn_id": None, "record": None, "location": None}
    if espn:
        c.update({"short": espn.get("short") or espn.get("nickname"),
                  "abbr": espn.get("abbr"), "logo": espn.get("logo"),
                  "color": espn.get("color"), "alt": espn.get("alt"),
                  "espn_id": espn.get("espn_id"), "record": espn.get("record"),
                  "location": espn.get("location")})
    t = (teams_by_name or {}).get(name) or {}
    if not c["espn_id"] and t.get("espn_team_id"):
        c["espn_id"] = t["espn_team_id"]
    if not c["abbr"] and t.get("current_abbr"):
        c["abbr"] = t["current_abbr"]
    if not c["logo"] and c["abbr"]:
        c["logo"] = ui.ESPN_LOGO % (sport if sport != "ncaaf" else "ncaa", c["abbr"].lower())
    if not c["short"]:
        c["short"] = name.split()[-1]
    # The city, not the nickname, is what carries a sentence: "Seattle comes
    # out ahead" is grammatical for every club, "Seahawks comes out" is not, and
    # neither is "Heat come out". Prose uses this; headings use the nickname.
    if not c["location"]:
        c["location"] = name[:-(len(c["short"]) + 1)] if name.endswith(c["short"]) else name
    if t.get("conference"):
        c["division"] = ("%s %s" % (t.get("conference"), t.get("division", ""))).strip()
    return c


# ---------------------------------------------------------------- markets

def markets(g, away, home):
    m = g.get("markets") or {}
    ml, sp, tot = m.get("h2h") or {}, m.get("spread") or {}, m.get("total") or {}
    out = {"any": bool(ml or sp or tot), "book_note": None,
           "moneyline": {"rows": []}, "spread": {"rows": []}, "total": {}}

    ia = enrich.implied(ml.get(away["name"]))
    ih = enrich.implied(ml.get(home["name"]))
    fa, fh = enrich.novig(ia, ih)
    for side, price, fair in ((away, ml.get(away["name"]), fa), (home, ml.get(home["name"]), fh)):
        o = _odds(price)
        if o:
            out["moneyline"]["rows"].append(
                (side["short"] or side["name"], o,
                 ("%s to win" % enrich.pct(fair)) if fair is not None else ""))
    out["ml_fair"] = (fa, fh)

    for side in (away, home):
        cell = sp.get(side["name"])
        if cell:
            point, price = cell
            line = _fmt_line(point)
            if line:
                out["spread"]["rows"].append((side["short"] or side["name"], line, _odds(price) or ""))
                out.setdefault("spread_by_side", {})[side["name"]] = float(point)

    if tot.get("point") is not None:
        try:
            pt = float(tot["point"])
        except (TypeError, ValueError):
            pt = None
        if pt is not None:
            out["total"] = {"point": ("%g" % pt), "price": _odds(tot.get("price")) or "",
                            "sub": "Over / under", "sub2": ""}
            out["total_point"] = pt

    if m.get("book"):
        # NO_INTERNAL_DISCLAIMERS_20260909. Naming the book is sourcing and it
        # stays. What went is the sentence after it, explaining that our odds
        # feed does not carry opening prices or line movement. A reader wants to
        # know where the number came from, not which fields our supplier omits.
        out["book_note"] = ("Prices from %s, and they move. Check the book before you act on "
                            "any number here." % m["book"])
    return out


# ---------------------------------------------------------------- comparison

# (label, stat key, per-game?, higher is better, suffix, weight)
#
# `weight` is what the storyline cards rank on. Without it the widest RELATIVE
# gap on the page wins, and that is almost always a small counting stat: the
# first cut of this file told a reader that the most important thing about a
# Thursday night game was interceptions thrown, because 8 against 15 is a 47%
# gap while 28.4 points against 26.6 is 6%. Scoring and yardage carry the game;
# giveaways and penalties colour it.
TEAM_ROWS = {
    "nfl": [
        ("Points scored per game", "record.avgPointsFor", False, True, "", 1.0),
        ("Points allowed per game", "record.avgPointsAgainst", False, False, "", 1.0),
        ("Point differential", "record.pointDifferential", False, True, "", 0.9),
        ("Total yards per game", "passing.netYardsPerGame", False, True, "", 0.9),
        ("Passing yards per game", "passing.netPassingYardsPerGame", False, True, "", 0.7),
        ("Rushing yards per game", "rushing.rushingYardsPerGame", False, True, "", 0.7),
        ("Completion rate", "passing.completionPct", False, True, "%", 0.5),
        ("Touchdowns scored", "scoring.totalTouchdowns", False, True, "", 0.5),
        ("Interceptions thrown", "passing.interceptions", False, False, "", 0.45),
        ("Fumbles lost", "general.fumblesLost", False, False, "", 0.4),
        ("Penalty yards per game", "general.totalPenaltyYards", True, False, "", 0.3),
    ],
    "nba": [
        ("Points scored per game", "record.avgPointsFor", False, True, "", 1.0),
        ("Points allowed per game", "record.avgPointsAgainst", False, False, "", 1.0),
        ("Rebounds per game", "general.avgRebounds", False, True, "", 0.7),
        ("Assists per game", "offensive.avgAssists", False, True, "", 0.6),
        ("Field goal rate", "offensive.fieldGoalPct", False, True, "%", 0.7),
        ("Three point rate", "offensive.threePointFieldGoalPct", False, True, "%", 0.6),
        ("Turnovers per game", "offensive.avgTurnovers", False, False, "", 0.5),
    ],
    "nhl": [
        ("Goals for per game", "record.avgPointsFor", False, True, "", 1.0),
        ("Goals against per game", "record.avgPointsAgainst", False, False, "", 1.0),
        ("Shots per game", "offensive.avgShots", False, True, "", 0.6),
        ("Power play rate", "offensive.powerPlayPct", False, True, "%", 0.6),
        ("Penalty kill rate", "defensive.penaltyKillPct", False, True, "%", 0.6),
    ],
}


def comparison_rows(sport, a_stats, h_stats, a_gp, h_gp):
    rows = []
    for label, key, per_game, higher, suffix, weight in TEAM_ROWS.get(sport, []):
        if per_game:
            av, hv = _per_game(a_stats, key, a_gp), _per_game(h_stats, key, h_gp)
            a_disp = ("%g" % av) if av is not None else None
            h_disp = ("%g" % hv) if hv is not None else None
        else:
            av, hv = enrich.statf(a_stats, key), enrich.statf(h_stats, key)
            a_disp = enrich.stat(a_stats, key)
            h_disp = enrich.stat(h_stats, key)
        if av is None or hv is None:
            continue
        rows.append({"label": label, "away": (a_disp or "") + suffix,
                     "home": (h_disp or "") + suffix,
                     "away_cmp": av, "home_cmp": hv, "higher": higher, "weight": weight})
    return rows


# ---------------------------------------------------------------- the duel

QB_STATS = [
    ("Yards per game", "passing.passingYardsPerGame", True),
    ("Completion %", "passing.completionPct", True),
    ("Touchdowns", "passing.passingTouchdowns", True),
    ("Interceptions", "passing.interceptions", False),
]


def qb_duel(sport, g, away, home, qb1, teams_by_name, rosters, season):
    if sport != "nfl":
        return None, {}
    spec = {"role": "Starting quarterback", "away": {}, "home": {}}
    photos = {}
    for which, side in (("away", away), ("home", home)):
        t = (teams_by_name or {}).get(side["name"]) or {}
        starter = (qb1 or {}).get(t.get("franchise_id")) or {}
        name = starter.get("full_name")
        if not name:
            continue
        person = (rosters.get(which) or {}).get(enrich.norm_name(name)) or {}
        flat, yr, prev = enrich.athlete_stats(sport, person.get("id"), season)
        stats = []
        for label, key, higher in QB_STATS:
            v = enrich.stat(flat, key)
            if v is None:
                continue
            stats.append({"label": label, "value": v, "cmp": enrich.statf(flat, key),
                          "higher": higher})
        meta_bits = []
        if person.get("jersey"):
            meta_bits.append("#%s" % person["jersey"])
        meta_bits.append(side["short"] or side["name"])
        if person.get("height") and person.get("weight"):
            meta_bits.append("%s, %s" % (person["height"], person["weight"]))
        if yr:
            meta_bits.append("%d season" % yr)
        spec[which] = {"name": name, "photo": person.get("headshot"),
                       "mono": enrich.initials(name), "meta": " · ".join(meta_bits),
                       "stats": stats, "role": "Starting quarterback",
                       "season": yr, "prev": prev}
        if person.get("headshot"):
            photos[which] = person["headshot"]
    if not (spec["away"].get("name") and spec["home"].get("name")):
        return None, photos
    return spec, photos


# ---------------------------------------------------------------- the model

def model_from_sim(sim, away, home, mk):
    """The simulator payload, normalised into what ui.model_panel wants."""
    if not sim:
        return None
    p = sim.get("projection") or {}
    sc = p.get("score") or {}
    wp = p.get("win_probability") or {}
    if sc.get("home") is None or wp.get("home") is None:
        return None
    meta = sim.get("meta") or {}
    ms = p.get("margin_shape") or {}

    home_margin = float(sc["home"]) - float(sc["away"])
    m = {"away_score": sc.get("away"), "home_score": sc.get("home"),
         "away_wp": wp.get("away"), "home_wp": wp.get("home"),
         "dist": (p.get("distributions") or {}).get("margin"),
         "cells": [], "chips": []}

    fair_a, fair_h = mk.get("ml_fair", (None, None))
    if fair_h is not None:
        gap = (wp.get("home") - fair_h) * 100.0
        m["wp_note"] = ("The market's own moneyline, with the book's margin removed, makes it "
                        "%s for %s. The model is %.1f points of win probability %s that."
                        % (enrich.pct(fair_h, 1), home.get("short") or home["name"], abs(gap),
                           "above" if gap > 0 else "below"))
    else:
        m["wp_note"] = ("Out of %s simulations of this exact matchup."
                        % "{:,}".format(meta.get("simulations") or 0))

    fav = home if home_margin >= 0 else away
    m["cells"].append({"value": "%s %s" % (fav.get("abbr") or fav["short"],
                                           _fmt_line(-abs(home_margin))),
                       "label": "Projected spread",
                       "note": "Model margin of %g" % abs(home_margin)})
    m["cells"].append({"value": "%g" % (p.get("projected_total") or 0),
                       "label": "Projected total",
                       "note": "Projected %d-%d" % (sc.get("home"), sc.get("away"))})

    # edge versus the market, which is the whole point of printing both
    lean_bits = []
    spread_by_side = mk.get("spread_by_side") or {}
    mkt_home = spread_by_side.get(home["name"])
    if mkt_home is not None:
        # the market's home spread is negative when home is favoured, so the
        # market's implied home margin is its negation.
        edge = home_margin - (-mkt_home)
        side = home if edge > 0 else away
        m["cells"].append({"value": "%.1f pts" % abs(edge),
                           "label": "Model vs market spread", "edge": abs(edge) >= 1.0,
                           "note": "Model is %.1f better on %s than the %s the board has"
                                   % (abs(edge), side.get("short") or side["name"],
                                      _fmt_line(mkt_home if side is home else -mkt_home))})
        if abs(edge) >= 1.5:
            lean_bits.append("%s %s: the model projects the game %.1f points closer to %s than "
                             "the board prices it."
                             % (side.get("short") or side["name"],
                                _fmt_line(mkt_home if side is home else -mkt_home),
                                abs(edge), side.get("short") or side["name"]))

    mkt_total = mk.get("total_point")
    proj_total = p.get("projected_total")
    if mkt_total is not None and proj_total is not None:
        t_edge = float(proj_total) - mkt_total
        m["cells"].append({"value": "%.1f pts" % abs(t_edge),
                           "label": "Model vs market total", "edge": abs(t_edge) >= 2.0,
                           "note": "Model %g against a posted %g" % (proj_total, mkt_total)})
        if abs(t_edge) >= 2.0:
            lean_bits.append("%s %g: the model's %g projected points is %.1f %s the number."
                             % ("Under" if t_edge < 0 else "Over", mkt_total, proj_total,
                                abs(t_edge), "below" if t_edge < 0 else "above"))

    for key, label in (("one_score", "One score game"), ("exactly_3", "Decided by exactly 3"),
                       ("exactly_7", "Decided by exactly 7"), ("blowout", "Decided by 14+")):
        if ms.get(key) is not None:
            m["chips"].append((label, enrich.pct(ms[key])))

    if lean_bits:
        m["lean"] = ("Model lean, not advice. " + " ".join(lean_bits))
        m["lean_live"] = True
        m["lean_tag"] = "TMR lean"
    else:
        m["lean"] = ("The model and the board agree inside a point and a half on the spread and "
                     "two points on the total, so there is no edge here worth naming.")
        m["lean_live"] = False
        m["lean_tag"] = "No edge"
    return m


# ---------------------------------------------------------------- storylines

def storylines(ctx, model, sim, hist, cmp_rows, duel_spec, photos, stat_season):
    """Every card below is generated from a number printed elsewhere on the page."""
    a, h = ctx["away"], ctx["home"]
    out = []

    # 1. why the game matters, from the model and the market together
    if model:
        fav = h if model["home_score"] >= model["away_score"] else a
        dog = a if fav is h else h
        wp = model["home_wp"] if fav is h else model["away_wp"]
        out.append({
            "kicker": "The shape of it", "side": "gold", "title": "Why this matchup matters",
            "logo": fav.get("logo"),
            "paras": [
                "%s comes out of the simulation ahead %d to %d and wins it %s of the time, which "
                "makes this a game with a favourite rather than a coin flip, but not a "
                "formality." % (fav.get("location") or fav["name"], max(model["home_score"], model["away_score"]),
                                min(model["home_score"], model["away_score"]), enrich.pct(wp)),
                "The other half of the story is how often it stays close: %s of the ten thousand "
                "runs finish inside one score, and %s land on exactly three points. That is the "
                "range %s has to survive." % (
                    dict((c[0], c[1]) for c in model.get("chips") or []).get("One score game", "a large share"),
                    dict((c[0], c[1]) for c in model.get("chips") or []).get("Decided by exactly 3", "a chunk"),
                    dog.get("location") or dog["name"]),
            ]})

    # 2 and 3. what each side has to do, from its own worst comparison row.
    # Only the core rows are eligible. Relative gap alone always crowns a small
    # counting stat - 8 interceptions against 15 is a 47% gap and 28.8 points
    # against 28.4 is 1% - and a page whose headline story is giveaways is not
    # handicapping the game. Scoring, defence and yardage tell it; the rest is
    # still on the page, one section up, for anyone who wants it.
    core = [r for r in cmp_rows if r.get("weight", 1.0) >= 0.7] or cmp_rows
    for side, other, which in ((a, h, "away"), (h, a, "home")):
        worst = None
        for r in core:
            av, hv = r.get("away_cmp"), r.get("home_cmp")
            if av is None or hv is None or av <= 0 or hv <= 0:
                continue
            mine, theirs = (av, hv) if which == "away" else (hv, av)
            behind = (theirs - mine) if r.get("higher", True) else (mine - theirs)
            if behind <= 0:
                continue
            share = (behind / max(abs(mine), abs(theirs), 1e-9)) * r.get("weight", 1.0)
            if worst is None or share > worst[0]:
                worst = (share, r, mine, theirs)
        best = None
        for r in core:
            av, hv = r.get("away_cmp"), r.get("home_cmp")
            if av is None or hv is None or av <= 0 or hv <= 0:
                continue
            mine, theirs = (av, hv) if which == "away" else (hv, av)
            ahead = (mine - theirs) if r.get("higher", True) else (theirs - mine)
            if ahead <= 0:
                continue
            share = (ahead / max(abs(mine), abs(theirs), 1e-9)) * r.get("weight", 1.0)
            if best is None or share > best[0]:
                best = (share, r, mine, theirs)
        paras = []
        if best:
            _, r, mine, theirs = best
            paras.append("Make the game about the one thing it does better. In %s it is %s "
                         "against %s, and that is the gap %s can actually press."
                         % (r["label"].lower(), _num(mine), _num(theirs),
                            side.get("location") or side["name"]))
        if worst:
            _, r, mine, theirs = worst
            paras.append("The hole is %s: %s against %s. Every projection on this page moves if "
                         "that number moves." % (r["label"].lower(), _num(mine), _num(theirs)))
        if paras:
            out.append({"kicker": side.get("abbr") or side["short"], "side": which,
                        "title": "What %s has to do" % (side.get("location") or side["name"]),
                        "logo": side.get("logo"),
                        "photo": photos.get(which), "photo_alt": (duel_spec or {}).get(which, {}).get("name"),
                        "paras": paras + (["Those rates come from %s." % stat_season]
                                          if stat_season else [])})

    # 4. the biggest mismatch on the page, whoever it favours
    gaps = []
    for r in core:
        av, hv = r.get("away_cmp"), r.get("home_cmp")
        if av is None or hv is None or av <= 0 or hv <= 0:
            continue
        share = (abs(av - hv) / max(abs(av), abs(hv), 1e-9)) * r.get("weight", 1.0)
        gaps.append((share, r, av, hv))
    if gaps:
        _, r, av, hv = max(gaps, key=lambda x: x[0])
        # the weighted score decides WHICH row wins; the sentence quotes the
        # real gap, not the weighted one.
        share = abs(av - hv) / max(abs(av), abs(hv), 1e-9)
        a_better = (av > hv) if r.get("higher", True) else (av < hv)
        who = a if a_better else h
        out.append({"kicker": "Biggest mismatch", "side": "away" if a_better else "home",
                    "title": r["label"], "logo": who.get("logo"),
                    "paras": ["The widest split between these two on the page is %s, where %s and "
                              "%s are %.0f%% apart. It favours %s, and it is the number to watch "
                              "first." % (r["label"].lower(), _num(av), _num(hv), share * 100.0,
                                          who.get("location") or who["name"])]})

    # 5. the x-factor, straight off the simulator's own environment adjustments
    env = ((sim or {}).get("environment") or {})
    notes = [n for n in (env.get("notes") or []) if n]
    if notes:
        out.append({"kicker": "X factor", "side": "gold", "title": "The conditions the model priced",
                    "paras": notes[:3]})

    # 6. what the market may be missing, only when there IS a gap
    if model and model.get("lean_live"):
        out.append({"kicker": "The market", "side": "gold",
                    "title": "What the board may be missing",
                    "paras": [model["lean"].replace("Model lean, not advice. ", ""),
                              "That is a model output against a live price, not a recommendation, "
                              "and the number on the board is the one that settles."]})

    # 7. the series, when there is one worth telling
    ms = ((hist or {}).get("matchup_summary") or {})
    close = (ms.get("close_games") or {}).get("label")
    if close:
        out.append({"kicker": "The series", "side": "gold", "title": "How these two usually go",
                    "paras": [close + ", which is the sample this page is drawn from, not a "
                              "prediction about Thursday."]})
    return out


def _num(v):
    if v is None:
        return ""
    return ("%g" % round(float(v), 1))


# ---------------------------------------------------------------- the page

def render(bld, sport, g, hist, slate, extras, built_at, hook=None):
    """The whole matchup page. `bld` is the calling builder module."""
    S = bld.SPORTS[sport]
    label = S["label"]
    teams_by_name, qb1, injuries = extras
    season = _season_for(sport, g.get("commence"))

    # --- enrichment, all of it optional -----------------------------------
    dates = ""
    try:
        d0 = datetime.date.fromisoformat((g.get("commence") or "")[:10])
        dates = "%s-%s" % ((d0 - datetime.timedelta(days=1)).strftime("%Y%m%d"),
                           (d0 + datetime.timedelta(days=1)).strftime("%Y%m%d"))
    except ValueError:
        pass
    sb = enrich.scoreboard(sport, dates) if dates else {}
    key = tuple(sorted([enrich.norm_name(g["away"]), enrich.norm_name(g["home"])]))
    ev = sb.get(key) or {}
    ev_teams = ev.get("teams") or {}

    away = club(sport, g["away"], None, ev_teams.get(enrich.norm_name(g["away"])), teams_by_name)
    home = club(sport, g["home"], None, ev_teams.get(enrich.norm_name(g["home"])), teams_by_name)
    for side in (away, home):
        side["color"] = enrich.lift(side.get("color") or side.get("alt"))
        side["alt"] = enrich.lift(side.get("alt"))
    away["color"], home["color"] = enrich.contrast_pair(
        away.get("color"), away.get("alt"), home.get("color"), home.get("alt"))
    # A club at 0-0 has a record that tells a reader nothing, which is every
    # club in week one. Its division says more, so that is what the hero prints
    # until there are games behind the number.
    for side in (away, home):
        if not side.get("record") or side["record"].replace("-", "").strip("0") == "":
            side["record"] = None
            side["sub"] = side.get("division")
        else:
            side["sub"] = side.get("division")

    a_stats, a_yr, a_prev = enrich.team_stats(sport, away["espn_id"], season)
    h_stats, h_yr, h_prev = enrich.team_stats(sport, home["espn_id"], season)
    a_gp = enrich.statf(a_stats, "general.gamesPlayed")
    h_gp = enrich.statf(h_stats, "general.gamesPlayed")
    stat_season = None
    if a_yr and h_yr and a_yr == h_yr:
        stat_season = ("the completed %d season, because %d has not kicked off for either club "
                       "yet" % (a_yr, season)) if a_prev else "the %d season to date" % a_yr

    rosters = {"away": enrich.roster(sport, away["espn_id"]),
               "home": enrich.roster(sport, home["espn_id"])}

    sim = enrich.simulate_pair(g["away"], g["home"], season) if sport == "nfl" else None

    mk = markets(g, away, home)
    duel_spec, photos = qb_duel(sport, g, away, home, qb1, teams_by_name, rosters, season)
    model = model_from_sim(sim, away, home, mk)
    # The board card carries the model's own number beside the posted one. It is
    # the single most useful line on a market board and it costs nothing: both
    # numbers are already on the page.
    proj_total = ((sim or {}).get("projection") or {}).get("projected_total")
    if mk.get("total") and proj_total is not None:
        mk["total"]["sub"] = "Over / under"
        mk["total"]["sub2"] = "model projects %g" % proj_total
    cmp_rows = comparison_rows(sport, a_stats, h_stats, a_gp, h_gp)

    # --- head --------------------------------------------------------------
    title = ("%s vs %s: %s" % (g["away"], g["home"], hook[0]) if hook
             else "%s vs %s: %s Odds, Head to Head and Betting Trends"
             % (g["away"], g["home"], label))
    desc = ("%s at %s. The line, the model's projected score and win probability, the head to head "
            "record, against the spread and over/under splits, and current form for both teams."
            % (g["away"], g["home"]))
    url = bld.SITE + bld.game_url(sport, g)
    crumbs = [("Handicapping", "/handicapping/"), (label, "/handicapping/%s/" % sport),
              ("%s at %s" % (away["short"], home["short"]), None)]
    ld = {"@context": "https://schema.org",
          "@graph": [bld.breadcrumb_ld([("Handicapping", "/handicapping/"),
                                        (label, "/handicapping/%s/" % sport),
                                        ("%s at %s" % (g["away"], g["home"]), None)])]}

    venue_line = None
    if ev.get("venue"):
        venue_line = ev["venue"] + ((", " + ev["city"]) if ev.get("city") else "")

    ctx = {"sport": sport, "label": label, "away": away, "home": home,
           "crumbs": crumbs, "markets": mk,
           "headline": "%s at %s" % (away["name"], home["name"]),
           "date_long": bld.long_date(g["commence"]),
           "time_et": bld.kickoff(g["commence"]),
           "venue_line": venue_line, "network": ev.get("network"),
           "kicker2": ("Week %s" % (sim.get("game") or {}).get("week")) if sim and (sim.get("game") or {}).get("week") else None}

    stand = []
    if model:
        stand.append("TrustMyRecord's simulator runs it ten thousand times and comes out %s by "
                     "%d to %d."
                     % ((home["location"] if model["home_score"] >= model["away_score"]
                         else away["location"]),
                        max(model["home_score"], model["away_score"]),
                        min(model["home_score"], model["away_score"])))
    stand.append("Below: the board, the model, both squads by the numbers, the whole head to head "
                 "record and every betting split on file.")
    ctx["standfirst"] = " ".join(stand)

    # --- body --------------------------------------------------------------
    b = [ui.body_open(ctx, "hx-matchup",
                      ' data-sport="%s" data-matchup="%s"' % (esc(sport), esc(bld.game_slug(g)))),
         ui.hero(ctx),
         '    <main class="hx-wrap">\n']

    if duel_spec:
        b.append(ui.section(
            "The quarterback matchup", ui.duel(duel_spec), eyebrow="Head to head",
            lede="Top of each depth chart, refreshed daily, with each man's own season line. "
                 "The highlighted cell in each pair is the better of the two.",
            note=("Passing lines are %s. Photography and player detail come from the league's own "
                  "roster feed." % (stat_season or "each player's most recent completed season"))))

    if model:
        b.append(ui.section(
            "The TrustMyRecord model", ui.model_panel(ctx, model), eyebrow="10,000 simulations",
            lede="The same drive-level engine that powers the public NFL simulator, run on this "
                 "exact fixture. Each simulation plays out real drive outcomes rather than drawing "
                 "from a smooth curve, which is why the margins pile up on 3 and 7.",
            note=("Model: %s, calibration %s, roster data %s. Nothing here is betting advice, and "
                  "every number can be reproduced on the simulator."
                  % ((sim.get("meta") or {}).get("model", ""),
                     (sim.get("meta") or {}).get("calibration", ""),
                     (sim.get("meta") or {}).get("data_freshness", ""))),
            anchor="model"))

    if cmp_rows:
        b.append(ui.section(
            "Both squads, by the numbers", ui.compare(ctx, cmp_rows),
            eyebrow="Season rates",
            lede="Each row is the same measure for both clubs, with the split bar showing each "
                 "side's share of the pair and the badge naming the club in front.",
            note=("Team rates are %s, from the league's own statistics feed."
                  % (stat_season or "the most recent completed season for both clubs"))))

    ppl = feature_people(sim, rosters, away, home)
    if ppl:
        b.append(ui.section(
            "The players who decide it", ui.people(ppl), eyebrow="Projected starters",
            lede="The skill positions the model expects on the field, with the league's own "
                 "photography."))

    b.append(form_section(hist, away, home))
    b.append(series_section(ctx, hist, sport, bld))
    b.append(trends_section(hist, away, home))

    st = storylines(ctx, model, sim, hist, cmp_rows, duel_spec, photos, stat_season)
    if st:
        b.append(ui.section("The story of the game", ui.stories(st), eyebrow="Read first",
                            lede="Every line in these cards is generated from a number printed "
                                 "elsewhere on this page. Nothing here is opinion."))

    b.append(injury_section(sport, g, teams_by_name, injuries, away, home))
    b.append(coverage_section(hist))
    b.append(related_section(bld, sport, g, slate, away, home))

    b.append('        <p class="hx-foot">Built %s. <a href="/handicapping/%s/">Back to the %s '
             'slate</a>, or the <a href="/handicapping/">handicapping hub</a>. Everything above '
             'answers one matchup; <a href="/betlegend-pro/">BetLegend Pro</a> is the same '
             'database with the question left open across 130,000+ graded games.</p>\n'
             % (esc(built_at[:16].replace("T", " ") + " UTC"), esc(sport), esc(label)))
    b.append('    </main>\n')
    b.append(bld.mlb.FOOT_SCRIPTS)
    b.append('</body>\n</html>\n')
    head = bld.page_head(title, desc, url, ld)
    head = head.replace("</head>", _sheet_link() + "</head>", 1)
    return head + "".join(b)


# ---------------------------------------------------------------- sections

def feature_people(sim, rosters, away, home):
    """Skill players the model expects to start, with the league's headshots."""
    out = []
    r = (sim or {}).get("roster") or {}
    for which, side in (("away", away), ("home", home)):
        block = r.get(which) or {}
        for p in (block.get("expected_starters") or []):
            role = (p.get("role") or "").upper()
            if role in ("QB", ""):
                continue
            person = (rosters.get(which) or {}).get(enrich.norm_name(p.get("name"))) or {}
            meta = [side.get("short") or side["name"]]
            if person.get("jersey"):
                meta.insert(0, "#%s" % person["jersey"])
            if person.get("college"):
                meta.append(person["college"])
            out.append({"name": p.get("name"), "side": which, "badge": role,
                        "photo": person.get("headshot"),
                        "mono": enrich.initials(p.get("name")),
                        "meta": " · ".join(meta)})
            if sum(1 for x in out if x["side"] == which) >= 3:
                break
    return out


def form_section(hist, away, home):
    if not hist:
        return ""
    rows = []
    for key, side in (("team_1_context", away), ("team_2_context", home)):
        c = (hist or {}).get(key) or {}
        if not c.get("team"):
            continue
        tags = []
        if c.get("last_10_record"):
            tags.append(("last 10", c["last_10_record"], ""))
        streak = c.get("current_streak") or ""
        if streak:
            tone = "hot" if streak.upper().startswith("W") else ("cold" if streak.upper().startswith("L") else "")
            tags.append(("current streak", streak, tone))
        if c.get("last_20_home_record"):
            tags.append(("at home, last 20", c["last_20_home_record"], ""))
        if c.get("last_20_away_record"):
            tags.append(("on the road, last 20", c["last_20_away_record"], ""))
        if tags:
            rows.append({"name": c["team"], "logo": side.get("logo"), "tags": tags})
    return ui.section(
        "Current form", ui.form_block(rows), eyebrow="All opponents",
        lede="Both clubs against everybody, for context. It is never mixed into the head to head "
             "sample below.",
        note=((hist.get("team_1_context") or {}).get("note") or "").strip() or None)


def series_section(ctx, hist, sport, bld):
    # NO_INTERNAL_DISCLAIMERS_20260909. Two clubs that have never met used to get
    # a card explaining that "the database holds no completed meeting ... it is
    # left blank rather than filled with an estimate". A reader does not need to
    # be told what our database does not hold. The module is omitted and the page
    # closes up around it.
    if not hist or hist.get("zero_result"):
        return ""
    ms = hist.get("matchup_summary") or {}
    t1, t2 = ms.get("team_1") or {}, ms.get("team_2") or {}
    if t1.get("wins") is None:
        return ""
    unit = bld.SPORTS[sport]["unit"]
    cards = []
    sc = ms.get("scoring") or {}
    if sc.get("avg_combined") is not None:
        cards.append({"value": sc["avg_combined"], "label": "Average combined %s" % unit})
    if sc.get("avg_margin") is not None:
        cards.append({"value": sc["avg_margin"], "label": "Average margin"})
    if (ms.get("close_games") or {}).get("count") is not None:
        cards.append({"value": ms["close_games"]["count"], "label": "One score games", "tone": "up"})
    if ms.get("home_side_label"):
        cards.append({"value": ms.get("home_side_wins", ms["home_side_label"].split()[3]
                                      if len(ms["home_side_label"].split()) > 3 else "-"),
                      "label": "Won by the home side"})
    d = ui.dial(t1.get("wins", 0), t1.get("losses", 0),
                "%s in the series" % (ctx["away"].get("short") or t1.get("team", "")),
                "Series record")
    body = ('            <div class="hx-card"><div class="hx-series">%s<div>%s</div></div></div>\n'
            % (d, (ui.trend_cards(cards) or "").strip())) if d else ui.trend_cards(cards)
    lede_bits = []
    qs = (hist.get("query_summary") or {}).get("text")
    if qs:
        lede_bits.append(qs)
    span = (hist.get("qualifying_span") or {}).get("label")
    if span:
        lede_bits.append(span)
    h2h = hist.get("head_to_head") or {}
    if h2h.get("lifetime_meetings") and h2h.get("record"):
        lede_bits.append("Every completed meeting on file, no filters: %s meetings, %s %s."
                         % (h2h["lifetime_meetings"], h2h.get("team") or "", h2h["record"]))
    return ui.section("The series", body, eyebrow="Head to head",
                      lede=" ".join(lede_bits) or None)


def trends_section(hist, away, home):
    if not hist:
        return ""
    mk = ((hist.get("matchup_summary") or {}).get("market")) or {}
    cards = []
    for key, label in (("ats", "Against the spread"), ("over_under", "Over / under"),
                       ("favorite", "As favourite"), ("underdog", "As underdog")):
        item = mk.get(key) or {}
        if item.get("label"):
            val = item.get("record") or item["label"]
            cards.append({"value": val if len(str(val)) <= 12 else item["label"],
                          "label": label, "note": item.get("label") if val != item["label"] else None})
    money = mk.get("moneyline") or {}
    for side in ("team_1", "team_2"):
        s = money.get(side) or {}
        if s.get("team") and s.get("units") is not None:
            try:
                u = float(s["units"])
            except (TypeError, ValueError):
                u = 0.0
            cards.append({"value": ("%+g" % u) + "u", "label": "%s moneyline" % s["team"],
                          "tone": "up" if u > 0 else ("down" if u < 0 else None),
                          "note": "flat one unit at the closing price over %s games"
                                  % s.get("eligible_games", 0)})
    if not cards:
        return ""
    note = ((hist.get("matchup_summary") or {}).get("samples") or {}).get("note")
    mnote = (money.get("note") or "").strip()
    if mnote:
        note = ("%s %s" % (note, mnote)).strip() if note else mnote
    return ui.section("Betting splits in this matchup", ui.trend_cards(cards),
                      eyebrow="Graded games", note=note)


def injury_section(sport, g, teams_by_name, injuries, away, home):
    if sport != "nfl" or not teams_by_name:
        return ""
    rows = []
    for side in (away, home):
        t = (teams_by_name or {}).get(side["name"]) or {}
        listed = ((injuries or {}).get("by_team") or {}).get(t.get("franchise_id")) or []
        names = sorted({r.get("full_name", "") for r in listed if r.get("full_name")})
        if names:
            rows.append({"name": side["name"], "logo": side.get("logo"),
                         "tags": [(n, "", "") for n in names[:14]]})
    if not rows:
        return ""
    return ui.section("Players carrying status notes", ui.form_block(rows), eyebrow="Availability",
                      note=(injuries or {}).get("disclaimer"))


def coverage_section(hist):
    if not hist:
        return ""
    rows = []
    cov = hist.get("database_coverage") or {}
    if cov.get("games"):
        rows.append(("Graded games counted", esc("%s %s, %s to %s" % (
            cov.get("games"), cov.get("sport", ""), cov.get("earliest_date", ""),
            cov.get("latest_date", "")))))
    if not rows:
        return ""
    # NO_INTERNAL_DISCLAIMERS_20260909. What stays is the SAMPLE: how many graded
    # games these numbers were counted from, and the span they cover. That is
    # evidence, and it is why a record on this page is worth more than one on a
    # blog. What went is the caveat list that sat beside it: the "data is 213
    # days behind today" staleness line and the "this reading is unavailable
    # because ..." note. Both explained our backend to a reader who came to
    # handicap a game, and both made a finished page read as unfinished.
    return ui.section("The sample behind these numbers", ui.deflist(rows),
                      eyebrow="Provenance")


def related_section(bld, sport, g, slate, away, home):
    others = [o for o in slate if bld.game_url(sport, o) != bld.game_url(sport, g)][:6]
    items = [("%s at %s" % (o["away"], o["home"]), bld.game_url(sport, o), None) for o in others]
    items.append(("Every %s game on the board" % bld.SPORTS[sport]["label"],
                  "/handicapping/%s/" % sport, None))
    sim_url = bld.SPORTS[sport].get("simulator")
    if sim_url:
        items.append(("Simulate this matchup yourself", sim_url, None))
    return ui.section("Rest of the %s board" % bld.SPORTS[sport]["label"], ui.links(items),
                      eyebrow="Keep going")
