(function () {
  "use strict";

  var SPORTS = ["MLB", "NBA", "NHL", "NFL"];
  var state = { sport: "", matchup: "", trendType: "all" };
  var cache = {};

  var TREND_TYPES = [
    { id: "team", label: "Team trends", shortLabel: "Team trend" },
    { id: "h2h", label: "Head to head trends", shortLabel: "Head to head trend" },
    { id: "total", label: "Over/Under trends", shortLabel: "Total trend" },
    { id: "moneyline", label: "Moneyline trends", shortLabel: "Market trend" },
    { id: "spread", label: "Spread trends", shortLabel: "Market trend" },
    { id: "venue", label: "Home/Away trends", shortLabel: "Home/Away trend" },
    { id: "form", label: "Recent form trends", shortLabel: "Recent form trend" },
    { id: "player", label: "Player trends", shortLabel: "Player trend", requires: hasPlayerData },
    { id: "pitcher", label: "Pitcher trends", shortLabel: "Pitcher trend", sports: ["MLB"], requires: hasPitcherData }
  ];

  var els = {
    sportStep: document.getElementById("sportStep"),
    matchupStep: document.getElementById("matchupStep"),
    trendTypeStep: document.getElementById("trendTypeStep"),
    runStep: document.getElementById("runStep"),
    sportOptions: document.getElementById("sportOptions"),
    matchupOptions: document.getElementById("matchupOptions"),
    matchupLoading: document.getElementById("matchupLoading"),
    matchupEmpty: document.getElementById("matchupEmpty"),
    trendTypeOptions: document.getElementById("trendTypeOptions"),
    selectionSummary: document.getElementById("selectionSummary"),
    runButton: document.getElementById("runTrendspotter"),
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

  function trendsForSport(sport) {
    var data = cache[sport];
    return data && Array.isArray(data.trends) ? data.trends : [];
  }

  function setStepEnabled(el, enabled) {
    el.classList.toggle("is-disabled", !enabled);
    el.setAttribute("aria-disabled", enabled ? "false" : "true");
  }

  function setLoading(isLoading) {
    els.matchupLoading.classList.toggle("is-hidden", !isLoading);
  }

  function clearResults() {
    els.resultsSection.classList.add("is-hidden");
    els.resultsList.innerHTML = "";
    els.resultCount.textContent = "0 trends";
  }

  function updateSummary() {
    var parts = [
      state.sport || "Select sport",
      state.matchup || "Select matchup"
    ];
    els.selectionSummary.textContent = parts.join(" / ");
    els.runButton.disabled = !(state.sport && state.matchup);
    setStepEnabled(els.runStep, false);
  }

  function renderSportOptions() {
    els.sportOptions.innerHTML = SPORTS.map(function (sport) {
      return optionButton({
        group: "sport",
        value: sport,
        title: sport,
        meta: "Load verified matchups",
        selected: state.sport === sport
      });
    }).join("");
  }

  function optionButton(options) {
    return [
      "<button class=\"ts-option" + (options.selected ? " is-selected" : "") + "\" type=\"button\" data-" + options.group + "=\"" + escapeHtml(options.value) + "\">",
      "  <strong>" + escapeHtml(options.title) + "</strong>",
      options.meta ? "  <span>" + escapeHtml(options.meta) + "</span>" : "",
      "</button>"
    ].join("");
  }

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function getMatchups(sport) {
    return unique(trendsForSport(sport).filter(isRenderableTrend).map(function (trend) { return trend.matchup; })).sort();
  }

  function trendText(trend) {
    return normalize([
      trend.bet_type,
      trend.trend_type,
      trend.kind,
      trend.side,
      trend.claim,
      trend.subset,
      trend.market
    ].join(" "));
  }

  function trendMatchesType(trend, typeId) {
    var betType = normalize(trend.bet_type);
    var trendType = normalize(trend.trend_type || trend.kind);
    var side = normalize(trend.side);
    var body = trendText(trend);

    if (typeId === "team") return true;
    if (typeId === "h2h") return trendType === "H2H" || body.indexOf("HEAD") !== -1 || body.indexOf("H2H") !== -1;
    if (typeId === "total") return betType.indexOf("TOTAL") !== -1 || body.indexOf("OVER") !== -1 || body.indexOf("UNDER") !== -1;
    if (typeId === "moneyline") return betType === "MONEYLINE" || trendType === "RECORD" || trendType === "STREAK";
    if (typeId === "spread") return betType === "SPREAD" || betType === "RUN_LINE" || betType === "PUCK_LINE" || body.indexOf("SPREAD") !== -1 || body.indexOf("RUN LINE") !== -1 || body.indexOf("PUCK LINE") !== -1;
    if (typeId === "venue") return side === "HOME" || side === "AWAY" || body.indexOf(" AT HOME") !== -1 || body.indexOf(" ON THE ROAD") !== -1 || body.indexOf(" ROAD") !== -1;
    if (typeId === "form") return trendType === "STREAK" || body.indexOf("AFTER ") !== -1 || body.indexOf("COMING OFF") !== -1 || body.indexOf("LAST ") !== -1;
    if (typeId === "player") return hasPlayerTrend(trend);
    if (typeId === "pitcher") return hasPitcherTrend(trend);
    return false;
  }

  function hasPlayerTrend(trend) {
    return Boolean(trend.player_id || trend.player_name || trend.player || trend.verified_player_data);
  }

  function hasPitcherTrend(trend) {
    var body = trendText(trend);
    return Boolean(trend.pitcher_id || trend.pitcher_name || trend.starting_pitcher || trend.verified_pitcher_data || body.indexOf("PITCHER") !== -1);
  }

  function hasPlayerData(trends) {
    return trends.some(hasPlayerTrend);
  }

  function hasPitcherData(trends) {
    return trends.some(hasPitcherTrend);
  }

  function getTrendType(id) {
    return TREND_TYPES.find(function (type) { return type.id === id; });
  }

  function trendTypesForSelection() {
    var trends = trendsForSport(state.sport).filter(function (trend) {
      return trend.matchup === state.matchup;
    });
    return TREND_TYPES.filter(function (type) {
      if (type.sports && type.sports.indexOf(state.sport) === -1) return false;
      if (type.requires && !type.requires(trends)) return false;
      return true;
    });
  }

  function renderMatchups() {
    var matchups = getMatchups(state.sport);
    els.matchupEmpty.textContent = state.sport
      ? "No verified matchups available yet for this sport."
      : "Choose a sport above to load verified matchups.";
    els.matchupEmpty.classList.toggle("is-hidden", Boolean(matchups.length));
    els.matchupOptions.innerHTML = matchups.map(function (matchup) {
      var count = trendsForSport(state.sport).filter(function (trend) {
        return trend.matchup === matchup && isRenderableTrend(trend);
      }).length;
      return optionButton({
        group: "matchup",
        value: matchup,
        title: matchup,
        meta: count + " verified trend" + (count === 1 ? "" : "s") + " in artifact",
        selected: state.matchup === matchup
      });
    }).join("");
    setStepEnabled(els.matchupStep, Boolean(state.sport));
  }

  function renderTrendTypes() {
    var types = trendTypesForSelection();
    els.trendTypeOptions.innerHTML = types.map(function (type) {
      var count = trendsForSport(state.sport).filter(function (trend) {
        return trend.matchup === state.matchup && trendMatchesType(trend, type.id);
      }).length;
      return optionButton({
        group: "trend-type",
        value: type.id,
        title: type.label,
        meta: count ? count + " verified match" + (count === 1 ? "" : "es") : "Show clean unavailable message if none",
        selected: state.trendType === type.id
      });
    }).join("");
    setStepEnabled(els.trendTypeStep, Boolean(state.matchup));
  }

  function selectSport(sport) {
    state.sport = sport;
    state.matchup = "";
    state.trendType = "all";
    clearResults();
    renderSportOptions();
    setStepEnabled(els.trendTypeStep, false);
    setStepEnabled(els.runStep, false);
    els.matchupOptions.innerHTML = "";
    els.trendTypeOptions.innerHTML = "";
    updateSummary();
    loadSport(sport);
  }

  function selectMatchup(matchup) {
    state.matchup = matchup;
    state.trendType = "all";
    clearResults();
    renderMatchups();
    updateSummary();
    runTrendspotter();
  }

  function selectTrendType(typeId) {
    state.trendType = typeId;
    clearResults();
    renderTrendTypes();
    updateSummary();
  }

  async function loadSport(sport) {
    setLoading(true);
    setStepEnabled(els.matchupStep, true);
    els.matchupEmpty.classList.add("is-hidden");
    try {
      var response = await fetch(apiBase() + "/trendspotter/verified?sport=" + encodeURIComponent(sport), {
        headers: { "Accept": "application/json" },
        cache: "no-store"
      });
      var data = await response.json().catch(function () { return null; });
      cache[sport] = data || { status: "missing", trends: [] };
    } catch (error) {
      cache[sport] = { status: "error", trends: [], unavailable_data: [error.message] };
    } finally {
      setLoading(false);
      renderMatchups();
      updateSummary();
    }
  }

  function trendLabel(type, trend) {
    if (!type || type.id === "all") return trend.bet_type ? String(trend.bet_type).replace(/_/g, " ") : "Verified trend";
    if (type.id === "team") return "Team trend";
    if (type.id === "total") return "Total trend";
    if (type.id === "moneyline" || type.id === "spread") return "Market trend";
    return type.shortLabel;
  }

  function basedOnText(trend) {
    return String(trend.sample) + " verified games / " + String(trend.date_range) + " / source schedule";
  }

  function isRenderableTrend(trend) {
    if (!trend || typeof trend !== "object") return false;
    var required = ["sport", "matchup", "claim", "bet_type", "sample", "date_range", "source_url", "team_abbr"];
    var complete = required.every(function (field) {
      return trend[field] !== undefined && trend[field] !== null && String(trend[field]).trim() !== "";
    });
    if (!complete) return false;
    if (!Array.isArray(trend.game_log) || !trend.game_log.length) return false;
    return true;
  }

  function renderTrend(trend, type) {
    return [
      "<article class=\"ts-result-item\">",
      "  <div class=\"ts-result-label-row\">",
      "    <span class=\"ts-type-label\">" + escapeHtml(trendLabel(type, trend)) + "</span>",
      trend.rank ? "    <span class=\"ts-rank\">#" + escapeHtml(trend.rank) + "</span>" : "",
      "  </div>",
      "  <p class=\"ts-claim\">" + escapeHtml(trend.claim) + "</p>",
      "  <dl class=\"ts-result-meta\">",
      "    <div><dt>Based on</dt><dd>" + escapeHtml(basedOnText(trend)) + "</dd></div>",
      "    <div><dt>Team</dt><dd>" + escapeHtml(trend.team_abbr) + "</dd></div>",
      "    <div><dt>Market</dt><dd>" + escapeHtml(trend.bet_type) + "</dd></div>",
      "  </dl>",
      trend.source_url ? "  <a class=\"ts-source\" href=\"" + escapeHtml(trend.source_url) + "\" target=\"_blank\" rel=\"noopener\">Verified source</a>" : "",
      "</article>"
    ].join("");
  }

  function runTrendspotter() {
    var type = { id: "all", label: "All verified trends", shortLabel: "Verified trend" };
    if (!state.sport || !state.matchup) return;
    var results = trendsForSport(state.sport).filter(function (trend) {
      return trend.matchup === state.matchup && isRenderableTrend(trend);
    });

    els.resultsTitle.textContent = state.matchup + " verified trends";
    els.resultCount.textContent = results.length + " trend" + (results.length === 1 ? "" : "s");
    els.resultsSection.classList.remove("is-hidden");

    if (!results.length) {
      els.resultsList.innerHTML = "<div class=\"ts-no-results\">No verified trends available yet for this matchup.</div>";
      return;
    }
    els.resultsList.innerHTML = results.map(function (trend) {
      return renderTrend(trend, type);
    }).join("");
  }

  document.addEventListener("click", function (event) {
    var sportButton = event.target.closest("[data-sport]");
    if (sportButton) {
      selectSport(sportButton.getAttribute("data-sport"));
      return;
    }

    var matchupButton = event.target.closest("[data-matchup]");
    if (matchupButton && state.sport) {
      selectMatchup(matchupButton.getAttribute("data-matchup"));
      return;
    }

    var typeButton = event.target.closest("[data-trend-type]");
    if (typeButton && state.matchup) {
      selectTrendType(typeButton.getAttribute("data-trend-type"));
    }
  });

  els.runButton.addEventListener("click", runTrendspotter);

  renderSportOptions();
  updateSummary();
})();
