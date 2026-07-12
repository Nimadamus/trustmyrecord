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
    noData: "No verified trend available for this exact query.",
    unavailable: "Trend calculation unavailable until dataset is connected.",
    noStrong: "No verified trend available for this exact query.",
    smallSample: "Sample too small: this query does not meet the requested minimum sample."
  };
  var RANGE_LABELS = {
    source_window: "Recent verified completed games",
    last_5: "Last 5 games",
    last_10: "Last 10 games",
    last_20: "Last 20 games",
    last_50: "Last 50 games",
    season: "Season long"
  };
  var EXTENDED_RANGES = ["last_20", "last_50", "season"];
  var TEAM_ALIASES = {
    MLB: { "Athletics": "Oakland Athletics" },
    NBA: {},
    NFL: {},
    NHL: { "Utah Mammoth": "Utah Hockey Club" }
  };
  var EXTENDED_SPORTS = ["MLB", "NBA", "NFL", "NHL"];
  var KINDS_AVAILABLE_IN_EXTENDED = [
    "favorite", "underdog", "favorite_ats", "underdog_ats",
    "after_win", "after_loss",
    "head_to_head", "head_to_head_ats", "head_to_head_over_under"
  ];

  function kindAvailableInExtended(kind) {
    return Boolean(kind && KINDS_AVAILABLE_IN_EXTENDED.includes(kind.id));
  }

  function rangeIsExtended() {
    return EXTENDED_RANGES.includes(state.range);
  }
  var historyCache = {};
  var historyLoading = {};
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
      { id: "favorite", label: "Favorite trend" },
      { id: "underdog", label: "Underdog trend" },
      { id: "after_win", label: "After a win" },
      { id: "after_loss", label: "After a loss" },
      { id: "head_to_head", label: "Head to head" }
    ],
    spread: [
      { id: "ats", label: "ATS trend", tokens: ["SPREAD", "ATS", "RUN_LINE", "PUCK_LINE"] },
      { id: "home_road_ats", label: "Home / road ATS", tokens: ["HOME", "AWAY", "SPREAD", "ATS"] },
      { id: "favorite_ats", label: "Favorite ATS" },
      { id: "underdog_ats", label: "Underdog ATS" },
      { id: "head_to_head_ats", label: "Head to head ATS" }
    ],
    total: [
      { id: "full_game_over_under", label: "Full game over / under", tokens: ["TOTAL", "SCORING"] },
      { id: "recent_over_under", label: "Recent games over / under", tokens: ["RECENT_FORM", "SCORING", "TOTAL"] },
      { id: "home_road_over_under", label: "Home / road over / under", tokens: ["HOME", "AWAY", "TOTAL"] },
      { id: "head_to_head_over_under", label: "Head to head over / under" }
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
  // Per-sport matchup load status: "loading" | "ok" | "error".
  // "ok" means a request completed; only then may we claim zero games.
  var loadState = {};

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
    // Spread/run-line lines are stored as magnitude (e.g. 1.5), but users
    // commonly enter favorite notation (-1.5). Match on absolute value for
    // spread so the sign convention never hides a verified trend. Totals and
    // team totals are unsigned, so they keep exact matching.
    var matchSelected = market.id === "spread" ? Math.abs(selected) : selected;
    var compares = values.map(function (value) {
      return market.id === "spread" ? Math.abs(value) : value;
    });
    // Exact match always counts.
    if (compares.some(function (value) { return Math.abs(value - matchSelected) <= 0.001; })) return true;
    // The displayed record is scored at each game's own posted line within the
    // verified sample (see recordBasis), not only the entered line. Posted lines
    // vary game to game and are stored only on source rows, so requiring an exact
    // match silently hid real, verified spread/total/team-total trends. Accept any
    // entered line inside the posted-line range of the verified sample (small
    // tolerance) so a sensible line surfaces the same verified trend instead of
    // returning "No verified trend"; an absurd, out-of-range line still does not.
    var min = Math.min.apply(null, compares);
    var max = Math.max.apply(null, compares);
    var tolerance = market.id === "spread" ? 0.5 : 1;
    return matchSelected >= (min - tolerance) && matchSelected <= (max + tolerance);
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
    if (!["source_window", "last_5", "last_10", "last_20", "last_50", "season"].includes(state.range)) return false;
    if (market.id === "first_half" && state.period !== "first_half") return false;
    if (market.id === "first_five" && state.period !== "first_five") return false;
    return true;
  }

  function bestResult() {
    // Always go through the merged-dataset path so per-row scoring against the
    // user's entered line+side is used for every range. The artifact's
    // pre-computed UNDER/OVER trend text would otherwise hide a query for the
    // opposite side even when the underlying game data supports it.
    var ext = extendedTrendForQuery();
    if (ext) return ext;
    // Fallback for sports where extendedTrendForQuery yields nothing (no
    // artifact rows for this team, no static history): use the legacy
    // artifact-trend matcher so source_window queries still work.
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
    var status = loadState[state.sport];
    // Render any matchups we already have, even while a background refresh runs.
    if (!matchups.length) {
      // Still loading (or never loaded yet) -> show a loading state, never a
      // false "no games" claim.
      if (state.loading || (status !== "ok" && status !== "error")) {
        els.matchup.innerHTML = "<option value=\"\">Loading matchups…</option>";
        els.matchup.disabled = true;
        els.matchupDataSource.textContent = "Loading verified matchups from the TrustMyRecord schedule…";
        return;
      }
      // Request failed -> surface a retryable error, not "no games".
      if (status === "error") {
        els.matchup.innerHTML = "<option value=\"\">Matchups unavailable</option>";
        els.matchup.disabled = true;
        els.matchupDataSource.innerHTML = "We could not load matchups (the schedule service did not respond). " +
          "<button type=\"button\" id=\"matchupRetry\" class=\"ts-retry-btn\" style=\"margin-left:6px;padding:2px 10px;font:inherit;cursor:pointer;border:1px solid currentColor;border-radius:4px;background:transparent;color:inherit;\">Retry</button>";
        return;
      }
      // status === "ok": a successful response confirmed zero supported games.
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
    // Show team picker when the market requires it, when range is extended, or
    // when the market doesn't already encode a team in its side (total). For
    // moneyline/spread, side=home/away already selects the team. For total, the
    // side is over/under, so we must show the team picker so the user explicitly
    // chooses which team's games to analyze.
    var teamPickerNeeded =
      market.requiresTeam ||
      market.id === "total" ||
      (rangeIsExtended() && EXTENDED_SPORTS.includes(state.sport));
    if (teamPickerNeeded) {
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

  function effectiveKindDisabled(kind) {
    if (!kind || !kind.disabled) return false;
    if (rangeIsExtended() && EXTENDED_SPORTS.includes(state.sport) && KINDS_AVAILABLE_IN_EXTENDED.includes(kind.id)) return false;
    return true;
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
    if (!kinds.some(function (kind) { return kind.id === state.trendKind && !effectiveKindDisabled(kind); })) {
      state.trendKind = "";
    }
    els.trendKind.innerHTML = "<option value=\"\">Choose trend search</option>" + kinds.map(function (kind) {
      var disabled = effectiveKindDisabled(kind);
      var label = kind.label + (disabled && kind.reason ? " - " + kind.reason : (kind.disabled && !disabled ? " (extended history)" : ""));
      return "<option value=\"" + escapeHtml(kind.id) + "\"" + (state.trendKind === kind.id ? " selected" : "") + (disabled ? " disabled" : "") + ">" + escapeHtml(label) + "</option>";
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
    if (trendKind && effectiveKindDisabled(trendKind)) errors.push("invalid combination");
    if (market && !marketIsDisabled(market) && !state.side) errors.push("missing_side");
    if (market && market.requiresTeam && !state.team) errors.push("missing_team");
    if (market && market.needsThreshold && state.threshold === "") errors.push("missing_line");
    if (market && market.needsThreshold && state.threshold !== "" && !Number.isFinite(Number(state.threshold))) errors.push("invalid_line");
    if (!["source_window", "last_5", "last_10", "last_20", "last_50", "season"].includes(state.range)) errors.push("invalid combination");
    if (Number(state.minSample) < 1) errors.push("missing_sample");
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
      state.side ? "Side: " + sideLabel(state.side) : "Side not selected",
      state.team ? "Team: " + state.team : "",
      state.threshold !== "" ? "Line: " + state.threshold : "",
      state.period ? PERIODS[state.period] : "",
      "Range: " + (RANGE_LABELS[state.range] || state.range),
      "Min sample: " + state.minSample,
      "Location: " + locationLabel(state.location)
    ].filter(Boolean).join(" / ");
  }

  function sideLabel(side) {
    if (!side) return "";
    if (side === "over") return "Over";
    if (side === "under") return "Under";
    if (side === "home") return "Home";
    if (side === "away") return "Away";
    if (side === "moneyline") return "Moneyline";
    if (side === "spread") return "Spread";
    if (side === "total") return "Total";
    return side;
  }

  function locationLabel(loc) {
    if (loc === "home") return "Home only";
    if (loc === "away") return "Away only";
    return "Any location";
  }

  function updateUi() {
    renderMarketOptions();
    renderMatchups();
    renderSides();
    renderTrendKinds();
    renderPeriods();
    var errors = validationErrors();
    els.summary.textContent = querySummary();
    var blocked = Boolean(errors.length);
    // Hard-disable only while data is loading. When inputs are incomplete we
    // keep the button clickable but visually mark it blocked so a click always
    // surfaces the named missing field (never a silent dead button).
    els.generate.disabled = Boolean(state.loading);
    els.generate.classList.toggle("is-blocked", blocked && !state.loading);
    els.generate.setAttribute("aria-disabled", blocked || state.loading ? "true" : "false");
    if (errors.length) els.generate.title = validationMessage(errors[0]);
    else els.generate.removeAttribute("title");
    els.validation.textContent = errors.length ? validationMessage(errors[0]) : "Ready to generate. Output will stay empty unless verified data supports the selected query.";
    var data = cache[state.sport] || {};
    var classification = sourceClassification(data);
    els.dataStatus.textContent = trendSourceStatusText(data, classification);
    if (state.generated) renderResults();
  }

  function trendSourceStatusText(data, classification) {
    if (state.loading) return "Loading verified trend data...";
    if (data.status) return classification.label + " - " + classification.detail;
    if (state.sport && state.matchupKey) return "Matchup loaded. A result will appear if verified completed-game data supports your query.";
    if (state.sport) return "Choose a matchup to check verified trend availability.";
    return SAFE_MESSAGES.selectToLoad;
  }

  function validationMessage(error) {
    var market = selectedMarket();
    var marketLabel = market ? market.label : "this market";
    if (error === "no matchup selected") return "Select a sport and matchup before generating.";
    if (error === "no trend type selected") return "Select a trend type before generating.";
    if (error === "missing trend search") return "Select the kind of trend you want to search for.";
    if (error === "missing_side") return "Missing field: choose a Side (which team/over-under) for the " + marketLabel + " trend.";
    if (error === "missing_team") return "Missing field: choose a Team for the " + marketLabel + " trend.";
    var lineExample = market && /total/i.test(market.id || "") ? "8.5" : "-1.5";
    if (error === "missing_line") return "Missing field: enter the " + marketLabel + " line (a number, e.g. " + lineExample + ") before generating.";
    if (error === "invalid_line") return "Invalid field: the " + marketLabel + " line must be a number (e.g. " + lineExample + ").";
    if (error === "missing_sample") return "Missing field: set a minimum sample size of at least 1.";
    if (error === "invalid combination") return "Invalid combination for the selected sport or market.";
    return "Trend calculation unavailable until dataset is connected.";
  }

  // Fetch JSON with a hard timeout so a cold-starting/hung API surfaces as a
  // retryable error instead of an indefinite spinner. Non-2xx is an error too.
  async function fetchJson(url, timeoutMs) {
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, timeoutMs || 45000) : null;
    try {
      var response = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller ? controller.signal : undefined
      });
      if (!response.ok) {
        var httpErr = new Error("HTTP " + response.status);
        httpErr.httpStatus = response.status;
        throw httpErr;
      }
      return await response.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function loadSport(sport) {
    state.loading = true;
    loadState[sport] = "loading";
    updateUi();
    cache[sport] = cache[sport] || {};
    var verifiedOk = false;
    try {
      cache[sport] = await fetchJson(apiBase() + "/trendspotter/verified?sport=" + encodeURIComponent(sport) + "&_=" + Date.now());
      verifiedOk = true;
    } catch (error) {
      cache[sport] = { status: "error", trends: [], matchups: [], unavailable_data: [error.message] };
    }
    var boardOk = true;
    if (!matchupsForSport(sport).length) {
      boardOk = await loadBoardMatchups(sport);
    }
    if (EXTENDED_SPORTS.includes(sport)) loadSportHistory(sport);
    // "ok" only when a request actually succeeded (verified response, or a
    // board response that produced matchups). Otherwise "error" -> retry UI.
    loadState[sport] = (verifiedOk || (boardOk && matchupsForSport(sport).length)) ? "ok" : "error";
    state.loading = false;
    updateUi();
  }

  async function loadBoardMatchups(sport) {
    var boardKey = BOARD_KEYS[sport];
    if (!boardKey) return true;
    try {
      var data = await fetchJson(apiBase() + "/games/board/" + encodeURIComponent(boardKey));
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
      return true;
    } catch (error) {
      cache[sport].live_matchups = [];
      cache[sport].matchup_source = "Error state: schedule matchups could not be loaded.";
      return false;
    }
  }

  function renderResults() {
    state.generated = true;
    els.resultsSection.classList.remove("is-hidden");
    els.resultsTitle.textContent = "Trend Result";
    var errors = validationErrors();
    console.info("[Trendspotter] Generate clicked", { query: querySummary(), errors: errors.slice() });
    if (errors.length) {
      console.warn("[Trendspotter] Blocked: " + errors[0] + " -> " + validationMessage(errors[0]));
      els.resultCount.textContent = SOURCE_LABELS.blocked.label;
      els.resultsList.innerHTML = safeStateHtml(validationMessage(errors[0]), querySummary(), SOURCE_LABELS.blocked);
      return;
    }
    console.info("[Trendspotter] Validation passed -> evaluating verified source rows");
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
    var effSample = effectiveRows(sourceRows(trend)).length;
    if (effSample < Number(state.minSample || 0)) {
      els.resultCount.textContent = "Sample too small";
      els.resultsList.innerHTML = safeStateHtml(SAFE_MESSAGES.smallSample, querySummary(), SOURCE_LABELS.partial);
      return;
    }
    els.resultCount.textContent = "Verified sample: " + effSample;
    els.resultsList.innerHTML = trendResultHtml(trend);
  }

  function safeStateHtml(message, summary, classification) {
    var label = typeof classification === "string" ? { label: classification, key: normalize(classification).toLowerCase() } : (classification || SOURCE_LABELS.blocked);
    return [
      "<article class=\"ts-no-results\" data-state=\"safe-no-data\" data-source-label=\"" + escapeHtml(label.key || "blocked") + "\">",
      "  <span class=\"ts-source-label\">" + escapeHtml(label.label || SOURCE_LABELS.blocked.label) + "</span>",
      "  <strong>" + escapeHtml(message) + "</strong>",
      "  <span>Your query: " + escapeHtml(summary) + "</span>",
      "  <span>Data status: " + escapeHtml(label.label || SOURCE_LABELS.blocked.label) + ". Trend Spotter only returns results when verified completed-game data supports the exact query.</span>",
      "</article>"
    ].join("");
  }

  function resultCounts(rows, market, displayLine) {
    var wins = 0;
    var losses = 0;
    var pushes = 0;
    rows.forEach(function (row) {
      var outcome = perRowOutcome(row, market, displayLine);
      if (outcome === "HIT") wins += 1;
      else if (outcome === "MISS") losses += 1;
      else if (outcome === "PUSH") pushes += 1;
    });
    return {
      wins: wins,
      losses: losses,
      pushes: pushes,
      text: wins + " matching, " + losses + " non-matching" + (pushes ? ", " + pushes + " pushes" : "")
    };
  }

  function rowFinalScores(row) {
    var team = Number(row.team_runs != null ? row.team_runs : (row.s != null ? row.s : NaN));
    var opp = Number(row.opponent_runs != null ? row.opponent_runs : (row.os != null ? row.os : NaN));
    if (!Number.isFinite(team) || !Number.isFinite(opp)) {
      var m = String(row.raw_game_log || "").match(/(\d+)-(\d+)\s+(?:WIN|LOSS|PUSH)/i);
      if (m) { team = parseInt(m[1], 10); opp = parseInt(m[2], 10); }
    }
    return { team: team, opp: opp };
  }

  // Compute Hit/Miss/Push independently from the verified per-row data instead
  // of trusting the artifact's pre-computed market_result. For totals, team
  // totals, and spreads we score against the user's selected line (so the
  // record truly answers "would the entered line have hit?").
  function perRowOutcome(row, market, displayLine) {
    if (market) {
      if (market.id === "total") {
        var gt = Number(row.game_total);
        var line = displayLine !== null && displayLine !== undefined ? Number(displayLine) : Number(row.total_line);
        if (Number.isFinite(gt) && Number.isFinite(line)) {
          if (gt === line) return "PUSH";
          var goesOver = gt > line;
          if (state.side === "over") return goesOver ? "HIT" : "MISS";
          if (state.side === "under") return goesOver ? "MISS" : "HIT";
        }
      }
      if (market.id === "team_total") {
        var tt = Number(row.team_total != null ? row.team_total : row.team_runs);
        var ttLine = displayLine !== null && displayLine !== undefined ? Number(displayLine) : Number(row.team_total_line);
        if (Number.isFinite(tt) && Number.isFinite(ttLine)) {
          if (tt === ttLine) return "PUSH";
          var ttOver = tt > ttLine;
          if (state.side === "over") return ttOver ? "HIT" : "MISS";
          if (state.side === "under") return ttOver ? "MISS" : "HIT";
        }
      }
      if (market.id === "spread") {
        var sline = displayLine !== null && displayLine !== undefined ? Number(displayLine) : Number(row.spread_line);
        var scores = rowFinalScores(row);
        if (Number.isFinite(scores.team) && Number.isFinite(scores.opp) && Number.isFinite(sline)) {
          var margin = (scores.team - scores.opp) + sline;
          if (margin > 0) return "HIT";
          if (margin < 0) return "MISS";
          return "PUSH";
        }
      }
      if (market.id === "moneyline") {
        var mScores = rowFinalScores(row);
        if (Number.isFinite(mScores.team) && Number.isFinite(mScores.opp)) {
          if (mScores.team > mScores.opp) return "HIT";
          if (mScores.team < mScores.opp) return "MISS";
          return "PUSH";
        }
      }
    }
    var fallback = normalize(row.market_result || row.result);
    if (fallback === "WIN") return "HIT";
    if (fallback === "LOSS") return "MISS";
    if (fallback === "PUSH") return "PUSH";
    return "";
  }

  function effectiveRows(rows) {
    if (!Array.isArray(rows) || !rows.length) return [];
    var sorted = rows.slice().sort(function (a, b) {
      return String(b.date || "").localeCompare(String(a.date || ""));
    });
    var kind = state.trendKind;
    var isH2H = kind === "head_to_head" || kind === "head_to_head_ats" || kind === "head_to_head_over_under";
    // Head-to-head meetings are naturally rare; the user already filtered by
    // opponent. Treat source_window / season as "all available H2H meetings"
    // and only apply explicit last_N slices.
    if (isH2H && (state.range === "source_window" || state.range === "season")) return sorted;
    if (state.range === "last_5") return sorted.slice(0, Math.min(5, sorted.length));
    if (state.range === "last_10") return sorted.slice(0, Math.min(10, sorted.length));
    if (state.range === "last_20") return sorted.slice(0, Math.min(20, sorted.length));
    if (state.range === "last_50") return sorted.slice(0, Math.min(50, sorted.length));
    if (state.range === "season") {
      var yr = String(new Date().getFullYear());
      return sorted.filter(function (r) { return String(r.date || "").startsWith(yr); });
    }
    return sorted;
  }

  function loadSportHistory(sport) {
    if (!EXTENDED_SPORTS.includes(sport)) return Promise.resolve(null);
    if (historyCache[sport]) return Promise.resolve(historyCache[sport]);
    if (historyLoading[sport]) return historyLoading[sport];
    var path = "/static/data/" + sport.toLowerCase() + "/team-history.json?v=20260606a";
    historyLoading[sport] = fetch(path, { cache: "force-cache" })
      .then(function (resp) { return resp.json(); })
      .then(function (data) { historyCache[sport] = data; historyLoading[sport] = null; return data; })
      .catch(function () { historyLoading[sport] = null; return null; });
    return historyLoading[sport];
  }

  function historyRowsForTeam(sport, team) {
    var data = historyCache[sport];
    if (!data || !data.teams) return [];
    var aliases = TEAM_ALIASES[sport] || {};
    var key = aliases[team] || team;
    return data.teams[key] || data.teams[team] || [];
  }

  // Pull the team's recent games out of the artifact's source_rows (which is
  // refreshed daily and lives ahead of the static history file). De-dupe by
  // date+opponent and convert to the same shape as the static history rows so
  // extendedTrendForQuery can merge both into one fresh, deep dataset.
  function artifactRowsForTeam(sport, team) {
    var data = cache[sport];
    if (!data || !Array.isArray(data.trends)) return [];
    var teamN = normalize(team);
    var aliases = TEAM_ALIASES[sport] || {};
    var teamAliased = normalize(aliases[team] || team);
    var byKey = new Map();
    data.trends.forEach(function (t) {
      if (!t) return;
      var tN = normalize(t.team_abbr);
      if (tN !== teamN && tN !== teamAliased) return;
      var rows = sourceRows(t);
      rows.forEach(function (r) {
        var log = String(r.raw_game_log || "");
        var m = log.match(/(\d+)-(\d+)\s+(?:WIN|LOSS|PUSH)/i);
        if (!m) return;
        var ts = parseInt(m[1], 10);
        var oss = parseInt(m[2], 10);
        var key = (r.date || "") + "|" + normalize(r.opponent || "");
        // Per-trend field names vary: spread trends use `line`, total trends
        // use `total_line`, team-total trends use `team_total_line`.
        var spreadRaw = (r.spread_line != null) ? r.spread_line : (t.bet_type === "SPREAD" ? r.line : null);
        var totalRaw = (r.total_line != null) ? r.total_line : null;
        var ttRaw = (r.team_total_line != null) ? r.team_total_line : null;
        var existing = byKey.get(key);
        if (existing) {
          if (existing.tl == null && totalRaw != null) existing.tl = Number(totalRaw);
          if (existing.sp == null && spreadRaw != null) existing.sp = Number(spreadRaw);
          if (existing.ttl == null && ttRaw != null) existing.ttl = Number(ttRaw);
          return;
        }
        byKey.set(key, {
          d: r.date || "",
          opp: r.opponent || "",
          h: r.location === "home" ? 1 : 0,
          s: ts,
          os: oss,
          tl: (totalRaw != null) ? Number(totalRaw) : null,
          sp: (spreadRaw != null) ? Number(spreadRaw) : null,
          ttl: (ttRaw != null) ? Number(ttRaw) : null,
          ats: null,
          w: ts > oss ? 1 : (ts < oss ? 0 : null),
          ml: null,
          te: 0,
          se: 0,
          _from: "artifact"
        });
      });
    });
    return Array.from(byKey.values());
  }

  function mergedHistoryRowsForTeam(sport, team) {
    var stat = historyRowsForTeam(sport, team) || [];
    var art = artifactRowsForTeam(sport, team) || [];
    if (!art.length) return stat;
    // STATIC_ROWS_WIN_20260606: the static history file carries verified
    // ET-dated finals from the MLB Stats API backfill; artifact rows can be
    // UTC-date-shifted (+1 for late games). Only let artifact rows in when
    // they are newer than the static window, and drop any artifact row that
    // duplicates a static game (same opponent + same scores within 1 day) so
    // a shifted date can never hide or overwrite a real verified game.
    var statMax = "";
    stat.forEach(function (r) { if (String(r.d || "") > statMax) statMax = String(r.d || ""); });
    var statGameSig = new Map();
    stat.forEach(function (r) {
      statGameSig.set(normalize(r.opp || "") + "|" + r.s + "|" + r.os, String(r.d || ""));
    });
    function isDupOfStatic(r) {
      var sig = normalize(r.opp || "") + "|" + r.s + "|" + r.os;
      var d0 = statGameSig.get(sig);
      if (!d0 || !r.d) return false;
      var diff = Math.abs(Date.parse(String(r.d) + "T00:00:00Z") - Date.parse(d0 + "T00:00:00Z"));
      return diff <= 86400000;
    }
    var byKey = new Map();
    // Artifact rows seed the set ONLY for games beyond the static window.
    art.forEach(function (r) {
      if (statMax && String(r.d || "") <= statMax) return;
      if (isDupOfStatic(r)) return;
      var k = (r.d || "") + "|" + normalize(r.opp || "");
      byKey.set(k, Object.assign({}, r));
    });
    // For overlap, enrich the artifact row with static-only fields (ml, ats, sp/tl
    // where missing). For static-only games (older than the artifact window),
    // insert the static row as-is.
    stat.forEach(function (r) {
      var k = (r.d || "") + "|" + normalize(r.opp || "");
      var existing = byKey.get(k);
      if (existing) {
        if (existing.ml == null && r.ml != null) existing.ml = r.ml;
        if (existing.sp == null && r.sp != null) existing.sp = r.sp;
        if (existing.tl == null && r.tl != null) existing.tl = r.tl;
        if (existing.ats == null && r.ats != null) existing.ats = r.ats;
        return;
      }
      byKey.set(k, r);
    });
    var merged = Array.from(byKey.values());
    merged.sort(function (a, b) { return String(b.d || "").localeCompare(String(a.d || "")); });
    return merged;
  }

  function extendedTrendForQuery() {
    var matchup = selectedMatchup();
    var market = selectedMarket();
    var trendKind = selectedTrendKind();
    if (!matchup || !market || !trendKind) return null;
    if (marketIsDisabled(market)) return null;
    if (trendKind.disabled && !kindAvailableInExtended(trendKind)) return null;
    var team = state.team || (state.side === "away" ? matchup.away_abbr : matchup.home_abbr);
    var raw = mergedHistoryRowsForTeam(state.sport, team);
    if (!raw.length) return null;
    var sortedAll = raw.slice().sort(function (a, b) { return String(b.d || "").localeCompare(String(a.d || "")); });
    var opponentInMatchup = (matchup.home_abbr === team) ? matchup.away_abbr : matchup.home_abbr;
    var kindId = trendKind.id;
    var rows = sortedAll
      .filter(function (r) {
        if (state.location === "home" && !r.h) return false;
        if (state.location === "away" && r.h) return false;
        if (market.id === "total" && r.te) return false;
        if (market.id === "spread" && r.se) return false;
        // team_total is scored from team_runs vs the entered team-total line (TEAMTOTAL_ENABLED_20260709)
        if (kindId === "favorite" || kindId === "favorite_ats") {
          // Prefer real moneyline; fall back to spread sign for artifact rows.
          // Use explicit null/undefined check because Number(null) === 0,
          // which would otherwise mis-classify null-moneyline rows as ml=0.
          var mlV = (r.ml === null || r.ml === undefined) ? NaN : Number(r.ml);
          var spV = (r.sp === null || r.sp === undefined) ? NaN : Number(r.sp);
          if (Number.isFinite(mlV)) {
            if (mlV >= 0) return false;
          } else if (Number.isFinite(spV)) {
            if (spV >= 0) return false;
          } else {
            return false;
          }
        }
        if (kindId === "underdog" || kindId === "underdog_ats") {
          var mlV2 = (r.ml === null || r.ml === undefined) ? NaN : Number(r.ml);
          var spV2 = (r.sp === null || r.sp === undefined) ? NaN : Number(r.sp);
          if (Number.isFinite(mlV2)) {
            if (mlV2 <= 0) return false;
          } else if (Number.isFinite(spV2)) {
            if (spV2 <= 0) return false;
          } else {
            return false;
          }
        }
        if (kindId === "head_to_head" || kindId === "head_to_head_ats" || kindId === "head_to_head_over_under") {
          if (normalize(r.opp) !== normalize(opponentInMatchup)) return false;
        }
        return true;
      });
    if (kindId === "after_win" || kindId === "after_loss") {
      var needPrev = kindId === "after_win" ? 1 : 0;
      rows = rows.filter(function (r) {
        var idx = sortedAll.indexOf(r);
        var prev = sortedAll[idx + 1];
        return prev && Number(prev.w) === needPrev;
      });
    }
    rows = rows
      .map(function (r) {
        var mlResult = r.w ? "WIN" : "LOSS";
        var atsResult = r.ats === "W" ? "WIN" : r.ats === "L" ? "LOSS" : "PUSH";
        return {
          date: r.d,
          opponent: r.opp,
          location: r.h ? "home" : "away",
          total_line: r.tl,
          spread_line: r.sp,
          team_total_line: r.ttl != null ? r.ttl : null,
          game_total: (Number(r.s) || 0) + (Number(r.os) || 0),
          team_runs: r.s,
          team_total: r.s,
          opponent_runs: r.os,
          market_result: market.id === "moneyline" ? mlResult : market.id === "spread" ? atsResult : mlResult,
          result: market.id === "moneyline" ? mlResult : market.id === "spread" ? atsResult : mlResult,
          raw_game_log: r.d + " " + (r.h ? "vs " : "@ ") + (r.opp || "") + " " + r.s + "-" + r.os + " " + mlResult,
          why_counted: "Extended verified historical game pulled from local game-log archive."
        };
      });
    if (!rows.length) return null;
    return {
      sport: "MLB",
      matchup: matchup.matchup,
      team_abbr: team,
      opponent_abbr: matchup.home_abbr === team ? matchup.away_abbr : matchup.home_abbr,
      home_abbr: matchup.home_abbr,
      away_abbr: matchup.away_abbr,
      bet_type: market.id.toUpperCase(),
      market: market.id.toUpperCase(),
      kind: "EXTENDED_HISTORY",
      side: state.side,
      claim: "Extended history trend",
      sample: rows.length,
      record: "",
      source_classification: "source_backed",
      source_classification_detail: "Extended verified historical games (season>=2025)",
      source_url: "Local game-log archive (handicapping_tool/trends.db)",
      source_rows: rows,
      _extended: true
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
    var allRows = sourceRows(trend);
    var market = selectedMarket();
    var trendKind = selectedTrendKind();
    var displayLine = pickDisplayLine(trend, market, allRows);
    var rows = effectiveRows(allRows);
    var counts = resultCounts(rows, market, displayLine);
    var sample = rows.length;
    var record = (market && (market.id === "total" || market.id === "team_total"))
      ? counts.wins + "-" + counts.losses + (counts.pushes ? "-" + counts.pushes : "")
      : (state.range === "source_window" && trend.record ? trend.record : counts.wins + "-" + counts.losses + (counts.pushes ? "-" + counts.pushes : ""));
    var trendAnswer = buildTrendAnswer(trend, matchup, market, counts, sample, displayLine, record);
    return [
      "<article class=\"ts-result-item\" data-result=\"verified-trend\" data-source-label=\"" + escapeHtml(SOURCE_LABELS.source_backed.key) + "\">",
      "  <div class=\"ts-result-label-row\">",
      "    <span class=\"ts-type-label\">" + escapeHtml(market.label) + "</span>",
      "    <span class=\"ts-status-label is-current\">" + escapeHtml(SOURCE_LABELS.source_backed.label) + "</span>",
      "  </div>",
      "  <p class=\"ts-claim\"><strong>Trend Answer:</strong> " + escapeHtml(trendAnswer) + "</p>",
      "  <dl class=\"ts-result-meta\">",
      supportedValue("Record", record + " (" + counts.wins + " matching, " + counts.losses + " non-matching" + (counts.pushes ? ", " + counts.pushes + " pushes" : "") + ")"),
      supportedValue("Scoring basis", recordBasis(market)),
      supportedValue("Sample size", sample + " verified completed games"),
      market.needsThreshold ? supportedValue("Line / threshold used", displayLine !== null ? formatLine(displayLine, market) : "Posted line per game") : "",
      supportedValue("Market", market.label),
      supportedValue("Side", sideLabel(state.side)),
      supportedValue("Team / matchup", (state.team || trend.team_abbr || "") + " in " + (matchup && matchup.matchup)),
      supportedValue("Period", PERIODS[state.period]),
      supportedValue("Location filter", locationLabel(state.location)),
      supportedValue("Usefulness", usefulnessLabel(sample)),
      sample < Number(state.minSample || 0) ? supportedValue("Warning", SAFE_MESSAGES.smallSample) : "",
      supportedValue("Source / data status", SOURCE_LABELS.source_backed.label + " (completed games with final scores)"),
      supportedValue("Why this matched", whyMatched(trend, matchup, market, trendKind, sample)),
      supportedValue("Note", "This is a trend, not a betting recommendation."),
      "  </dl>",
      rows.length ? sourceRowsHtml(rows, market, displayLine) : "<p class=\"ts-muted-line\">Verified source rows are not available for display.</p>",
      "</article>"
    ].join("");
  }

  function pickDisplayLine(trend, market, rows) {
    var entered = numericLine(state.threshold);
    if (entered !== null && market && market.needsThreshold) return entered;
    var values = lineValuesForTrend(trend, market);
    if (values.length) return values[0];
    return null;
  }

  function formatLine(line, market) {
    if (line === null || line === undefined || line === "") return "";
    if (market && market.id === "spread") {
      var n = Number(line);
      if (n > 0) return "+" + n;
      return String(n);
    }
    return String(line);
  }

  function buildTrendAnswer(trend, matchup, market, counts, sample, displayLine, record) {
    var team = state.team || trend.team_abbr || "";
    var side = state.side;
    var hits = counts.wins;
    var total = sample;
    var lineStr = displayLine !== null && displayLine !== undefined ? formatLine(displayLine, market) : "";
    var trendKind = selectedTrendKind();
    var kindPhrase = kindContextPhrase(trendKind, matchup, team);
    var samplePhrase = "their last " + total + " completed games" + (kindPhrase.qualifier ? " " + kindPhrase.qualifier : "");
    var unitWord = unitWordForSport();
    if (market.id === "total") {
      var ouWord = side === "over" ? "OVER" : side === "under" ? "UNDER" : "OVER/UNDER";
      var teamPhrase = team ? team + " games" : (matchup && matchup.matchup ? matchup.matchup + " games" : "Games");
      return teamPhrase + " have gone " + ouWord + (lineStr ? " " + lineStr + " " + unitWord : "") + " in " + hits + " of " + samplePhrase + ".";
    }
    if (market.id === "team_total") {
      var ttWord = side === "over" ? "OVER" : side === "under" ? "UNDER" : "OVER/UNDER";
      return (team || "Team") + " team total has gone " + ttWord + (lineStr ? " " + lineStr : "") + " in " + hits + " of " + samplePhrase + ".";
    }
    if (market.id === "spread") {
      var locPhrase = state.location === "home" ? " at home" : state.location === "away" ? " on the road" : "";
      return (team || "Team") + " is " + record + " against the spread" + (lineStr ? " (line " + lineStr + ")" : "") + locPhrase + (kindPhrase.adjective ? " " + kindPhrase.adjective : "") + " in " + samplePhrase + ".";
    }
    if (market.id === "moneyline") {
      var locPhrase2 = state.location === "home" ? " at home" : state.location === "away" ? " on the road" : "";
      return (team || "Team") + " is " + record + " straight up" + locPhrase2 + (kindPhrase.adjective ? " " + kindPhrase.adjective : "") + " in " + samplePhrase + ".";
    }
    return (team || "Team") + " is " + record + " on the " + market.label + " in " + samplePhrase + ".";
  }

  function unitWordForSport() {
    if (state.sport === "MLB") return "runs";
    if (state.sport === "NFL" || state.sport === "NCAAF") return "points";
    if (state.sport === "NHL") return "goals";
    if (state.sport === "NBA" || state.sport === "NCAAB") return "points";
    return "";
  }

  function kindContextPhrase(trendKind, matchup, team) {
    var out = { adjective: "", qualifier: "" };
    if (!trendKind) return out;
    var oppName = "";
    if (matchup && team) oppName = (matchup.home_abbr === team) ? matchup.away_abbr : matchup.home_abbr;
    switch (trendKind.id) {
      case "favorite": case "favorite_ats":
        out.adjective = "as a favorite";
        break;
      case "underdog": case "underdog_ats":
        out.adjective = "as an underdog";
        break;
      case "after_win":
        out.qualifier = "following a win";
        break;
      case "after_loss":
        out.qualifier = "following a loss";
        break;
      case "head_to_head": case "head_to_head_ats": case "head_to_head_over_under":
        if (oppName) out.qualifier = "head-to-head vs " + oppName;
        else out.qualifier = "in head-to-head matchups";
        break;
    }
    return out;
  }

  function whyMatched(trend, matchup, market, trendKind, sample) {
    var parts = [];
    parts.push("Pulled from " + sample + " completed " + (state.sport || "") + " games with final scores");
    if (state.location !== "all") parts.push("filtered to " + (state.location === "home" ? "home" : "away") + " games only");
    if (market && market.needsThreshold && state.threshold !== "") parts.push("matched against entered line " + state.threshold);
    if (trendKind && trendKind.label) parts.push("for trend search: " + trendKind.label);
    return parts.join("; ") + ".";
  }

  function recordBasis(market) {
    if (!market) return "";
    if (market.id === "total") return "Each game scored against your entered total line, independent of the line that was actually posted at game time.";
    if (market.id === "team_total") return "Each game scored against your entered team-total line, independent of the line that was actually posted at game time.";
    if (market.id === "spread") return "Each game scored against your entered spread, independent of the line that was actually posted at game time.";
    if (market.id === "moneyline") return "Straight win/loss outcomes across the verified sample.";
    return "Outcomes scored from the verified source rows in the sample.";
  }

  function supportedValue(label, value) {
    if (value === undefined || value === null || value === "") return "";
    return "<div><dt>" + escapeHtml(label) + "</dt><dd>" + escapeHtml(value) + "</dd></div>";
  }

  function sourceRowsHtml(rows, market, displayLine) {
    return [
      "<h3 class=\"ts-table-title\">Verified game log</h3>",
      "<div class=\"ts-table-wrap\"><table class=\"ts-games-table\">",
      "<thead><tr><th>Date</th><th>Game</th><th>" + escapeHtml(lineColHeader(market)) + "</th><th>Final score</th><th>Result vs line</th><th>Why included</th></tr></thead>",
      "<tbody>",
      rows.map(function (row) { return gameLogRowHtml(row, market, displayLine); }).join(""),
      "</tbody></table></div>"
    ].join("");
  }

  function lineColHeader(market) {
    if (!market) return "Line";
    if (market.id === "total") return "Total line";
    if (market.id === "team_total") return "Team total line";
    if (market.id === "spread") return "Spread";
    return "Line";
  }

  function gameLogRowHtml(row, market, displayLine) {
    var rawLog = row.raw_game_log || "";
    var scoreMatch = rawLog.match(/(\d+)-(\d+)\s+(WIN|LOSS|PUSH)\b/i);
    var gameDesc = "";
    var finalScore = "";
    if (rawLog) {
      var loc = row.location === "home" ? "vs " : row.location === "away" ? "@ " : "";
      gameDesc = (loc + (row.opponent || "")).trim() || rawLog;
      if (scoreMatch) finalScore = scoreMatch[1] + "-" + scoreMatch[2];
    } else {
      gameDesc = row.opponent || row.detail || "Verified row";
    }
    var lineCell = "";
    if (market) {
      if (market.id === "total") lineCell = row.total_line != null ? String(row.total_line) : "";
      else if (market.id === "team_total") lineCell = row.team_total_line != null ? String(row.team_total_line) : "";
      else if (market.id === "spread") lineCell = row.spread_line != null ? formatLine(row.spread_line, market) : "";
    }
    if (!lineCell) lineCell = "-";
    var outcome = perRowOutcome(row, market, displayLine);
    var resultLabel = outcome === "HIT" ? "Hit" : outcome === "MISS" ? "Miss" : outcome === "PUSH" ? "Push" : "-";
    var resultClass = outcome === "HIT" ? "ts-rv-hit" : outcome === "MISS" ? "ts-rv-miss" : "ts-rv-push";
    var why = humanWhyCounted(row, market, finalScore, lineCell);
    return [
      "<tr>",
      "<td>" + escapeHtml(row.date || "-") + "</td>",
      "<td>" + escapeHtml(gameDesc) + "</td>",
      "<td>" + escapeHtml(lineCell) + "</td>",
      "<td>" + escapeHtml(finalScore || "-") + "</td>",
      "<td class=\"" + resultClass + "\">" + escapeHtml(resultLabel) + "</td>",
      "<td>" + escapeHtml(why) + "</td>",
      "</tr>"
    ].join("");
  }

  function humanWhyCounted(row, market, finalScore, lineCell) {
    var dateStr = row.date || "completed game";
    var hasLine = lineCell && lineCell !== "-";
    var unit = unitWordForSport() || "points";
    if (!market) return "Completed game with verified final score.";
    if (market.id === "total") {
      var gt = Number(row.game_total != null ? row.game_total : (Number(row.s) + Number(row.os)));
      if (Number.isFinite(gt) && hasLine) {
        return "Game on " + dateStr + " finished " + (finalScore || "") + " for a total of " + gt + " " + unit + " vs the " + lineCell + " line.";
      }
      if (Number.isFinite(gt)) {
        return "Game on " + dateStr + " finished " + (finalScore || "") + " for a total of " + gt + " " + unit + "; scored against your entered line.";
      }
      return "Completed game on " + dateStr + " with verified final score.";
    }
    if (market.id === "team_total") {
      return "Completed game on " + dateStr + " with a verified team-total line.";
    }
    if (market.id === "spread") {
      if (hasLine) return "Completed game on " + dateStr + " finished " + (finalScore || "") + ", posted spread " + lineCell + "; scored against your entered line.";
      return "Completed game on " + dateStr + " finished " + (finalScore || "") + "; scored against your entered line (no posted spread available).";
    }
    if (market.id === "moneyline") {
      return "Completed game on " + dateStr + " with a verified final score" + (finalScore ? " (" + finalScore + ")" : "") + ".";
    }
    return "Completed game on " + dateStr + " with verified final-score data.";
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
    els.matchupDataSource.addEventListener("click", function (event) {
      if (!event.target.closest("#matchupRetry")) return;
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
