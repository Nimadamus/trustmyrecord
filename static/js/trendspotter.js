(function () {
  "use strict";

  var DEFAULT_SPORTS = ["MLB", "NBA", "NHL", "NFL", "NCAAB", "NCAAF", "Soccer"];
  var MARKET_TYPES = [
    { id: "all", label: "Any market" },
    { id: "moneyline", label: "Moneyline", aliases: ["MONEYLINE", "ML"] },
    { id: "spread", label: "Spread", aliases: ["SPREAD", "ATS"] },
    { id: "total", label: "Total", aliases: ["TOTAL", "GAME_TOTAL"] },
    { id: "team_total", label: "Team Total", aliases: ["TEAM_TOTAL", "TEAM TOTAL"] },
    { id: "run_line", label: "Run Line", aliases: ["RUN_LINE", "RUN LINE"] },
    { id: "puck_line", label: "Puck Line", aliases: ["PUCK_LINE", "PUCK LINE"] },
    { id: "first_five", label: "First Five", aliases: ["FIRST_FIVE", "F5", "FIRST 5"] },
    { id: "halves", label: "Halves", aliases: ["HALF", "HALVES", "1H", "2H"] },
    { id: "periods", label: "Periods", aliases: ["PERIOD", "PERIODS", "1P", "2P", "3P"] },
    { id: "player_props", label: "Player props", aliases: ["PLAYER_PROP", "PLAYER PROP", "PROP"] },
    { id: "alts", label: "Alts", aliases: ["ALT", "ALTERNATE"] }
  ];
  var FACTORS = [
    { id: "all", label: "Any trend factor" },
    { id: "home", label: "Home trends", terms: ["HOME", " AT HOME", "VS "] },
    { id: "away", label: "Away trends", terms: ["AWAY", " ROAD", " ON THE ROAD", " @ "] },
    { id: "division", label: "Division trends", terms: ["DIVISION", "DIVISIONAL"] },
    { id: "conference", label: "Conference trends", terms: ["CONFERENCE", "EASTERN", "WESTERN", "AFC", "NFC"] },
    { id: "rest", label: "Rest advantage", terms: ["REST", "REST ADVANTAGE", "DAYS OFF"] },
    { id: "back_to_back", label: "Back-to-back", terms: ["BACK-TO-BACK", "B2B", "BACK TO BACK"] },
    { id: "rematch", label: "Same opponent rematch", terms: ["REMATCH", "SAME OPPONENT"] },
    { id: "game_2_set", label: "Game 2 of same-opponent set", terms: ["GAME 2", "SECOND GAME"] },
    { id: "after_win", label: "After win", terms: ["AFTER A WIN", "AFTER WIN", "AFTER BEATING", "AFTER DEFEATING", "COMING OFF A WIN"] },
    { id: "after_loss", label: "After loss", terms: ["AFTER A LOSS", "AFTER LOSS", "AFTER LOSING", "AFTER FALLING TO", "COMING OFF A LOSS"] },
    { id: "favorite", label: "As favorite", terms: ["FAVORITE", "FAVORED"] },
    { id: "underdog", label: "As underdog", terms: ["UNDERDOG", "DOG"] },
    { id: "over_500", label: "Against teams over .500", terms: ["OVER .500", "ABOVE .500"] },
    { id: "under_500", label: "Against teams under .500", terms: ["UNDER .500", "BELOW .500"] },
    { id: "recent_form", label: "Recent form", terms: ["RECENT", "FORM", "STREAK"] },
    { id: "last_5", label: "Last 5", terms: ["LAST 5"] },
    { id: "last_10", label: "Last 10", terms: ["LAST 10"] },
    { id: "last_15", label: "Last 15", terms: ["LAST 15"] },
    { id: "last_25", label: "Last 25", terms: ["LAST 25"] },
    { id: "over_under", label: "Over/under specific trends", terms: ["OVER", "UNDER", "TOTAL"] },
    { id: "scoring", label: "Scoring trends", terms: ["SCORING", "SCORED", "POINTS", "RUNS", "GOALS"] },
    { id: "defensive", label: "Defensive trends", terms: ["DEFENSE", "DEFENSIVE", "ALLOWED"] },
    { id: "venue", label: "Venue/stadium/arena trends", terms: ["VENUE", "STADIUM", "ARENA", "PARK", "FIELD"] },
    { id: "h2h", label: "Head-to-head trends", terms: ["H2H", "HEAD-TO-HEAD", "HEAD TO HEAD", "VS"] },
    { id: "scheduling", label: "Situational scheduling trends", terms: ["SCHEDULE", "TRAVEL", "ROAD GAME", "HOME GAME"] }
  ];
  var SORTS = [
    { id: "rank", label: "Trend rank" },
    { id: "sample", label: "Sample size" },
    { id: "win_pct", label: "Win percentage" },
    { id: "roi", label: "ROI if available" },
    { id: "confidence", label: "Trend strength" },
    { id: "recency", label: "Recency" },
    { id: "market", label: "Market type" }
  ];
  var SPORT_BOARD_KEYS = {
    MLB: "baseball_mlb",
    NBA: "basketball_nba",
    NHL: "icehockey_nhl",
    NFL: "americanfootball_nfl",
    NCAAB: "basketball_ncaab",
    NCAAF: "americanfootball_ncaaf"
  };

  var state = {
    sport: "",
    matchup: "",
    market: "all",
    factor: "all",
    minSample: 0,
    minWinPct: 0,
    dateStart: "",
    dateEnd: "",
    team: "both",
    opponent: "all",
    location: "all",
    researchMode: "current",
    sort: "rank",
    currentMatchupOnly: true,
    generated: false
  };
  var cache = {};

  var els = {
    sportOptions: document.getElementById("sportOptions"),
    matchupFilter: document.getElementById("matchupFilter"),
    matchupDataSource: document.getElementById("matchupDataSource"),
    marketType: document.getElementById("marketType"),
    trendFactor: document.getElementById("trendFactor"),
    minSample: document.getElementById("minSample"),
    minWinPct: document.getElementById("minWinPct"),
    dateStart: document.getElementById("dateStart"),
    dateEnd: document.getElementById("dateEnd"),
    teamFilter: document.getElementById("teamFilter"),
    opponentFilter: document.getElementById("opponentFilter"),
    locationFilter: document.getElementById("locationFilter"),
    researchMode: document.getElementById("researchMode"),
    sortBy: document.getElementById("sortBy"),
    currentMatchupOnly: document.getElementById("currentMatchupOnly"),
    selectionSummary: document.getElementById("selectionSummary"),
    runButton: document.getElementById("runTrendspotter"),
    resultsSection: document.getElementById("resultsSection"),
    resultsTitle: document.getElementById("resultsTitle"),
    resultCount: document.getElementById("resultCount"),
    resultsList: document.getElementById("resultsList"),
    sourceModal: document.getElementById("sourceModal"),
    sourceModalBody: document.getElementById("sourceModalBody"),
    sourceModalTitle: document.getElementById("sourceModalTitle"),
    loadingMessage: document.getElementById("loadingMessage")
  };

  function apiBase() {
    if (window.CONFIG && window.CONFIG.api && window.CONFIG.api.baseUrl) {
      return String(window.CONFIG.api.baseUrl).replace(/\/+$/, "");
    }
    return "https://trustmyrecord-api.onrender.com/api";
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char];
    });
  }

  function normalize(value) {
    return String(value == null ? "" : value).trim().toUpperCase();
  }

  function labelize(value) {
    return String(value == null || value === "" ? "Unavailable" : value).replace(/_/g, " ");
  }

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean))).sort();
  }

  function trendsForSport(sport) {
    var data = cache[sport];
    return data && Array.isArray(data.trends) ? data.trends.filter(isRenderableTrend) : [];
  }

  function matchupKey(matchup) {
    if (!matchup) return "";
    return [
      matchup.sport,
      matchup.matchup,
      matchup.away_abbr,
      matchup.home_abbr,
      matchup.slate_date || matchup.artifact_slate_date || ""
    ].map(normalize).join("|");
  }

  function matchupFromTrend(trend) {
    return {
      sport: trend.sport,
      matchup: trend.matchup,
      away_abbr: trend.away_abbr,
      home_abbr: trend.home_abbr,
      slate_date: trend.slate_date || trend.artifact_slate_date || "",
      game_time: trend.game_time || "",
      trend_count: 0,
      source: "verified_trendspotter_artifact"
    };
  }

  function matchupsForSport(sport) {
    var data = cache[sport] || {};
    var listed = Array.isArray(data.matchups) ? data.matchups : [];
    var liveSlate = Array.isArray(data.live_matchups) ? data.live_matchups : [];
    var derived = trendsForSport(sport).map(matchupFromTrend);
    var verifiedSlate = data.is_archived === true && state.researchMode === "current" ? [] : listed.concat(derived);
    var byKey = new Map();
    verifiedSlate.concat(liveSlate).forEach(function (matchup) {
      if (!matchup || !matchup.matchup || !matchup.away_abbr || !matchup.home_abbr) return;
      var key = matchupKey(matchup);
      var current = byKey.get(key) || {};
      byKey.set(key, Object.assign({}, current, matchup, {
        key: key,
        trend_count: Math.max(Number(current.trend_count) || 0, Number(matchup.trend_count) || 0)
      }));
    });
    return Array.from(byKey.values()).sort(function (a, b) {
      return String(a.game_time || a.matchup).localeCompare(String(b.game_time || b.matchup));
    });
  }

  function selectedMatchup() {
    return matchupsForSport(state.sport).find(function (matchup) {
      return matchup.key === state.matchup;
    }) || null;
  }

  function allCachedTrends() {
    return Object.keys(cache).reduce(function (items, sport) {
      return items.concat(trendsForSport(sport));
    }, []);
  }

  function supportedSports() {
    return unique(DEFAULT_SPORTS.concat(allCachedTrends().map(function (trend) {
      return trend.sport;
    })));
  }

  function trendText(trend) {
    return normalize([
      trend.bet_type,
      trend.trend_type,
      trend.kind,
      trend.side,
      trend.claim,
      trend.subset,
      trend.market,
      trend.recommendation
    ].join(" "));
  }

  function selectedMatchupMatches(trend) {
    var matchup = selectedMatchup();
    if (!matchup) return false;
    var team = normalize(trend.team_abbr);
    var opponent = normalize(trend.opponent_abbr);
    var home = normalize(matchup.home_abbr);
    var away = normalize(matchup.away_abbr);
    return normalize(trend.matchup) === normalize(matchup.matchup) &&
      normalize(trend.home_abbr) === home &&
      normalize(trend.away_abbr) === away &&
      [home, away].includes(team) &&
      [home, away].includes(opponent) &&
      team !== opponent;
  }

  function sampleRows(trend) {
    if (Array.isArray(trend.source_rows) && trend.source_rows.length) return trend.source_rows;
    if (Array.isArray(trend.included_games) && trend.included_games.length) return trend.included_games;
    return [];
  }

  function calculatedRecord(trend) {
    var rows = sampleRows(trend);
    if (!rows.length) return null;
    var wins = 0;
    var losses = 0;
    var pushes = 0;
    rows.forEach(function (row) {
      var result = rowMarketResult(row) || normalize(row && row.game_result);
      if (["WIN", "W"].includes(result)) wins += 1;
      else if (["LOSS", "L"].includes(result)) losses += 1;
      else if (["PUSH", "P"].includes(result)) pushes += 1;
    });
    return { wins: wins, losses: losses, pushes: pushes, sample: rows.length };
  }

  function recordPctSampleValid(trend) {
    var sample = Number(trend.sample);
    if (!Number.isFinite(sample) || sample <= 0) return false;
    var rowsRecord = calculatedRecord(trend);
    if (!rowsRecord) return true;
    if (rowsRecord.sample !== sample) return false;
    var decided = rowsRecord.wins + rowsRecord.losses;
    if (!decided) return false;
    var pct = numberValue(trend.win_percentage || trend.win_pct || trend.dominance);
    if (trend.win_percentage !== undefined || trend.win_pct !== undefined) {
      if (pct !== null && pct > 1) pct /= 100;
      if (pct !== null && Math.abs(pct - (rowsRecord.wins / sample)) > 0.011) return false;
    } else if (pct !== null) {
      if (pct > 1) pct /= 100;
      if (Math.abs(pct - (Math.max(rowsRecord.wins, rowsRecord.losses) / sample)) > 0.011) return false;
    }
    var record = recordText(trend);
    if (record) {
      var match = String(record).match(/(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?/);
      if (match && (Number(match[1]) !== rowsRecord.wins || Number(match[2]) !== rowsRecord.losses || Number(match[3] || 0) !== rowsRecord.pushes)) {
        return false;
      }
    }
    return true;
  }

  function marketMatches(trend, marketId) {
    if (marketId === "all") return true;
    var market = MARKET_TYPES.find(function (item) { return item.id === marketId; });
    var body = trendText(trend);
    return Boolean(market && market.aliases.some(function (alias) {
      return body.indexOf(normalize(alias)) !== -1;
    }));
  }

  function factorMatches(trend, factorId) {
    if (factorId === "all") return true;
    var factor = FACTORS.find(function (item) { return item.id === factorId; });
    var body = trendText(trend);
    if (!factor) return true;
    if (factorId === "home") return normalize(trend.side) === "HOME" || normalize(trend.team_abbr) === normalize(trend.home_abbr) || factor.terms.some(function (term) { return body.indexOf(term) !== -1; });
    if (factorId === "away") return normalize(trend.side) === "AWAY" || normalize(trend.team_abbr) === normalize(trend.away_abbr) || factor.terms.some(function (term) { return body.indexOf(term) !== -1; });
    return factor.terms.some(function (term) { return body.indexOf(term) !== -1; });
  }

  function isRenderableTrend(trend) {
    if (!trend || typeof trend !== "object") return false;
    var required = ["sport", "matchup", "claim", "bet_type", "sample", "date_range", "source_url", "team_abbr"];
    var complete = required.every(function (field) {
      return trend[field] !== undefined && trend[field] !== null && String(trend[field]).trim() !== "";
    });
    if (!complete) return false;
    return Array.isArray(trend.game_log) && trend.game_log.length > 0;
  }

  function numberValue(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parsedClaimRecord(trend) {
    var claim = String(trend && trend.claim || "");
    var record = claim.match(/\b(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?\b/);
    if (record) {
      return {
        wins: Number(record[1]),
        losses: Number(record[2]),
        pushes: Number(record[3] || 0),
        sample: Number(record[1]) + Number(record[2]) + Number(record[3] || 0)
      };
    }
    var count = claim.match(/\bin\s+(\d+)\s+of\s+(?:their\s+)?(?:last\s+)?(\d+)\b/i);
    if (count) {
      return {
        wins: Number(count[1]),
        losses: Math.max(0, Number(count[2]) - Number(count[1])),
        pushes: 0,
        sample: Number(count[2])
      };
    }
    return null;
  }

  function pctText(trend) {
    var parsedRecord = parsedClaimRecord(trend);
    if (parsedRecord && parsedRecord.sample > 0) {
      return ((parsedRecord.wins / parsedRecord.sample) * 100).toFixed(1).replace(/\.0$/, "") + "%";
    }
    var dominance = numberValue(trend.win_percentage || trend.win_pct || trend.dominance);
    if (dominance === null) return "";
    if (dominance <= 1) dominance *= 100;
    return dominance.toFixed(dominance % 1 === 0 ? 0 : 1) + "%";
  }

  function recordText(trend) {
    if (trend.record) return trend.record;
    var parsedRecord = parsedClaimRecord(trend);
    if (parsedRecord) return parsedRecord.wins + "-" + parsedRecord.losses + (parsedRecord.pushes ? "-" + parsedRecord.pushes : "");
    var wins = numberValue(trend.wins);
    var losses = numberValue(trend.losses);
    var pushes = numberValue(trend.pushes);
    if (wins !== null && losses !== null) return wins + "-" + losses + (pushes ? "-" + pushes : "");
    var sample = numberValue(trend.sample);
    var dominance = numberValue(trend.dominance);
    if (sample !== null && dominance !== null) {
      var calcWins = Math.round(sample * (dominance <= 1 ? dominance : dominance / 100));
      return calcWins + "-" + Math.max(0, sample - calcWins);
    }
    return "";
  }

  function trendId(trend) {
    return [trend.sport, trend.matchup, trend.team_abbr, trend.bet_type, trend.rank, trend.claim].map(normalize).join("|");
  }

  function dateBounds(trend) {
    var dates = Array.isArray(trend.game_dates) ? trend.game_dates.slice() : [];
    String(trend.date_range || "").replace(/\d{4}-\d{2}-\d{2}/g, function (match) {
      dates.push(match);
      return match;
    });
    dates = unique(dates);
    return { first: dates[0] || "", last: dates[dates.length - 1] || "" };
  }

  function passesDateFilter(trend) {
    if (!state.dateStart && !state.dateEnd) return true;
    var bounds = dateBounds(trend);
    var first = bounds.first;
    var last = bounds.last || first;
    if (state.dateStart && last && last < state.dateStart) return false;
    if (state.dateEnd && first && first > state.dateEnd) return false;
    return true;
  }

  function filteredResults() {
    var minSample = Math.max(0, Number(state.minSample) || 0);
    var minWinPct = Math.max(0, Number(state.minWinPct) || 0);
    var results = trendsForSport(state.sport).filter(function (trend) {
      if (!state.matchup || !selectedMatchupMatches(trend)) return false;
      if (state.researchMode === "current" && !trendIsCurrent(trend)) return false;
      if (state.researchMode === "archived" && !trendIsArchived(trend)) return false;
      if (!marketMatches(trend, state.market)) return false;
      if (!factorMatches(trend, state.factor)) return false;
      if (!recordPctSampleValid(trend)) return false;
      if ((Number(trend.sample) || 0) < minSample) return false;
      var pct = numberValue(trend.win_percentage || trend.win_pct || trend.dominance);
      if (pct !== null && pct <= 1) pct *= 100;
      if (minWinPct && (pct === null || pct < minWinPct)) return false;
      if (state.team !== "both" && normalize(trend.team_abbr) !== normalize(state.team)) return false;
      if (state.opponent !== "all" && normalize(trend.opponent_abbr) !== normalize(state.opponent)) return false;
      if (state.location === "home" && normalize(trend.team_abbr) !== normalize(trend.home_abbr)) return false;
      if (state.location === "away" && normalize(trend.team_abbr) !== normalize(trend.away_abbr)) return false;
      if (!currentMatchupMatches(trend)) return false;
      return passesDateFilter(trend);
    });
    return results.sort(sorter);
  }

  function currentMatchupMatches(trend) {
    if (trend.current_matchup_valid === false || trend.current_context_valid === false) return false;
    if (trend.current_matchup_valid === true || trend.current_context_valid === true) return true;
    return true;
  }

  function trendIsCurrent(trend) {
    return trend && trend.is_current === true;
  }

  function trendIsArchived(trend) {
    return trend && (trend.is_archived === true || trend.is_current === false);
  }

  function statusLabel(trend) {
    if (trendIsCurrent(trend)) return "Current Slate";
    if (trendIsArchived(trend)) return "Archived Research";
    return "Stale Data";
  }

  function statusClass(trend) {
    if (trendIsCurrent(trend)) return "is-current";
    if (trendIsArchived(trend)) return "is-archived";
    return "is-stale";
  }

  function metricForSort(trend, sortId) {
    if (sortId === "sample") return Number(trend.sample) || 0;
    if (sortId === "win_pct") return numberValue(trend.win_percentage || trend.win_pct || trend.dominance) || 0;
    if (sortId === "roi") return verifiedRoi(trend).value == null ? -Infinity : verifiedRoi(trend).value;
    if (sortId === "confidence") return strengthRating(trend).score;
    if (sortId === "recency") return Date.parse(dateBounds(trend).last || trend.slate_date || "") || 0;
    if (sortId === "market") return normalize(trend.bet_type);
    return -(Number(trend.rank) || 999999);
  }

  function sorter(a, b) {
    var sortId = state.sort;
    var av = metricForSort(a, sortId);
    var bv = metricForSort(b, sortId);
    if (sortId === "market") return String(av).localeCompare(String(bv));
    if (av === bv) return (Number(a.rank) || 999999) - (Number(b.rank) || 999999);
    return bv - av;
  }

  function optionHtml(value, label, selected) {
    return "<option value=\"" + escapeHtml(value) + "\"" + (selected ? " selected" : "") + ">" + escapeHtml(label) + "</option>";
  }

  function renderSelects() {
    els.marketType.innerHTML = MARKET_TYPES.map(function (item) {
      return optionHtml(item.id, item.label, state.market === item.id);
    }).join("");
    els.trendFactor.innerHTML = FACTORS.map(function (item) {
      return optionHtml(item.id, item.label, state.factor === item.id);
    }).join("");
    els.locationFilter.innerHTML = [
      optionHtml("all", "Any location", state.location === "all"),
      optionHtml("home", "Home only", state.location === "home"),
      optionHtml("away", "Away only", state.location === "away")
    ].join("");
    els.sortBy.innerHTML = SORTS.map(function (item) {
      return optionHtml(item.id, item.label, state.sort === item.id);
    }).join("");
    els.currentMatchupOnly.checked = true;
    els.currentMatchupOnly.disabled = true;
  }

  function renderSportOptions() {
    els.sportOptions.innerHTML = supportedSports().map(function (sport) {
      var trends = trendsForSport(sport);
      var currentCount = trends.filter(trendIsCurrent).length;
      var archiveCount = trends.filter(trendIsArchived).length;
      return [
        "<button class=\"ts-option" + (state.sport === sport ? " is-selected" : "") + "\" type=\"button\" data-sport=\"" + escapeHtml(sport) + "\">",
        "  <strong>" + escapeHtml(sport) + "</strong>",
        "  <span>" + (currentCount ? currentCount + " current trend" + (currentCount === 1 ? "" : "s") : archiveCount ? archiveCount + " archived trend" + (archiveCount === 1 ? "" : "s") : "No current artifact") + "</span>",
        "</button>"
      ].join("");
    }).join("");
  }

  function renderMatchupFilter() {
    var matchups = matchupsForSport(state.sport);
    if (!state.sport) {
      els.matchupFilter.innerHTML = optionHtml("", "Select a sport first", true);
      els.matchupFilter.disabled = true;
      els.matchupDataSource.textContent = "Matchups load after sport selection.";
      return;
    }
    if (!matchups.length) {
      els.matchupFilter.innerHTML = optionHtml("", "No verified slate matchups available", true);
      els.matchupFilter.disabled = true;
      els.matchupDataSource.textContent = "No verified Trendspotter slate artifact contains matchup data for " + state.sport + ".";
      return;
    }
    if (!matchups.some(function (matchup) { return matchup.key === state.matchup; })) {
      state.matchup = "";
    }
    els.matchupFilter.disabled = false;
    els.matchupFilter.innerHTML = optionHtml("", "Choose a current-slate matchup", !state.matchup) + matchups.map(function (matchup) {
      var label = matchup.matchup + (matchup.game_time ? " / " + matchup.game_time : "") + (matchup.trend_count ? " / " + matchup.trend_count + " verified trend" + (Number(matchup.trend_count) === 1 ? "" : "s") : "");
      return optionHtml(matchup.key, label, state.matchup === matchup.key);
    }).join("");
    var data = cache[state.sport] || {};
    var source = data.matchup_source || "Verified Trendspotter artifact slate matchups";
    var date = data.artifact_slate_date ? " Slate date: " + data.artifact_slate_date + "." : "";
    els.matchupDataSource.textContent = source + "." + date;
  }

  function renderTeamFilters() {
    var matchup = selectedMatchup();
    if (!matchup) {
      els.teamFilter.innerHTML = optionHtml("both", "Choose matchup first", true);
      els.teamFilter.disabled = true;
      els.opponentFilter.innerHTML = optionHtml("all", "Locked after matchup selection", true);
      els.opponentFilter.disabled = true;
      return;
    }
    var away = matchup.away_abbr;
    var home = matchup.home_abbr;
    if (![away, home, "both"].includes(state.team)) state.team = "both";
    els.teamFilter.disabled = false;
    els.teamFilter.innerHTML = [
      optionHtml("both", "Both teams", state.team === "both"),
      optionHtml(away, away + " (away)", state.team === away),
      optionHtml(home, home + " (home)", state.team === home)
    ].join("");
    els.opponentFilter.disabled = true;
    els.opponentFilter.innerHTML = optionHtml("all", "Locked to " + away + " and " + home, true);
  }

  function updateSummary() {
    var matchup = selectedMatchup();
    var teamLabel = state.team === "both" ? "Both teams" : state.team;
    var parts = [
      state.researchMode === "current" ? "Current Slate" : "Archived Research",
      state.sport || "Select sport",
      matchup ? matchup.matchup : "Select matchup",
      teamLabel || "Both teams",
      MARKET_TYPES.find(function (item) { return item.id === state.market; }).label,
      FACTORS.find(function (item) { return item.id === state.factor; }).label
    ];
    els.selectionSummary.textContent = parts.join(" / ");
    els.runButton.disabled = !state.sport || !state.matchup;
  }

  async function loadSport(sport) {
    if (!sport || cache[sport]) {
      renderSportOptions();
      renderMatchupFilter();
      renderTeamFilters();
      updateSummary();
      return;
    }
    els.loadingMessage.textContent = "Loading verified " + sport + " trends...";
    els.loadingMessage.classList.remove("is-hidden");
    try {
      var response = await fetch(apiBase() + "/trendspotter/verified?sport=" + encodeURIComponent(sport), {
        headers: { "Accept": "application/json" },
        cache: "no-store"
      });
      cache[sport] = await response.json().catch(function () { return { status: "missing", trends: [] }; });
      if (!matchupsForSport(sport).length || cache[sport].is_archived === true) {
        await loadSlateMatchups(sport);
      }
    } catch (error) {
      cache[sport] = { status: "error", trends: [], unavailable_data: [error.message] };
    } finally {
      els.loadingMessage.classList.add("is-hidden");
      renderSportOptions();
      renderMatchupFilter();
      renderTeamFilters();
      updateSummary();
      if (state.generated) renderResults();
    }
  }

  async function loadSlateMatchups(sport) {
    var boardKey = SPORT_BOARD_KEYS[sport];
    if (!boardKey) return;
    try {
      var response = await fetch(apiBase() + "/games/board/" + encodeURIComponent(boardKey), {
        headers: { "Accept": "application/json" },
        cache: "no-store"
      });
      var data = await response.json().catch(function () { return {}; });
      var games = Array.isArray(data.games) ? data.games : Array.isArray(data) ? data : [];
      cache[sport] = cache[sport] || {};
      cache[sport].live_matchups = games.filter(function (game) {
        return game && game.away_team && game.home_team;
      }).map(function (game) {
        return {
          sport: sport,
          matchup: game.away_team + " @ " + game.home_team,
          away_abbr: game.away_team,
          home_abbr: game.home_team,
          slate_date: String(game.commence_time || "").slice(0, 10),
          game_time: game.commence_time || "",
          source: data.diagnostics && data.diagnostics.source ? data.diagnostics.source : "market_board_schedule",
          trend_count: 0
        };
      });
      if (cache[sport].live_matchups.length) {
        cache[sport].matchup_source = "Live schedule board matchups from the TrustMyRecord games board; verified trend results still require matching Trendspotter artifact rows";
      }
    } catch (error) {
      cache[sport] = cache[sport] || {};
      cache[sport].live_matchup_error = error.message;
    }
  }

  function selectSport(sport) {
    state.sport = sport;
    state.matchup = "";
    state.team = "both";
    state.opponent = "all";
    state.generated = false;
    clearResults();
    renderSportOptions();
    renderMatchupFilter();
    renderTeamFilters();
    updateSummary();
    loadSport(sport);
  }

  function clearResults() {
    els.resultsSection.classList.add("is-hidden");
    els.resultsList.innerHTML = "";
    els.resultCount.textContent = "0 trends";
  }

  function supportedValue(label, value) {
    if (value === undefined || value === null || value === "") return "";
    return "<div><dt>" + escapeHtml(label) + "</dt><dd>" + escapeHtml(value) + "</dd></div>";
  }

  function sourceSummary(trend) {
    var source = trend.source_summary && trend.source_summary.source_url ? trend.source_summary.source_url : trend.source_url;
    return source ? source : "Verified artifact";
  }

  function sourceRows(trend) {
    if (Array.isArray(trend.source_rows) && trend.source_rows.length) return trend.source_rows;
    if (Array.isArray(trend.included_games) && trend.included_games.length) return trend.included_games;
    return [];
  }

  function excludedRows(trend) {
    if (Array.isArray(trend.excluded_games)) return trend.excluded_games;
    if (Array.isArray(trend.exclusion_log)) return trend.exclusion_log;
    return [];
  }

  function rowOdds(row) {
    return numberValue(row && (row.odds || row.price || row.moneyline));
  }

  function rowMarketResult(row) {
    return normalize(row && (row.market_result || row.result || row.bet_result));
  }

  function verifiedOddsSummary(trend) {
    var odds = sourceRows(trend).map(rowOdds).filter(function (value) { return value !== null; });
    if (!odds.length) {
      var direct = numberValue(trend.average_odds || trend.avg_odds);
      if (direct !== null && (trend.odds_verified || trend.verified_odds)) odds = [direct];
    }
    if (!odds.length) return null;
    var avg = odds.reduce(function (sum, value) { return sum + value; }, 0) / odds.length;
    var min = Math.min.apply(Math, odds);
    var max = Math.max.apply(Math, odds);
    return {
      average: Math.round(avg),
      range: min === max ? String(min) : min + " to " + max,
      count: odds.length
    };
  }

  function americanProfit(odds) {
    if (odds > 0) return odds / 100;
    if (odds < 0) return 100 / Math.abs(odds);
    return null;
  }

  function verifiedRoi(trend) {
    if (trend.roi_verified && trend.roi !== undefined && trend.roi !== null) {
      return { value: Number(trend.roi), label: String(trend.roi) + "%", basis: trend.roi_basis || "verified artifact ROI" };
    }
    var rows = sourceRows(trend);
    if (!rows.length) return { value: null };
    var hasUnitBasis = Boolean(trend.unit_basis || trend.stake_basis || rows.every(function (row) { return row.unit_basis || row.stake_units || row.stake; }));
    if (!hasUnitBasis) return { value: null };
    var profit = 0;
    var stake = 0;
    for (var i = 0; i < rows.length; i += 1) {
      var odds = rowOdds(rows[i]);
      var result = rowMarketResult(rows[i]);
      var units = Number(rows[i].stake_units || rows[i].stake || 1);
      if (odds === null || !Number.isFinite(units) || units <= 0 || !["WIN", "W", "LOSS", "L"].includes(result)) {
        return { value: null };
      }
      var winProfit = americanProfit(odds);
      if (winProfit === null) return { value: null };
      stake += units;
      profit += (result === "WIN" || result === "W") ? winProfit * units : -units;
    }
    if (!stake) return { value: null };
    var roi = (profit / stake) * 100;
    return {
      value: Number(roi.toFixed(2)),
      label: roi.toFixed(1) + "%",
      units: (profit >= 0 ? "+" : "") + profit.toFixed(2) + "u",
      basis: trend.unit_basis || trend.stake_basis || "1 verified unit per source row"
    };
  }

  function strengthRating(trend) {
    var sample = Number(trend.sample) || 0;
    var pct = numberValue(trend.win_percentage || trend.win_pct || trend.dominance);
    if (pct !== null && pct <= 1) pct *= 100;
    var bounds = dateBounds(trend);
    var recencyDays = bounds.last ? Math.max(0, (Date.now() - Date.parse(bounds.last)) / 86400000) : null;
    var rows = sourceRows(trend);
    var sourceComplete = rows.length ? rows.every(function (row) {
      return row.date && (row.opponent || row.raw_game_log) && (row.market_result || row.result || row.bet_result);
    }) : Boolean(Array.isArray(trend.game_log) && trend.game_log.length);
    var text = trendText(trend);
    var marketSpecific = normalize(trend.bet_type) !== "MONEYLINE" || text.indexOf("FAVORITE") !== -1 || text.indexOf("UNDERDOG") !== -1;
    var locationSpecific = ["HOME", "AWAY"].includes(normalize(trend.side)) || Boolean(locationLabel(trend));
    var opponentSpecific = text.indexOf("VS ") !== -1 || text.indexOf("OPPONENT") !== -1 || text.indexOf(".500") !== -1 || text.indexOf("DIVISION") !== -1 || text.indexOf("CONFERENCE") !== -1;
    var score = 0;
    score += sample >= 50 ? 25 : sample >= 25 ? 20 : sample >= 10 ? 12 : 4;
    score += pct >= 80 ? 25 : pct >= 70 ? 20 : pct >= 60 ? 12 : 4;
    score += recencyDays === null ? 4 : recencyDays <= 45 ? 15 : recencyDays <= 120 ? 10 : 4;
    score += sourceComplete ? 15 : 5;
    score += marketSpecific ? 8 : 3;
    score += locationSpecific ? 6 : 2;
    score += opponentSpecific ? 6 : 2;
    var label = score >= 78 ? "Strong" : score >= 58 ? "Solid" : "Developing";
    var reason = [
      sample + " verified games",
      pct ? pct.toFixed(pct % 1 === 0 ? 0 : 1) + "% hit rate" : "hit rate unavailable",
      recencyDays === null ? "recency unavailable" : (recencyDays <= 45 ? "recent sample" : "older sample"),
      sourceComplete ? "complete source rows" : "basic source log",
      marketSpecific ? "market-specific" : "general market",
      locationSpecific ? "home/away-specific" : "all locations",
      opponentSpecific ? "opponent/context-specific" : "general context"
    ].join(", ");
    return { score: score, label: label, reason: reason };
  }

  function explanation(trend) {
    if (trend.why_it_matters) return trend.why_it_matters;
    var record = recordText(trend);
    var pct = pctText(trend);
    return "This trend means " + trend.team_abbr + " matched the stated condition across " + trend.sample + " verified historical games" +
      (record ? " with a " + record + " record" : "") +
      (pct ? " (" + pct + ")" : "") +
      ". The included source games are available in the drilldown.";
  }

  function appliesBecauseList(trend) {
    if (Array.isArray(trend.applies_because) && trend.applies_because.length) {
      return trend.applies_because;
    }
    return [
      "Current opponent: " + (trend.opponent_abbr || "verified current opponent"),
      "Market: " + labelize(trend.bet_type),
      "Sample: " + trend.sample + " verified games"
    ];
  }

  function appliesBecauseHtml(trend) {
    return [
      "<section class=\"ts-applies-box\" aria-label=\"Why this trend applies today\">",
      "  <strong>Applies because:</strong>",
      "  <ul>",
      appliesBecauseList(trend).map(function (reason) {
        return "<li>" + escapeHtml(reason) + "</li>";
      }).join(""),
      "  </ul>",
      "</section>"
    ].join("");
  }

  function renderTrend(trend) {
    var pct = pctText(trend);
    var record = recordText(trend);
    var detailId = "trend-" + Math.abs(hashCode(trendId(trend)));
    var odds = verifiedOddsSummary(trend);
    var roi = verifiedRoi(trend);
    var strength = strengthRating(trend);
    return [
      "<article class=\"ts-result-item\" data-trend-id=\"" + escapeHtml(trendId(trend)) + "\">",
      "  <div class=\"ts-result-label-row\">",
      "    <span class=\"ts-type-label\">" + escapeHtml(labelize(trend.bet_type)) + "</span>",
      "    <span class=\"ts-status-label " + statusClass(trend) + "\">" + escapeHtml(statusLabel(trend)) + "</span>",
      "  </div>",
      "  <p class=\"ts-claim\">" + escapeHtml(trend.claim) + "</p>",
      "  <dl class=\"ts-result-meta\">",
      supportedValue("Sport", trend.sport),
      supportedValue("Market type", labelize(trend.bet_type)),
      supportedValue("Team", trend.team_abbr),
      supportedValue("Opponent / condition", trend.opponent_abbr || trend.subset),
      supportedValue("Sample size", trend.sample),
      supportedValue("Record", record),
      supportedValue("Win percentage", pct),
      supportedValue("Date range", trend.date_range),
      supportedValue("Home/away", labelize(trend.side || locationLabel(trend))),
      supportedValue("Favorite/underdog", trend.favorite_underdog || trend.price_role),
      supportedValue("Average odds", odds ? odds.average + " (range " + odds.range + ")" : ""),
      supportedValue("ROI / units", roi.value == null ? "" : roi.label + (roi.units ? " / " + roi.units : "")),
      supportedValue("Trend Strength", strength.label),
      supportedValue("Source data", sourceSummary(trend)),
      supportedValue("Last verified", trend.last_verified_at || trend.generated_at || cache[state.sport] && cache[state.sport].generated_at),
      supportedValue("Slate status", statusLabel(trend)),
      supportedValue("Artifact slate date", trend.artifact_slate_date || cache[state.sport] && cache[state.sport].artifact_slate_date),
      supportedValue("Staleness reason", trend.staleness_reason),
      "  </dl>",
      appliesBecauseHtml(trend),
      "  <p class=\"ts-explanation\">" + escapeHtml(explanation(trend)) + "</p>",
      "  <p class=\"ts-strength-reason\"><strong>Strength reason:</strong> " + escapeHtml(strength.reason) + "</p>",
      "  <div class=\"ts-card-actions\">",
      "    <button class=\"ts-link-button\" type=\"button\" data-source-id=\"" + escapeHtml(trendId(trend)) + "\">Verified source</button>",
      "    <button class=\"ts-link-button\" type=\"button\" data-detail-toggle=\"" + escapeHtml(detailId) + "\">View Details</button>",
      "  </div>",
      renderInlineDetails(trend, detailId),
      "</article>"
    ].join("");
  }

  function locationLabel(trend) {
    if (normalize(trend.team_abbr) === normalize(trend.home_abbr)) return "Home";
    if (normalize(trend.team_abbr) === normalize(trend.away_abbr)) return "Away";
    return "";
  }

  function renderInlineDetails(trend, detailId) {
    return [
      "<section class=\"ts-detail-panel is-hidden\" id=\"" + escapeHtml(detailId) + "\">",
      "  <h3>" + escapeHtml(trend.claim) + "</h3>",
      "  <p>" + escapeHtml(explanation(trend)) + "</p>",
      "  <dl class=\"ts-detail-grid\">",
      supportedValue("Exact query/filter", queryText()),
      supportedValue("Applies because", appliesBecauseList(trend).join(" | ")),
      supportedValue("Sample size", trend.sample),
      supportedValue("Record", recordText(trend)),
      supportedValue("Win percentage", pctText(trend)),
      supportedValue("ROI", verifiedRoi(trend).value == null ? "" : verifiedRoi(trend).label),
      supportedValue("Units", verifiedRoi(trend).units),
      supportedValue("Average odds", verifiedOddsSummary(trend) ? verifiedOddsSummary(trend).average + " (range " + verifiedOddsSummary(trend).range + ")" : ""),
      supportedValue("Recent form split", trend.recent_form_split),
      supportedValue("Home/away split", trend.home_away_split),
      supportedValue("Market breakdown", trend.market_breakdown || labelize(trend.bet_type)),
      supportedValue("Strength formula", strengthFormulaText()),
      supportedValue("Strength reason", strengthRating(trend).reason),
      supportedValue("Data freshness", cache[state.sport] && cache[state.sport].generated_at),
      supportedValue("Slate status", statusLabel(trend)),
      supportedValue("Artifact slate date", trend.artifact_slate_date || cache[state.sport] && cache[state.sport].artifact_slate_date),
      supportedValue("Staleness reason", trend.staleness_reason),
      "  </dl>",
      "  <h4>Included games</h4>",
      gamesTable(trend),
      "  <h4>Excluded games</h4>",
      excludedTable(trend),
      "</section>"
    ].join("");
  }

  function strengthFormulaText() {
    return "Sample size + hit rate + recency + source completeness + market specificity + home/away specificity + opponent/context specificity.";
  }

  function queryText() {
    var matchup = selectedMatchup();
    return [
      "sport=" + state.sport,
      "matchup=" + (matchup ? matchup.matchup : "none"),
      "market=" + MARKET_TYPES.find(function (item) { return item.id === state.market; }).label,
      "factor=" + FACTORS.find(function (item) { return item.id === state.factor; }).label,
      "mode=" + (state.researchMode === "current" ? "Current Slate" : "Archived Research"),
      "min_sample=" + (state.minSample || 0),
      "min_win_pct=" + (state.minWinPct || 0),
      "team=" + state.team,
      "opponent=" + state.opponent,
      "location=" + state.location,
      "selected_matchup_only=yes",
      "date_start=" + (state.dateStart || "any"),
      "date_end=" + (state.dateEnd || "any")
    ].join(" | ");
  }

  function gamesTable(trend) {
    var rowsData = sourceRows(trend);
    var rows = rowsData.length ? rowsData.map(function (row) {
      return [
        "<tr>",
        "<td>" + escapeHtml(row.date || "Unavailable") + "</td>",
        "<td>" + escapeHtml(row.opponent || row.raw_game_log || "Unavailable") + "</td>",
        "<td>" + escapeHtml(labelize(row.market_result || row.result || row.bet_result || trend.bet_type)) + "</td>",
        "<td>" + escapeHtml(row.odds || row.price || row.moneyline || row.line || row.total_line || "Odds data unavailable from source") + "</td>",
        "<td><a href=\"" + escapeHtml(row.source_url || trend.source_url) + "\" target=\"_blank\" rel=\"noopener\">Schedule / box score source</a></td>",
        "<td>" + escapeHtml(row.why_counted || "Counted because it appears in the verified source rows for this trend condition.") + "</td>",
        "</tr>"
      ].join("");
    }).join("") : (trend.game_log || []).map(function (game, index) {
      var date = Array.isArray(trend.game_dates) ? trend.game_dates[index] : (String(game).match(/\d{4}-\d{2}-\d{2}/) || [""])[0];
      return [
        "<tr>",
        "<td>" + escapeHtml(date || "Unavailable") + "</td>",
        "<td>" + escapeHtml(game) + "</td>",
        "<td>" + escapeHtml(labelize(trend.bet_type)) + "</td>",
        "<td>Odds data unavailable from source</td>",
        "<td><a href=\"" + escapeHtml(trend.source_url) + "\" target=\"_blank\" rel=\"noopener\">Schedule / box score source</a></td>",
        "<td>" + escapeHtml("Counted because it appears in the verified game log for this trend condition.") + "</td>",
        "</tr>"
      ].join("");
    }).join("");
    return [
      "<div class=\"ts-table-wrap\"><table class=\"ts-games-table\">",
      "<thead><tr><th>Date</th><th>Opponent / result</th><th>Market result</th><th>Line / odds</th><th>Source reference</th><th>Why counted</th></tr></thead>",
      "<tbody>" + rows + "</tbody>",
      "</table></div>"
    ].join("");
  }

  function excludedTable(trend) {
    var rowsData = excludedRows(trend);
    if (!rowsData.length) {
      return "<p class=\"ts-muted-line\">No excluded-game rows are available in this verified artifact.</p>";
    }
    var rows = rowsData.map(function (row) {
      return [
        "<tr>",
        "<td>" + escapeHtml(row.date || "Unavailable") + "</td>",
        "<td>" + escapeHtml(row.opponent || row.raw_game_log || "Unavailable") + "</td>",
        "<td>" + escapeHtml(row.reason || row.exclusion_reason || "Unavailable") + "</td>",
        "<td>" + escapeHtml(row.source_url || trend.source_url || "Verified artifact") + "</td>",
        "</tr>"
      ].join("");
    }).join("");
    return [
      "<div class=\"ts-table-wrap\"><table class=\"ts-games-table\">",
      "<thead><tr><th>Date</th><th>Game</th><th>Why excluded</th><th>Source reference</th></tr></thead>",
      "<tbody>" + rows + "</tbody>",
      "</table></div>"
    ].join("");
  }

  function renderResults() {
    state.generated = true;
    var results = filteredResults();
    var matchup = selectedMatchup();
    els.resultsTitle.textContent = matchup ? matchup.matchup + " trend results" : (state.sport || "Verified") + " trend results";
    els.resultCount.textContent = results.length + " trend" + (results.length === 1 ? "" : "s");
    els.resultsSection.classList.remove("is-hidden");
    if (!state.sport) {
      els.resultsList.innerHTML = "<div class=\"ts-no-results\">Select a sport before generating trends.</div>";
      return;
    }
    if (!state.matchup) {
      els.resultsList.innerHTML = "<div class=\"ts-no-results\">Select a matchup before generating trends.</div>";
      return;
    }
    if (!results.length) {
      var data = cache[state.sport] || {};
      if (state.researchMode === "current") {
        var hasCurrentTrends = trendsForSport(state.sport).some(trendIsCurrent);
        if (hasCurrentTrends) {
          els.resultsList.innerHTML = "<div class=\"ts-no-results\">No verified trends match the selected filters yet.</div>";
        } else {
          els.resultsList.innerHTML = "<div class=\"ts-no-results\"><strong>No verified current slate trends are available for this sport right now.</strong><span>" + escapeHtml(data.staleness_reason || ("No verified current " + state.sport + " Trendspotter artifact available.")) + "</span></div>";
        }
      } else {
        els.resultsList.innerHTML = "<div class=\"ts-no-results\"><strong>No archived research matches the selected filters.</strong><span>Archived research appears only when the artifact is clearly labeled as archived or stale.</span></div>";
      }
      return;
    }
    els.resultsList.innerHTML = results.map(renderTrend).join("");
  }

  function findTrend(id) {
    return trendsForSport(state.sport).find(function (trend) {
      return trendId(trend) === id;
    });
  }

  function openSourceModal(trend) {
    els.sourceModalTitle.textContent = "Verified source data";
    els.sourceModalBody.innerHTML = [
      "<p class=\"ts-modal-claim\">" + escapeHtml(trend.claim) + "</p>",
      "<dl class=\"ts-detail-grid\">",
      supportedValue("Source URL", trend.source_url),
      supportedValue("Source data", sourceSummary(trend)),
      supportedValue("Last verified", trend.last_verified_at || cache[state.sport] && cache[state.sport].generated_at),
      supportedValue("Slate status", statusLabel(trend)),
      supportedValue("Artifact slate date", trend.artifact_slate_date || cache[state.sport] && cache[state.sport].artifact_slate_date),
      supportedValue("Staleness reason", trend.staleness_reason),
      supportedValue("Why games counted", "Each row is present in the verified artifact game_log for the trend condition."),
      supportedValue("Odds status", verifiedOddsSummary(trend) ? "Verified row-level odds available." : "Odds data unavailable from source."),
      supportedValue("ROI status", verifiedRoi(trend).value == null ? "ROI hidden because verified odds/results/unit basis are incomplete." : "ROI calculated from verified odds, results, and unit basis."),
      "  </dl>",
      gamesTable(trend),
      "<h4>Excluded games</h4>",
      excludedTable(trend)
    ].join("");
    els.sourceModal.classList.remove("is-hidden");
    els.sourceModal.setAttribute("aria-hidden", "false");
  }

  function closeSourceModal() {
    els.sourceModal.classList.add("is-hidden");
    els.sourceModal.setAttribute("aria-hidden", "true");
  }

  function hashCode(value) {
    var hash = 0;
    for (var i = 0; i < value.length; i += 1) {
      hash = ((hash << 5) - hash) + value.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  function onFilterChange(event) {
    var target = event.target;
    if (target === els.marketType) state.market = target.value;
    if (target === els.matchupFilter) {
      state.matchup = target.value;
      state.team = "both";
      state.opponent = "all";
      state.generated = false;
      clearResults();
      renderTeamFilters();
    }
    if (target === els.trendFactor) state.factor = target.value;
    if (target === els.minSample) state.minSample = target.value;
    if (target === els.minWinPct) state.minWinPct = target.value;
    if (target === els.dateStart) state.dateStart = target.value;
    if (target === els.dateEnd) state.dateEnd = target.value;
    if (target === els.teamFilter) state.team = target.value;
    if (target === els.opponentFilter) state.opponent = target.value;
    if (target === els.locationFilter) state.location = target.value;
    if (target === els.researchMode) {
      state.researchMode = target.value;
      renderMatchupFilter();
      renderTeamFilters();
    }
    if (target === els.sortBy) state.sort = target.value;
    if (target === els.currentMatchupOnly) state.currentMatchupOnly = true;
    updateSummary();
    if (state.generated) renderResults();
  }

  document.addEventListener("click", function (event) {
    var sportButton = event.target.closest("[data-sport]");
    if (sportButton) {
      selectSport(sportButton.getAttribute("data-sport"));
      return;
    }
    var sourceButton = event.target.closest("[data-source-id]");
    if (sourceButton) {
      var trend = findTrend(sourceButton.getAttribute("data-source-id"));
      if (trend) openSourceModal(trend);
      return;
    }
    var detailButton = event.target.closest("[data-detail-toggle]");
    if (detailButton) {
      var panel = document.getElementById(detailButton.getAttribute("data-detail-toggle"));
      if (panel) panel.classList.toggle("is-hidden");
      return;
    }
    if (event.target.closest("[data-close-source]") || event.target.classList.contains("ts-modal-backdrop")) {
      closeSourceModal();
    }
  });

  [els.matchupFilter, els.marketType, els.trendFactor, els.minSample, els.minWinPct, els.dateStart, els.dateEnd, els.teamFilter, els.opponentFilter, els.locationFilter, els.researchMode, els.sortBy, els.currentMatchupOnly].forEach(function (el) {
    el.addEventListener("change", onFilterChange);
    el.addEventListener("input", onFilterChange);
  });
  els.runButton.addEventListener("click", renderResults);

  renderSelects();
  renderSportOptions();
  renderMatchupFilter();
  renderTeamFilters();
  updateSummary();
})();
