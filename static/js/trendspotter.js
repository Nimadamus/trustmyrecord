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
    { id: "after_win", label: "After win", terms: ["AFTER A WIN", "AFTER WIN", "COMING OFF A WIN"] },
    { id: "after_loss", label: "After loss", terms: ["AFTER A LOSS", "AFTER LOSS", "COMING OFF A LOSS"] },
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
    { id: "confidence", label: "Confidence/strength if available" },
    { id: "recency", label: "Recency" },
    { id: "market", label: "Market type" }
  ];

  var state = {
    sport: "",
    market: "all",
    factor: "all",
    minSample: 0,
    dateStart: "",
    dateEnd: "",
    team: "all",
    opponent: "all",
    location: "all",
    sort: "rank",
    generated: false
  };
  var cache = {};

  var els = {
    sportOptions: document.getElementById("sportOptions"),
    marketType: document.getElementById("marketType"),
    trendFactor: document.getElementById("trendFactor"),
    minSample: document.getElementById("minSample"),
    dateStart: document.getElementById("dateStart"),
    dateEnd: document.getElementById("dateEnd"),
    teamFilter: document.getElementById("teamFilter"),
    opponentFilter: document.getElementById("opponentFilter"),
    locationFilter: document.getElementById("locationFilter"),
    sortBy: document.getElementById("sortBy"),
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

  function marketTokens(trend) {
    return [
      trend.bet_type,
      trend.market,
      trend.market_type,
      trend.market_key,
      trend.market_breakdown
    ].map(normalize).filter(Boolean);
  }

  function canonicalMarketId(trend) {
    var tokens = marketTokens(trend);
    if (tokens.some(function (value) { return /\b(TEAM_TOTAL|TEAM TOTAL|TEAM_TOTALS|TEAM TOTALS)\b/.test(value); })) return "team_total";
    if (tokens.some(function (value) { return /\b(PLAYER_PROP|PLAYER PROP|PLAYER_PROPS|PLAYER PROPS|PROP|PROPS)\b/.test(value); })) return "player_props";
    if (tokens.some(function (value) { return /\b(RUN_LINE|RUN LINE)\b/.test(value); })) return "run_line";
    if (tokens.some(function (value) { return /\b(PUCK_LINE|PUCK LINE)\b/.test(value); })) return "puck_line";
    if (tokens.some(function (value) { return /\b(FIRST_FIVE|FIRST FIVE|FIRST 5|F5)\b/.test(value); })) return "first_five";
    if (tokens.some(function (value) { return /\b(HALF|HALVES|1H|2H)\b/.test(value); })) return "halves";
    if (tokens.some(function (value) { return /\b(PERIOD|PERIODS|1P|2P|3P)\b/.test(value); })) return "periods";
    if (tokens.some(function (value) { return /\b(ALT|ALTS|ALTERNATE|ALTERNATES)\b/.test(value); })) return "alts";
    if (tokens.some(function (value) { return /\b(MONEYLINE|ML|H2H)\b/.test(value); })) return "moneyline";
    if (tokens.some(function (value) { return /\b(SPREAD|SPREADS|ATS|HANDICAP)\b/.test(value); })) return "spread";
    if (tokens.some(function (value) { return /\b(TOTAL|TOTALS|GAME_TOTAL|GAME TOTAL|OVER_UNDER|OVER UNDER)\b/.test(value); })) return "total";
    return "";
  }

  function marketMatches(trend, marketId) {
    if (marketId === "all") return true;
    var market = MARKET_TYPES.find(function (item) { return item.id === marketId; });
    var canonical = canonicalMarketId(trend);
    if (canonical) return canonical === marketId;
    var body = trendText(trend);
    return Boolean(market && market.aliases.some(function (alias) {
      return new RegExp("\\b" + normalize(alias).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(body);
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

  function pctText(trend) {
    var dominance = numberValue(trend.win_percentage || trend.win_pct || trend.dominance);
    if (dominance === null) return "";
    if (dominance <= 1) dominance *= 100;
    return dominance.toFixed(dominance % 1 === 0 ? 0 : 1) + "%";
  }

  function recordText(trend) {
    if (trend.record) return trend.record;
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
    var results = trendsForSport(state.sport).filter(function (trend) {
      if (!marketMatches(trend, state.market)) return false;
      if (!factorMatches(trend, state.factor)) return false;
      if ((Number(trend.sample) || 0) < minSample) return false;
      if (state.team !== "all" && normalize(trend.team_abbr) !== normalize(state.team)) return false;
      if (state.opponent !== "all" && normalize(trend.opponent_abbr) !== normalize(state.opponent)) return false;
      if (state.location === "home" && normalize(trend.team_abbr) !== normalize(trend.home_abbr)) return false;
      if (state.location === "away" && normalize(trend.team_abbr) !== normalize(trend.away_abbr)) return false;
      return passesDateFilter(trend);
    });
    return results.sort(sorter);
  }

  function metricForSort(trend, sortId) {
    if (sortId === "sample") return Number(trend.sample) || 0;
    if (sortId === "win_pct") return numberValue(trend.win_percentage || trend.win_pct || trend.dominance) || 0;
    if (sortId === "roi") return numberValue(trend.roi || trend.units || trend.profit_units) || -Infinity;
    if (sortId === "confidence") return numberValue(trend.confidence_score || trend.strength_rating || trend.mind_blowing_score) || -Infinity;
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
  }

  function renderSportOptions() {
    els.sportOptions.innerHTML = supportedSports().map(function (sport) {
      var count = trendsForSport(sport).length;
      return [
        "<button class=\"ts-option" + (state.sport === sport ? " is-selected" : "") + "\" type=\"button\" data-sport=\"" + escapeHtml(sport) + "\">",
        "  <strong>" + escapeHtml(sport) + "</strong>",
        "  <span>" + (count ? count + " verified trend" + (count === 1 ? "" : "s") + " loaded" : "Load verified data") + "</span>",
        "</button>"
      ].join("");
    }).join("");
  }

  function renderTeamFilters() {
    var trends = trendsForSport(state.sport);
    var teams = unique(trends.map(function (trend) { return trend.team_abbr; }));
    var opponents = unique(trends.map(function (trend) { return trend.opponent_abbr; }));
    els.teamFilter.innerHTML = optionHtml("all", "Any team", state.team === "all") + teams.map(function (team) {
      return optionHtml(team, team, state.team === team);
    }).join("");
    els.opponentFilter.innerHTML = optionHtml("all", "Any opponent", state.opponent === "all") + opponents.map(function (opponent) {
      return optionHtml(opponent, opponent, state.opponent === opponent);
    }).join("");
  }

  function updateSummary() {
    var parts = [
      state.sport || "Select sport",
      MARKET_TYPES.find(function (item) { return item.id === state.market; }).label,
      FACTORS.find(function (item) { return item.id === state.factor; }).label
    ];
    els.selectionSummary.textContent = parts.join(" / ");
    els.runButton.disabled = !state.sport;
  }

  async function loadSport(sport) {
    if (!sport || cache[sport]) {
      renderSportOptions();
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
    } catch (error) {
      cache[sport] = { status: "error", trends: [], unavailable_data: [error.message] };
    } finally {
      els.loadingMessage.classList.add("is-hidden");
      renderSportOptions();
      renderTeamFilters();
      updateSummary();
      if (state.generated) renderResults();
    }
  }

  function selectSport(sport) {
    state.sport = sport;
    state.team = "all";
    state.opponent = "all";
    state.generated = false;
    clearResults();
    renderSportOptions();
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

  function explanation(trend) {
    if (trend.why_it_matters) return trend.why_it_matters;
    var record = recordText(trend);
    var pct = pctText(trend);
    return "This trend means " + trend.team_abbr + " matched the stated condition across " + trend.sample + " verified historical games" +
      (record ? " with a " + record + " record" : "") +
      (pct ? " (" + pct + ")" : "") +
      ". The included source games are available in the drilldown.";
  }

  function renderTrend(trend) {
    var pct = pctText(trend);
    var record = recordText(trend);
    var detailId = "trend-" + Math.abs(hashCode(trendId(trend)));
    var confidence = trend.confidence_score || trend.strength_rating || (trend.internal_scoring && trend.internal_scoring.score) || trend.mind_blowing_score;
    var roi = trend.roi || trend.units || trend.profit_units;
    return [
      "<article class=\"ts-result-item\" data-trend-id=\"" + escapeHtml(trendId(trend)) + "\">",
      "  <div class=\"ts-result-label-row\">",
      "    <span class=\"ts-type-label\">" + escapeHtml(labelize(trend.bet_type)) + "</span>",
      trend.rank ? "    <span class=\"ts-rank\">Trend Rank #" + escapeHtml(trend.rank) + "</span>" : "",
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
      supportedValue("Average line/odds", trend.average_line || trend.average_odds),
      supportedValue("ROI / units", roi),
      supportedValue("Confidence / strength", confidence),
      supportedValue("Source data", sourceSummary(trend)),
      supportedValue("Last verified", trend.last_verified_at || trend.generated_at || cache[state.sport] && cache[state.sport].generated_at),
      "  </dl>",
      "  <p class=\"ts-explanation\">" + escapeHtml(explanation(trend)) + "</p>",
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
      supportedValue("Sample size", trend.sample),
      supportedValue("Record", recordText(trend)),
      supportedValue("Win percentage", pctText(trend)),
      supportedValue("ROI", trend.roi),
      supportedValue("Units", trend.units || trend.profit_units),
      supportedValue("Average odds", trend.average_odds),
      supportedValue("Recent form split", trend.recent_form_split),
      supportedValue("Home/away split", trend.home_away_split),
      supportedValue("Market breakdown", trend.market_breakdown || labelize(trend.bet_type)),
      supportedValue("Confidence notes", confidenceNotes(trend)),
      supportedValue("Data freshness", cache[state.sport] && cache[state.sport].generated_at),
      "  </dl>",
      "  <h4>Included games</h4>",
      gamesTable(trend),
      "  <p class=\"ts-muted-line\">Excluded games are not included in the current verified artifact unless a future artifact adds an exclusion log.</p>",
      "</section>"
    ].join("");
  }

  function confidenceNotes(trend) {
    if (trend.confidence_note) return trend.confidence_note;
    if (trend.internal_scoring && trend.internal_scoring.source) return trend.internal_scoring.source;
    if (trend.mind_blowing_score !== undefined) return "Internal Trendspotter score from verified artifact fields.";
    return "No verified confidence or strength score is available for this trend.";
  }

  function queryText() {
    return [
      "sport=" + state.sport,
      "market=" + MARKET_TYPES.find(function (item) { return item.id === state.market; }).label,
      "factor=" + FACTORS.find(function (item) { return item.id === state.factor; }).label,
      "min_sample=" + (state.minSample || 0),
      "team=" + state.team,
      "opponent=" + state.opponent,
      "location=" + state.location,
      "date_start=" + (state.dateStart || "any"),
      "date_end=" + (state.dateEnd || "any")
    ].join(" | ");
  }

  function noResultsText() {
    var market = MARKET_TYPES.find(function (item) { return item.id === state.market; });
    if (market && market.id !== "all") {
      return "No verified " + market.label + " trends available for this selection.";
    }
    return "No verified trends match the selected filters yet.";
  }

  function gamesTable(trend) {
    var rows = (trend.game_log || []).map(function (game, index) {
      var date = Array.isArray(trend.game_dates) ? trend.game_dates[index] : (String(game).match(/\d{4}-\d{2}-\d{2}/) || [""])[0];
      return [
        "<tr>",
        "<td>" + escapeHtml(date || "Unavailable") + "</td>",
        "<td>" + escapeHtml(game) + "</td>",
        "<td>" + escapeHtml(labelize(trend.bet_type)) + "</td>",
        "<td>" + escapeHtml(trend.average_line || trend.average_odds || "Unavailable") + "</td>",
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

  function renderResults() {
    state.generated = true;
    var results = filteredResults();
    els.resultsTitle.textContent = (state.sport || "Verified") + " trend results";
    els.resultCount.textContent = results.length + " trend" + (results.length === 1 ? "" : "s");
    els.resultsSection.classList.remove("is-hidden");
    if (!state.sport) {
      els.resultsList.innerHTML = "<div class=\"ts-no-results\">Select a sport before generating trends.</div>";
      return;
    }
    if (!results.length) {
      els.resultsList.innerHTML = "<div class=\"ts-no-results\">" + escapeHtml(noResultsText()) + "</div>";
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
      supportedValue("Why games counted", "Each row is present in the verified artifact game_log for the trend condition."),
      "  </dl>",
      gamesTable(trend)
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
    if (target === els.trendFactor) state.factor = target.value;
    if (target === els.minSample) state.minSample = target.value;
    if (target === els.dateStart) state.dateStart = target.value;
    if (target === els.dateEnd) state.dateEnd = target.value;
    if (target === els.teamFilter) state.team = target.value;
    if (target === els.opponentFilter) state.opponent = target.value;
    if (target === els.locationFilter) state.location = target.value;
    if (target === els.sortBy) state.sort = target.value;
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

  [els.marketType, els.trendFactor, els.minSample, els.dateStart, els.dateEnd, els.teamFilter, els.opponentFilter, els.locationFilter, els.sortBy].forEach(function (el) {
    el.addEventListener("change", onFilterChange);
    el.addEventListener("input", onFilterChange);
  });
  els.runButton.addEventListener("click", renderResults);

  renderSelects();
  renderSportOptions();
  renderTeamFilters();
  updateSummary();
})();
