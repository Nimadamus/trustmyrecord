(function () {
  "use strict";

  var SPORTS = ["MLB", "NBA", "NFL", "NHL", "NCAAB", "NCAAF"];
  var BOARD_KEYS = {
    MLB: "baseball_mlb",
    NBA: "basketball_nba",
    NFL: "americanfootball_nfl",
    NHL: "icehockey_nhl",
    NCAAB: "basketball_ncaab",
    NCAAF: "americanfootball_ncaaf"
  };
  var MARKETS = [
    { id: "moneyline", label: "Moneyline", aliases: ["MONEYLINE", "ML", "H2H"], sides: "teams", requiresTeam: false, needsThreshold: false, periods: ["full_game", "first_half"] },
    { id: "spread", label: "Spread", aliases: ["SPREAD", "ATS", "RUN_LINE", "PUCK_LINE"], sides: "teams", requiresTeam: false, needsThreshold: true, periods: ["full_game", "first_half"] },
    { id: "total", label: "Total", aliases: ["TOTAL", "GAME_TOTAL"], sides: "over_under", requiresTeam: false, needsThreshold: true, periods: ["full_game", "first_half"] },
    { id: "team_total", label: "Team Total", aliases: ["TEAM_TOTAL", "TEAM TOTAL"], sides: "over_under", requiresTeam: true, needsThreshold: true, periods: ["full_game"], requiresSourceRows: true, disabledReason: "Team total trends require verified team-total source rows for the selected sport." },
    { id: "first_half", label: "First Half", aliases: ["FIRST_HALF", "FIRST HALF", "1H", "HALF"], sides: "market_side", requiresTeam: false, needsThreshold: false, periods: ["first_half"], disabled: true, disabledReason: "First half trends are disabled until verified period-specific source rows are connected." },
    { id: "first_five", label: "First Five", aliases: ["FIRST_FIVE", "FIRST 5", "F5"], sides: "market_side", requiresTeam: false, needsThreshold: false, periods: ["first_five"], sportOnly: "MLB", disabled: true, disabledReason: "First Five trends are disabled until verified MLB F5 source rows are connected." },
    { id: "props", label: "Props", disabled: true, disabledReason: "Props are hidden until verified support exists." }
  ];
  var PERIODS = {
    full_game: "Full game",
    first_half: "First half",
    first_five: "First five innings"
  };
  var SAFE_MESSAGES = {
    sourceMissing: "Verified trend data is unavailable for this selection.",
    selectToLoad: "Select a sport and matchup to load verified trend data.",
    noData: "No verified trend available for these inputs.",
    unavailable: "Trend calculation unavailable until dataset is connected.",
    noStrong: "No strong trend found for the selected variables.",
    smallSample: "Small sample warning: this query does not meet the requested minimum sample."
  };
  var FORBIDDEN_OUTPUT = [
    /\bfake\b/i,
    /\broi\b/i,
    /\bwin rate\b/i,
    /\bwin percentage\b/i,
    /\brecord\b/i,
    /\bprediction\b/i,
    /\bbacktest\b/i,
    /\bleaderboard\b/i,
    /\bmarketplace\b/i,
    /\bpublic claim\b/i,
    /\bbetting edge\b/i
  ];
  var SOURCE_LABELS = {
    source_backed: { key: "source-backed", label: "Source-backed" },
    partial: { key: "partial", label: "Partial" },
    blocked: { key: "blocked", label: "Blocked" },
    unsupported: { key: "unsupported", label: "Unsupported" },
    estimated: { key: "estimated", label: "Estimated" }
  };
  var TREND_KINDS = {
    moneyline: [
      { id: "team_win", label: "Team win trend", tokens: ["RECENT_FORM", "MONEYLINE"] },
      { id: "home_road", label: "Home / road split", tokens: ["HOME", "AWAY"] },
      { id: "favorite", label: "Favorite trend", disabled: true, reason: "Favorite/underdog role data is not connected yet." },
      { id: "underdog", label: "Underdog trend", disabled: true, reason: "Favorite/underdog role data is not connected yet." },
      { id: "after_win", label: "After a win", disabled: true, reason: "Previous-result sequence data is not connected yet." },
      { id: "after_loss", label: "After a loss", disabled: true, reason: "Previous-result sequence data is not connected yet." },
      { id: "head_to_head", label: "Head to head", disabled: true, reason: "Head-to-head dataset is not connected yet." }
    ],
    spread: [
      { id: "ats", label: "ATS trend", tokens: ["SPREAD", "ATS", "RUN_LINE", "PUCK_LINE"] },
      { id: "home_road_ats", label: "Home / road ATS", tokens: ["HOME", "AWAY", "SPREAD", "ATS"] },
      { id: "favorite_ats", label: "Favorite ATS", disabled: true, reason: "Favorite/underdog role data is not connected yet." },
      { id: "underdog_ats", label: "Underdog ATS", disabled: true, reason: "Favorite/underdog role data is not connected yet." },
      { id: "head_to_head_ats", label: "Head to head ATS", disabled: true, reason: "Head-to-head dataset is not connected yet." }
    ],
    total: [
      { id: "full_game_over_under", label: "Full game over / under", tokens: ["TOTAL", "SCORING"] },
      { id: "recent_over_under", label: "Recent games over / under", tokens: ["RECENT_FORM", "SCORING", "TOTAL"] },
      { id: "home_road_over_under", label: "Home / road over / under", tokens: ["HOME", "AWAY", "TOTAL"] },
      { id: "head_to_head_over_under", label: "Head to head over / under", disabled: true, reason: "Head-to-head dataset is not connected yet." }
    ],
    team_total: [
      { id: "team_total_over_under", label: "Team total over / under", tokens: ["TEAM_TOTAL", "TEAM TOTAL"] },
      { id: "home_road_team_total", label: "Home / road team total", disabled: true, reason: "Team-total split data is not connected yet." }
    ],
    first_half: [
      { id: "first_half_market", label: "First half trend", tokens: ["FIRST_HALF", "FIRST HALF", "1H", "HALF"] }
    ],
    first_five: [
      { id: "first_five_market", label: "First five trend", tokens: ["FIRST_FIVE", "FIRST 5", "F5"] }
    ]
  };

  var state = {
    sport: "",
    matchupKey: "",
    market: "",
    side: "",
    team: "",
    threshold: "",
    trendKind: "",
    period: "full_game",
    range: "source_window",
    minSample: 10,
    location: "all",
    loading: false,
    generated: false
  };
  var cache = {};

  var els = {
    sport: document.getElementById("sportSelect"),
    matchup: document.getElementById("matchupSelect"),
    matchupDataSource: document.getElementById("matchupDataSource"),
    marketOptions: document.getElementById("marketOptions"),
    marketDataNote: document.getElementById("marketDataNote"),
    sideField: document.getElementById("sideField"),
    side: document.getElementById("sideSelect"),
    teamField: document.getElementById("teamField"),
    team: document.getElementById("teamSelect"),
    thresholdField: document.getElementById("thresholdField"),
    threshold: document.getElementById("thresholdInput"),
    trendKindField: document.getElementById("trendKindField"),
    trendKind: document.getElementById("trendKindSelect"),
    periodField: document.getElementById("periodField"),
    period: document.getElementById("periodSelect"),
    range: document.getElementById("rangeSelect"),
    sample: document.getElementById("sampleInput"),
    location: document.getElementById("locationSelect"),
    validation: document.getElementById("validationMessage"),
    summary: document.getElementById("selectionSummary"),
    dataStatus: document.getElementById("dataStatus"),
    generate: document.getElementById("generateTrend"),
    resultsSection: document.getElementById("resultsSection"),
    resultsTitle: document.getElementById("resultsTitle"),
    resultCount: document.getElementById("resultCount"),
    resultsList: document.getElementById("resultsList")
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

  function currentDateIso() {
    var now = new Date();
    return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  }

  function slateDateOf(value) {
    var raw = value && (value.slate_date || value.artifact_slate_date || value.game_date || value.matchup_date || value.commence_time || value.date);
    var match = String(raw || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? match[1] + "-" + match[2] + "-" + match[3] : "";
  }

  function marketById(id) {
    return MARKETS.find(function (market) { return market.id === id; }) || null;
  }

  function selectedMarket() {
    return marketById(state.market);
  }

  function trendKindsForMarket(marketId) {
    return TREND_KINDS[marketId] || [];
  }

  function selectedTrendKind() {
    return trendKindsForMarket(state.market).find(function (kind) { return kind.id === state.trendKind; }) || null;
  }

  function matchupKey(matchup) {
    return [matchup.sport, matchup.matchup, matchup.away_abbr, matchup.home_abbr, matchup.slate_date || ""].map(normalize).join("|");
  }

  function selectedMatchup() {
    return matchupsForSport(state.sport).find(function (matchup) {
      return matchup.key === state.matchupKey;
    }) || null;
  }

  function safeText(value) {
    var text = String(value == null ? "" : value);
    return FORBIDDEN_OUTPUT.some(function (pattern) { return pattern.test(text); }) ? "" : text;
  }

  function hasEstimatedData(value) {
    if (!value || typeof value !== "object") return false;
    try {
      return /estimated/i.test(JSON.stringify(value));
    } catch (error) {
      return false;
    }
  }

  function sourceLabel(key) {
    return SOURCE_LABELS[key] || SOURCE_LABELS.blocked;
  }

  function sourceClassification(data) {
    if (!data || data.status === "error") return Object.assign({}, SOURCE_LABELS.blocked, { detail: "Verified trend source could not be loaded." });
    if (data.source_classification === "estimated") return Object.assign({}, SOURCE_LABELS.estimated, { detail: "Estimated data is labeled and excluded from verified/source-backed output." });
    if (data.intentional_unavailable || data.source === "release_scope_guard") return Object.assign({}, SOURCE_LABELS.unsupported, { detail: data.unavailable_reason || "This sport or market is outside the current release scope." });
    if (data.estimated_totals_policy && data.estimated_totals_policy.status === "blocked" && Number(data.estimated_totals_policy.blocked_rows || 0) > 0) {
      return Object.assign({}, SOURCE_LABELS.partial, { detail: data.estimated_totals_policy.message || "Estimated lines were excluded from verified trend output." });
    }
    if (data.source_classification === "source_backed" || data.source === "source_backed_historical_database" || data.source === "verified_trendspotter_artifact") {
      return Object.assign({}, SOURCE_LABELS.source_backed, { detail: data.source_classification_detail || "Completed source rows with final scores are available." });
    }
    if (data.status === "missing" || data.status === "insufficient_data") return Object.assign({}, SOURCE_LABELS.partial, { detail: "Verified source exists only for supported inputs with enough completed rows." });
    return Object.assign({}, SOURCE_LABELS.blocked, { detail: "Trend calculation unavailable until dataset is connected." });
  }

  function trendSourceClassification(trend) {
    if (hasEstimatedData(trend)) return SOURCE_LABELS.estimated.label + ": excluded from verified/source-backed output";
    if (trend && trend.source_classification === "source_backed") {
      return SOURCE_LABELS.source_backed.label + ": " + (trend.source_classification_detail || "completed games with final scores");
    }
    return SOURCE_LABELS.source_backed.label;
  }

  function trendsForSport(sport) {
    var data = cache[sport];
    if (!data || !Array.isArray(data.trends)) return [];
    return data.trends.filter(function (trend) {
      return trend && typeof trend === "object" &&
        !hasEstimatedData(trend) &&
        trend.sport && trend.matchup && trend.bet_type &&
        trend.team_abbr && trend.opponent_abbr &&
        Number(trend.sample) > 0 &&
        (Array.isArray(trend.source_rows) || Array.isArray(trend.included_games) || Array.isArray(trend.game_log));
    });
  }

  function matchupFromTrend(trend) {
    return {
      sport: trend.sport,
      matchup: trend.matchup,
      away_abbr: trend.away_abbr,
      home_abbr: trend.home_abbr,
      slate_date: trend.slate_date || trend.artifact_slate_date || "",
      game_time: trend.game_time || "",
      source: "verified_trendspotter",
      trend_count: 1
    };
  }

  function matchupsForSport(sport) {
    if (!sport) return [];
    var data = cache[sport] || {};
    var listed = Array.isArray(data.matchups) ? data.matchups : [];
    var live = Array.isArray(data.live_matchups) ? data.live_matchups : [];
    var derived = trendsForSport(sport).map(matchupFromTrend);
    var byKey = new Map();
    listed.concat(live).concat(derived).forEach(function (matchup) {
      if (!matchup || !matchup.matchup || !matchup.away_abbr || !matchup.home_abbr) return;
      var item = Object.assign({}, matchup, { sport: sport, key: matchupKey(Object.assign({ sport: sport }, matchup)) });
      var current = byKey.get(item.key);
      byKey.set(item.key, Object.assign({}, current || {}, item, {
        trend_count: Math.max(Number(current && current.trend_count) || 0, Number(item.trend_count) || 0)
      }));
    });
    return Array.from(byKey.values()).sort(function (a, b) {
      return String(a.game_time || a.matchup).localeCompare(String(b.game_time || b.matchup));
    });
  }

  function sourceRows(trend) {
    if (Array.isArray(trend.source_rows)) return trend.source_rows;
    if (Array.isArray(trend.included_games)) return trend.included_games;
    if (Array.isArray(trend.game_log)) {
      return trend.game_log.map(function (game, index) {
        return { date: Array.isArray(trend.game_dates) ? trend.game_dates[index] : "", detail: game };
      });
    }
    return [];
  }

  function numericLine(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function lineValuesForTrend(trend, market) {
    var values = [];
    var fields = market && market.id === "total"
      ? ["total_line", "line", "threshold", "closing_total", "source_total_line"]
      : market && market.id === "team_total"
        ? ["team_total_line", "source_team_total_line"]
        : ["spread_line", "line", "threshold", "source_spread_line"];
    fields.forEach(function (field) {
      var value = numericLine(trend && trend[field]);
      if (value !== null) values.push(value);
    });
    sourceRows(trend).forEach(function (row) {
      fields.forEach(function (field) {
        var value = numericLine(row && row[field]);
        if (value !== null) values.push(value);
      });
    });
    return values;
  }

  function thresholdMatchesTrend(trend, market) {
    if (!market || !market.needsThreshold) return true;
    var selected = numericLine(state.threshold);
    if (selected === null) return false;
    var values = lineValuesForTrend(trend, market);
    if (!values.length) return false;
    return values.some(function (value) { return Math.abs(value - selected) <= 0.001; });
  }

  function marketMatches(trend, market) {
    if (!market || !market.aliases) return false;
    var body = normalize([trend.bet_type, trend.market, trend.trend_type, trend.kind, trend.claim].join(" "));
    return market.aliases.some(function (alias) { return body.indexOf(normalize(alias)) !== -1; });
  }

  function marketHasSourceRows(market) {
    if (!market || !market.requiresSourceRows || !state.sport) return !market || !market.requiresSourceRows;
    return trendsForSport(state.sport).some(function (trend) {
      if (trend.source_classification !== "source_backed" || !marketMatches(trend, market) || !sourceRows(trend).length) return false;
      if (market.id === "team_total") return lineValuesForTrend(trend, market).length > 0;
      return true;
    });
  }

  function marketDisabledReason(market) {
    if (!market) return "";
    if (market.disabled) return market.disabledReason || SOURCE_LABELS.unsupported.label;
    if (market.sportOnly && state.sport && state.sport !== market.sportOnly) return market.label + " is supported only for " + market.sportOnly + ".";
    if (market.requiresSourceRows && !marketHasSourceRows(market)) return market.disabledReason || "Verified source rows are not available for this market.";
    return "";
  }

  function marketIsDisabled(market) {
    return Boolean(marketDisabledReason(market));
  }

  function trendMatchesQuery(trend) {
    var matchup = selectedMatchup();
    var market = selectedMarket();
    var trendKind = selectedTrendKind();
    if (!matchup || !market || marketIsDisabled(market) || !trendKind || trendKind.disabled) return false;
    var home = normalize(matchup.home_abbr);
    var away = normalize(matchup.away_abbr);
    var team = normalize(trend.team_abbr);
    if (normalize(trend.matchup) !== normalize(matchup.matchup)) return false;
    if (![home, away].includes(team)) return false;
    if (!marketMatches(trend, market)) return false;
    if (!thresholdMatchesTrend(trend, market)) return false;
    if (trendKind.tokens && trendKind.tokens.length) {
      var kindBody = normalize([trend.kind, trend.trend_type, trend.subset, trend.label, trend.claim, trend.bet_type, trend.market].join(" "));
      if (!trendKind.tokens.some(function (token) { return kindBody.indexOf(normalize(token)) !== -1; })) return false;
    }
    if (state.team && normalize(state.team) !== team) return false;
    if (state.side && ["home", "away"].includes(state.side)) {
      if (state.side === "home" && team !== home) return false;
      if (state.side === "away" && team !== away) return false;
    }
    if (state.side && ["over", "under"].includes(state.side)) {
      var body = normalize([trend.claim, trend.side, trend.subset].join(" "));
      if (body.indexOf(normalize(state.side)) === -1) return false;
    }
    if (state.location === "home" && team !== home) return false;
    if (state.location === "away" && team !== away) return false;
    if (state.range !== "source_window") return false;
    if (market.id === "first_half" && state.period !== "first_half") return false;
    if (market.id === "first_five" && state.period !== "first_five") return false;
    return true;
  }

  function bestResult() {
    return trendsForSport(state.sport)
      .filter(trendMatchesQuery)
      .sort(function (a, b) { return (Number(b.sample) || 0) - (Number(a.sample) || 0); })[0] || null;
  }

  function renderMarketOptions() {
    els.marketOptions.innerHTML = MARKETS.map(function (market) {
      var reason = marketDisabledReason(market);
      var disabled = Boolean(reason);
      return [
        "<button class=\"ts-market-card" + (state.market === market.id ? " is-selected" : "") + (disabled ? " is-disabled" : "") + "\" type=\"button\" role=\"radio\" aria-checked=\"" + (state.market === market.id ? "true" : "false") + "\" data-market=\"" + escapeHtml(market.id) + "\"" + (disabled ? " disabled" : "") + ">",
        "  <strong>" + escapeHtml(market.label) + "</strong>",
        "  <span>" + escapeHtml(disabled ? reason : marketDescription(market)) + "</span>",
        "</button>"
      ].join("");
    }).join("");
  }

  function marketDescription(market) {
    if (market.id === "moneyline") return "Team side only. No total-points fields.";
    if (market.id === "spread") return "Team side plus spread threshold.";
    if (market.id === "total") return "Over/under plus game-total threshold.";
    if (market.id === "team_total") return "Requires team, over/under, and team-total threshold.";
    if (market.id === "first_half") return "First half market context when supported by data.";
    if (market.id === "first_five") return "MLB first five innings only.";
    return SOURCE_LABELS.unsupported.label + " until verified.";
  }

  function renderMatchups() {
    if (!state.sport) {
      els.matchup.innerHTML = "<option value=\"\">Select a sport first</option>";
      els.matchup.disabled = true;
      els.matchupDataSource.textContent = "Matchups load from TrustMyRecord schedule and verified Trend Spotter artifacts when available.";
      return;
    }
    var matchups = matchupsForSport(state.sport);
    if (!matchups.length) {
      els.matchup.innerHTML = "<option value=\"\">No matchup data available</option>";
      els.matchup.disabled = true;
      els.matchupDataSource.textContent = "No verified matchup data is available for this sport right now.";
      return;
    }
    if (!matchups.some(function (matchup) { return matchup.key === state.matchupKey; })) state.matchupKey = "";
    els.matchup.disabled = false;
    els.matchup.innerHTML = "<option value=\"\">Choose matchup</option>" + matchups.map(function (matchup) {
      var label = matchup.matchup + (matchup.game_time ? " / " + matchup.game_time : "");
      return "<option value=\"" + escapeHtml(matchup.key) + "\"" + (state.matchupKey === matchup.key ? " selected" : "") + ">" + escapeHtml(label) + "</option>";
    }).join("");
    var data = cache[state.sport] || {};
    els.matchupDataSource.textContent = data.matchup_source || "Matchups are loaded from verified Trend Spotter artifacts or the TrustMyRecord schedule board.";
  }

  function renderSides() {
    var matchup = selectedMatchup();
    var market = selectedMarket();
    els.teamField.classList.add("is-hidden");
    els.thresholdField.classList.add("is-hidden");
    els.side.disabled = true;
    els.team.disabled = true;
    if (!matchup || !market || marketIsDisabled(market)) {
      els.side.innerHTML = "<option value=\"\">Select matchup and trend type first</option>";
      els.team.innerHTML = "";
      return;
    }
    var away = matchup.away_abbr;
    var home = matchup.home_abbr;
    els.side.disabled = false;
    if (market.sides === "teams") {
      els.side.innerHTML = [
        "<option value=\"\">Choose side</option>",
        "<option value=\"away\"" + (state.side === "away" ? " selected" : "") + ">" + escapeHtml(away + " away") + "</option>",
        "<option value=\"home\"" + (state.side === "home" ? " selected" : "") + ">" + escapeHtml(home + " home") + "</option>"
      ].join("");
      state.team = "";
    } else if (market.sides === "over_under") {
      els.side.innerHTML = [
        "<option value=\"\">Choose side</option>",
        "<option value=\"over\"" + (state.side === "over" ? " selected" : "") + ">Over</option>",
        "<option value=\"under\"" + (state.side === "under" ? " selected" : "") + ">Under</option>"
      ].join("");
    } else {
      els.side.innerHTML = [
        "<option value=\"\">Choose side</option>",
        "<option value=\"moneyline\"" + (state.side === "moneyline" ? " selected" : "") + ">Moneyline</option>",
        "<option value=\"spread\"" + (state.side === "spread" ? " selected" : "") + ">Spread</option>",
        "<option value=\"total\"" + (state.side === "total" ? " selected" : "") + ">Total</option>"
      ].join("");
    }
    if (market.requiresTeam) {
      els.teamField.classList.remove("is-hidden");
      els.team.disabled = false;
      els.team.innerHTML = [
        "<option value=\"\">Choose team</option>",
        "<option value=\"" + escapeHtml(away) + "\"" + (state.team === away ? " selected" : "") + ">" + escapeHtml(away + " away") + "</option>",
        "<option value=\"" + escapeHtml(home) + "\"" + (state.team === home ? " selected" : "") + ">" + escapeHtml(home + " home") + "</option>"
      ].join("");
    }
    if (market.needsThreshold) {
      els.thresholdField.classList.remove("is-hidden");
    }
  }

  function renderTrendKinds() {
    var market = selectedMarket();
    var kinds = market && !marketIsDisabled(market) ? trendKindsForMarket(market.id) : [];
    els.trendKind.disabled = !kinds.length;
    if (!kinds.length) {
      els.trendKind.innerHTML = "<option value=\"\">Select trend type first</option>";
      state.trendKind = "";
      return;
    }
    if (!kinds.some(function (kind) { return kind.id === state.trendKind && !kind.disabled; })) {
      state.trendKind = "";
    }
    els.trendKind.innerHTML = "<option value=\"\">Choose trend search</option>" + kinds.map(function (kind) {
      var label = kind.label + (kind.disabled && kind.reason ? " - " + kind.reason : "");
      return "<option value=\"" + escapeHtml(kind.id) + "\"" + (state.trendKind === kind.id ? " selected" : "") + (kind.disabled ? " disabled" : "") + ">" + escapeHtml(label) + "</option>";
    }).join("");
  }

  function renderPeriods() {
    var market = selectedMarket();
    var periods = market && market.periods ? market.periods.slice() : ["full_game"];
    if (market && market.id === "first_five" && state.sport !== "MLB") periods = [];
    if (!periods.includes(state.period)) state.period = periods[0] || "";
    els.period.innerHTML = periods.length
      ? periods.map(function (id) { return "<option value=\"" + escapeHtml(id) + "\"" + (state.period === id ? " selected" : "") + ">" + escapeHtml(PERIODS[id]) + "</option>"; }).join("")
      : "<option value=\"\">Unsupported</option>";
    els.period.disabled = !periods.length;
  }

  function validationErrors() {
    var errors = [];
    var market = selectedMarket();
    var trendKind = selectedTrendKind();
    if (!state.sport) errors.push("no matchup selected");
    if (state.sport && !state.matchupKey) errors.push("no matchup selected");
    if (!state.market) errors.push("no trend type selected");
    if (market && marketIsDisabled(market)) errors.push("invalid combination");
    if (market && market.sportOnly && state.sport !== market.sportOnly) errors.push("invalid combination");
    if (market && !marketIsDisabled(market) && !state.trendKind) errors.push("missing trend search");
    if (trendKind && trendKind.disabled) errors.push("invalid combination");
    if (market && !marketIsDisabled(market) && !state.side) errors.push("missing required variables");
    if (market && market.requiresTeam && !state.team) errors.push("missing required variables");
    if (market && market.needsThreshold && state.threshold === "") errors.push("missing required variables");
    if (market && market.needsThreshold && state.threshold !== "" && !Number.isFinite(Number(state.threshold))) errors.push("invalid combination");
    if (state.range !== "source_window") errors.push("invalid combination");
    if (Number(state.minSample) < 1) errors.push("missing required variables");
    return errors;
  }

  function querySummary() {
    var matchup = selectedMatchup();
    var market = selectedMarket();
    var trendKind = selectedTrendKind();
    return [
      state.sport || "Sport not selected",
      matchup ? matchup.matchup : "Matchup not selected",
      market ? market.label : "Trend type not selected",
      trendKind ? "Search: " + trendKind.label : "Choose trend search",
      state.side ? "Side: " + state.side : "Side not selected",
      state.team ? "Team: " + state.team : "",
      state.threshold !== "" ? "Line: " + state.threshold : "",
      state.period ? PERIODS[state.period] : "",
      "Range: " + state.range,
      "Min sample: " + state.minSample,
      "Location: " + state.location
    ].filter(Boolean).join(" / ");
  }

  function updateUi() {
    renderMarketOptions();
    renderMatchups();
    renderSides();
    renderTrendKinds();
    renderPeriods();
    var errors = validationErrors();
    els.summary.textContent = querySummary();
    els.generate.disabled = Boolean(errors.length || state.loading);
    els.validation.textContent = errors.length ? validationMessage(errors[0]) : "Ready to generate. Output will stay empty unless verified data supports the selected query.";
    var data = cache[state.sport] || {};
    var classification = sourceClassification(data);
    els.dataStatus.textContent = state.loading
      ? "Loading verified trend data..."
      : data.status
        ? "Trend source status: " + data.status + ". Classification: " + classification.label + ". " + classification.detail
        : SAFE_MESSAGES.selectToLoad;
    if (state.generated) renderResults();
  }

  function validationMessage(error) {
    if (error === "no matchup selected") return "Select a sport and matchup before generating.";
    if (error === "no trend type selected") return "Select a trend type before generating.";
    if (error === "missing trend search") return "Select the kind of trend you want to search for.";
    if (error === "missing required variables") return "Missing required variables for this market.";
    if (error === "invalid combination") return "Invalid combination for the selected sport or market.";
    return "Trend calculation unavailable until dataset is connected.";
  }

  async function loadSport(sport) {
    state.loading = true;
    updateUi();
    cache[sport] = cache[sport] || {};
    try {
      var response = await fetch(apiBase() + "/trendspotter/verified?sport=" + encodeURIComponent(sport) + "&_=" + Date.now(), {
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      cache[sport] = await response.json().catch(function () { return { status: "missing", trends: [] }; });
    } catch (error) {
      cache[sport] = { status: "error", trends: [], matchups: [], unavailable_data: [error.message] };
    }
    if (!matchupsForSport(sport).length) {
      await loadBoardMatchups(sport);
    }
    state.loading = false;
    updateUi();
  }

  async function loadBoardMatchups(sport) {
    var boardKey = BOARD_KEYS[sport];
    if (!boardKey) return;
    try {
      var response = await fetch(apiBase() + "/games/board/" + encodeURIComponent(boardKey), {
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      var data = await response.json().catch(function () { return {}; });
      var games = Array.isArray(data.games) ? data.games : Array.isArray(data) ? data : [];
      cache[sport].live_matchups = games.filter(function (game) {
        return game && game.away_team && game.home_team;
      }).map(function (game) {
        return {
          sport: sport,
          matchup: game.away_team + " @ " + game.home_team,
          away_abbr: game.away_team,
          home_abbr: game.home_team,
          slate_date: slateDateOf(game) || currentDateIso(),
          game_time: game.commence_time || "",
          source: "games_board",
          trend_count: 0
        };
      });
      cache[sport].matchup_source = cache[sport].live_matchups.length
        ? "Live schedule matchups loaded. Verified trend results still require matching Trend Spotter data."
        : "No schedule matchups are available for this sport right now.";
    } catch (error) {
      cache[sport].live_matchups = [];
      cache[sport].matchup_source = "Error state: schedule matchups could not be loaded.";
    }
  }

  function renderResults() {
    state.generated = true;
    els.resultsSection.classList.remove("is-hidden");
    els.resultsTitle.textContent = "Trend Result";
    var errors = validationErrors();
    if (errors.length) {
      els.resultCount.textContent = SOURCE_LABELS.blocked.label;
      els.resultsList.innerHTML = safeStateHtml(validationMessage(errors[0]), querySummary(), SOURCE_LABELS.blocked);
      return;
    }
    var data = cache[state.sport] || {};
    var classification = sourceClassification(data);
    if (data.status === "error") {
      els.resultCount.textContent = "Error";
      els.resultsList.innerHTML = safeStateHtml("Error state: verified trend source could not be loaded.", querySummary(), classification);
      return;
    }
    var trend = bestResult();
    if (!trend) {
      els.resultCount.textContent = "No verified trend";
      var hasData = trendsForSport(state.sport).length > 0;
      els.resultsList.innerHTML = safeStateHtml(hasData ? SAFE_MESSAGES.noStrong : SAFE_MESSAGES.noData, querySummary(), classification);
      return;
    }
    if ((Number(trend.sample) || 0) < Number(state.minSample || 0)) {
      els.resultCount.textContent = "Small sample";
      els.resultsList.innerHTML = safeStateHtml(SAFE_MESSAGES.smallSample, querySummary(), SOURCE_LABELS.partial);
      return;
    }
    els.resultCount.textContent = "Verified sample: " + Number(trend.sample || 0);
    els.resultsList.innerHTML = trendResultHtml(trend);
  }

  function safeStateHtml(message, summary, classification) {
    var label = typeof classification === "string" ? { label: classification, key: normalize(classification).toLowerCase() } : (classification || SOURCE_LABELS.blocked);
    return [
      "<article class=\"ts-no-results\" data-state=\"safe-no-data\" data-source-label=\"" + escapeHtml(label.key || "blocked") + "\">",
      "  <span class=\"ts-source-label\">" + escapeHtml(label.label || SOURCE_LABELS.blocked.label) + "</span>",
      "  <strong>" + escapeHtml(message) + "</strong>",
      "  <span>Query: " + escapeHtml(summary) + "</span>",
      "  <span>Source classification: " + escapeHtml(label.label || SOURCE_LABELS.blocked.label) + "</span>",
      "  <span>Trend Spotter will not invent unsupported results or performance-style claims when verified source data is unavailable.</span>",
      "</article>"
    ].join("");
  }

  function resultCounts(rows) {
    var wins = 0;
    var losses = 0;
    var pushes = 0;
    rows.forEach(function (row) {
      var result = normalize(row.market_result || row.result);
      if (result === "WIN") wins += 1;
      else if (result === "LOSS") losses += 1;
      else if (result === "PUSH") pushes += 1;
    });
    return {
      wins: wins,
      losses: losses,
      pushes: pushes,
      text: wins + " matching, " + losses + " non-matching" + (pushes ? ", " + pushes + " pushes" : "")
    };
  }

  function usefulnessLabel(sample) {
    var size = Number(sample) || 0;
    if (size < Number(state.minSample || 0)) return "Small sample";
    if (size >= 20) return "Moderate";
    if (size >= 10) return "Limited";
    return "Small sample";
  }

  function trendResultHtml(trend) {
    var matchup = selectedMatchup();
    var rows = sourceRows(trend);
    var counts = resultCounts(rows);
    var market = selectedMarket();
    var trendKind = selectedTrendKind();
    var sample = Number(trend.sample || rows.length || 0);
    var plainSummary = "Verified " + market.label + " source rows matched " + (trend.team_abbr || state.team || state.side || "the selected side") + " for " + (matchup && matchup.matchup) + " using " + (trendKind ? trendKind.label : "the selected trend search") + ".";
    var note = sample ? plainSummary : safeText(trend.safe_summary || trend.summary || trend.claim) || "Verified trend data matched the selected inputs. Detailed performance claims are hidden until the dataset contract explicitly supports them.";
    return [
      "<article class=\"ts-result-item\" data-result=\"verified-trend\" data-source-label=\"" + escapeHtml(SOURCE_LABELS.source_backed.key) + "\">",
      "  <div class=\"ts-result-label-row\">",
      "    <span class=\"ts-type-label\">" + escapeHtml(market.label) + "</span>",
      "    <span class=\"ts-status-label is-current\">" + escapeHtml(SOURCE_LABELS.source_backed.label) + "</span>",
      "  </div>",
      "  <p class=\"ts-claim\"><strong>Trend Found:</strong> " + escapeHtml(note) + "</p>",
      "  <dl class=\"ts-result-meta\">",
      supportedValue("Selected matchup", matchup && matchup.matchup),
      supportedValue("Selected market", market.label),
      supportedValue("Trend search", trendKind && trendKind.label),
      supportedValue("Selected side", state.side),
      supportedValue("Selected team", state.team || "Not required"),
      supportedValue("Selected period", PERIODS[state.period]),
      supportedValue("Time range", state.range),
      supportedValue("Selected filters", "location=" + state.location + " | min_sample=" + state.minSample + (state.threshold !== "" ? " | line=" + state.threshold : "")),
      supportedValue("Result", rows.length ? counts.text : "Verified source rows available"),
      supportedValue("Sample size", sample),
      supportedValue("Usefulness", usefulnessLabel(sample)),
      sample < Number(state.minSample || 0) ? supportedValue("Warning", SAFE_MESSAGES.smallSample) : "",
      supportedValue("Data state", "Verified source rows available"),
      supportedValue("Source classification", trendSourceClassification(trend)),
      supportedValue("Source", trend.source_url || "Verified Trend Spotter artifact"),
      supportedValue("Note", "This is a trend, not a betting recommendation."),
      "  </dl>",
      rows.length ? sourceRowsHtml(rows.slice(0, 8)) : "<p class=\"ts-muted-line\">Verified source rows are not available for display.</p>",
      "</article>"
    ].join("");
  }

  function supportedValue(label, value) {
    if (value === undefined || value === null || value === "") return "";
    return "<div><dt>" + escapeHtml(label) + "</dt><dd>" + escapeHtml(value) + "</dd></div>";
  }

  function sourceRowsHtml(rows) {
    return [
      "<div class=\"ts-table-wrap\"><table class=\"ts-games-table\">",
      "<thead><tr><th>Date</th><th>Source row</th><th>Why counted</th></tr></thead>",
      "<tbody>",
      rows.map(function (row) {
        return [
          "<tr>",
          "<td>" + escapeHtml(row.date || "Unavailable") + "</td>",
          "<td>" + escapeHtml(row.detail || row.raw_game_log || row.opponent || "Verified row") + "</td>",
          "<td>" + escapeHtml(row.why_counted || "Included by the verified Trend Spotter artifact.") + "</td>",
          "</tr>"
        ].join("");
      }).join(""),
      "</tbody></table></div>"
    ].join("");
  }

  function resetForSport() {
    state.matchupKey = "";
    state.market = "";
    state.side = "";
    state.team = "";
    state.threshold = "";
    state.trendKind = "";
    state.period = "full_game";
    state.range = "source_window";
    state.generated = false;
    els.resultsSection.classList.add("is-hidden");
  }

  function bindEvents() {
    els.sport.addEventListener("change", function () {
      state.sport = els.sport.value;
      resetForSport();
      updateUi();
      if (state.sport) loadSport(state.sport);
    });
    els.matchup.addEventListener("change", function () {
      state.matchupKey = els.matchup.value;
      state.side = "";
      state.team = "";
      state.trendKind = "";
      state.generated = false;
      els.resultsSection.classList.add("is-hidden");
      updateUi();
    });
    els.marketOptions.addEventListener("click", function (event) {
      var button = event.target.closest("[data-market]");
      if (!button || button.disabled) return;
      state.market = button.getAttribute("data-market");
      state.side = "";
      state.team = "";
      state.threshold = "";
      state.trendKind = "";
      var market = selectedMarket();
      state.period = market && market.periods ? market.periods[0] : "full_game";
      state.generated = false;
      els.resultsSection.classList.add("is-hidden");
      updateUi();
    });
    [els.side, els.team, els.threshold, els.trendKind, els.period, els.range, els.sample, els.location].forEach(function (el) {
      el.addEventListener("change", onInput);
      el.addEventListener("input", onInput);
    });
    els.generate.addEventListener("click", renderResults);
  }

  function onInput(event) {
    var target = event.target;
    if (target === els.side) state.side = target.value;
    if (target === els.team) state.team = target.value;
    if (target === els.threshold) state.threshold = target.value;
    if (target === els.trendKind) state.trendKind = target.value;
    if (target === els.period) state.period = target.value;
    if (target === els.range) state.range = target.value;
    if (target === els.sample) state.minSample = Number(target.value) || 0;
    if (target === els.location) state.location = target.value;
    if (state.generated) renderResults();
    updateUi();
  }

  function applyUrlSelection() {
    var params = new URLSearchParams(window.location.search || "");
    var sport = normalize(params.get("sport"));
    if (!SPORTS.includes(sport)) return;
    els.sport.value = sport;
    state.sport = sport;
    loadSport(sport).then(function () {
      var first = matchupsForSport(sport)[0];
      if (first) {
        state.matchupKey = first.key;
        var market = params.get("market") || "";
        if (MARKETS.some(function (item) { return item.id === market && !marketIsDisabled(item); })) state.market = market;
        updateUi();
        if (params.get("autorun") === "1") renderResults();
      }
    });
  }

  bindEvents();
  renderMarketOptions();
  renderMatchups();
  renderSides();
  renderPeriods();
  updateUi();
  applyUrlSelection();
})();
