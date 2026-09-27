"""The 32 current NFL franchises, by 2026 division, as the BetLegend Pro
dataset names them. Nicknames drive the matchup URL (/49ers-vs-cardinals/),
matching the existing /nfl-simulator/<a>-vs-<b>/ pages one for one."""
import re

DIVISIONS = {
    "AFC East": ["Buffalo Bills", "Miami Dolphins", "New England Patriots", "New York Jets"],
    "AFC North": ["Baltimore Ravens", "Cincinnati Bengals", "Cleveland Browns", "Pittsburgh Steelers"],
    "AFC South": ["Houston Texans", "Indianapolis Colts", "Jacksonville Jaguars", "Tennessee Titans"],
    "AFC West": ["Denver Broncos", "Kansas City Chiefs", "Las Vegas Raiders", "Los Angeles Chargers"],
    "NFC East": ["Dallas Cowboys", "New York Giants", "Philadelphia Eagles", "Washington Commanders"],
    "NFC North": ["Chicago Bears", "Detroit Lions", "Green Bay Packers", "Minnesota Vikings"],
    "NFC South": ["Atlanta Falcons", "Carolina Panthers", "New Orleans Saints", "Tampa Bay Buccaneers"],
    "NFC West": ["Arizona Cardinals", "Los Angeles Rams", "San Francisco 49ers", "Seattle Seahawks"],
}
TEAMS = [t for members in DIVISIONS.values() for t in members]
NICKNAME = {t: t.rsplit(" ", 1)[1] for t in TEAMS}
DIVISION_OF = {t: d for d, members in DIVISIONS.items() for t in members}


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def team_slug(team):
    return slug(team)


def matchup_slug(a, b):
    x, y = sorted([slug(NICKNAME[a]), slug(NICKNAME[b])])
    return f"{x}-vs-{y}"


def division_pairs():
    for members in DIVISIONS.values():
        for i in range(len(members)):
            for j in range(i + 1, len(members)):
                yield members[i], members[j]
