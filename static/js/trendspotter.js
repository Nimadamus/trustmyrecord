(function () {
  "use strict";

  var SPORTS = ["NBA", "NHL", "NFL", "MLB"];
  var selectedSport = "NBA";
  var cache = {};

  var els = {
    sportSelect: document.getElementById("sportSelect"),
    teamAInput: document.getElementById("teamAInput"),
    teamBInput: document.getElementById("teamBInput"),
    teamOptions: document.getElementById("teamOptions"),
    matchupSelect: document.getElementById("matchupSelect"),
    generateBtn: document.getElementById("generateBtn"),
    statusPill: document.getElementById("tsStatusPill"),
    selectionHint: document.getElementById("selectionHint"),
    summarySport: document.getElementById("summarySport"),
    summaryMatchup: document.getElementById("summaryMatchup"),
    summaryCount: document.getElementById("summaryCount"),
    summaryArtifact: document.getElementById("summaryArtifact"),
    message: document.getElementById("tsMessage"),
    loading: document.getElementById("tsLoading"),
    overviewTitle: document.getElementById("overviewTitle"),
    overviewGrid: document.getElementById("overviewGrid"),
    teamTrendTitle: document.getElementById("teamTrendTitle"),
    teamAHeading: document.getElementById("teamAHeading"),
    teamBHeading: document.getElementById("teamBHeading"),
    teamATrends: document.getElementById("teamATrends"),
    teamBTrends: document.getElementById("teamBTrends"),
    h2hTrends: document.getElementById("h2hTrends"),
    venueTrends: document.getElementById("venueTrends"),
    formTrends: document.getElementById("formTrends"),
    spreadTrends: document.getElementById("spreadTrends"),
    totalTrends: document.getElementById("totalTrends"),
    sourceList: document.getElementById("sourceList"),
    unavailableList: document.getElementById("unavailableList"),
    teamCard: document.getElementById("teamCard"),
    h2hCard: document.getElementById("h2hCard"),
    venueCard: document.getElementById("venueCard"),
    formCard: document.getElementById("formCard"),
    marketGrid: document.getElementById("marketGrid"),
    spreadCard: document.getElementById("spreadCard"),
    totalCard: document.getElementById("totalCard"),
    dataCard: document.getElementById("dataCard")
  };

  function apiBase() {
    if (window.CONFIG && window.CONFIG.api && window.CONFIG.api.baseUrl) {
      return String(window.CONFIG.api.baseUrl).replace(/\/+$/, "");
    }
    return "https://trustmyrecord-api.onrender.com/api";
  }

  function text(value, fallback) {
    if (value === undefined || value === null || value === "") return fallback || "Unavailable";
    return String(value);
  }

  function normalize(value) {
    return text(value, "").trim().toUpperCase();
  }

  function escapeHtml(value) {
    return text(value, "").replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
      }[char];
    });
  }

  function formatDate(value) {
    if (!value) return "Unavailable";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return text(value);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function setLoading(isLoading) {
    els.loading.classList.toggle("is-hidden", !isLoading);
    els.generateBtn.disabled = isLoading;
  }

  function setMessage(kind, html) {
    els.message.className = "ts-message";
    if (!html) {
      els.message.classList.add("is-hidden");
      els.message.innerHTML = "";
      return;
    }
    if (kind) els.message.classList.add("is-" + kind);
    els.message.innerHTML = html;
  }

  function setStatus(status, label) {
    els.statusPill.className = "ts-status-pill";
    if (status === "missing" || status === "stale") els.statusPill.classList.add("is-" + status);
    if (status === "invalid" || status === "error") els.statusPill.classList.add("is-error");
    els.statusPill.textContent = label;
  }

  function trendScore(trend) {
    var score = trend.internal_scoring || {};
    if (score.label === "internal_trendspotter_score") {
      var value = score.score === null || score.score === undefined ? "Unavailable" : score.score;
      var tier = score.tier ? " / Tier " + score.tier : "";
      return value + tier;
    }
    if (trend.mind_blowing_score !== undefined || trend.mind_blowing_tier !== undefined) {
      return text(trend.mind_blowing_score) + (trend.mind_blowing_tier ? " / Tier " + trend.mind_blowing_tier : "");
    }
    return "Unavailable";
  }

  function trendTeams(trend) {
    return [trend.team_abbr, trend.opponent_abbr, trend.home_abbr, trend.away_abbr].map(normalize).filter(Boolean);
  }

  function pairMatchesTrend(trend, teamA, teamB) {
    var teams = trendTeams(trend);
    return teams.indexOf(teamA) !== -1 && teams.indexOf(teamB) !== -1;
  }

  function matchupTeams(matchup) {
    var parts = text(matchup, "").split(/\s+@\s+|\s+vs\.?\s+/i).map(normalize).filter(Boolean);
    return parts.length === 2 ? parts : [];
  }

  function trendMatchesSelection(trend, selection) {
    if (selection.matchup) return trend.matchup === selection.matchup;
    if (selection.teamA && selection.teamB) return pairMatchesTrend(trend, selection.teamA, selection.teamB);
    return false;
  }

  function uniqueValues(values) {
    return Array.from(new Set(values.filter(Boolean))).sort();
  }

  function getTeams(trends) {
    return uniqueValues(trends.flatMap(function (trend) {
      return [trend.team_abbr, trend.opponent_abbr, trend.home_abbr, trend.away_abbr].map(normalize);
    }));
  }

  function getMatchups(trends) {
    return uniqueValues(trends.map(function (trend) { return trend.matchup; }));
  }

  function pairFromMatchup(data, matchup) {
    var trends = Array.isArray(data && data.trends) ? data.trends : [];
    var trend = trends.find(function (item) { return item.matchup === matchup; });
    if (trend && (trend.away_abbr || trend.home_abbr)) {
      return { away: normalize(trend.away_abbr), home: normalize(trend.home_abbr) };
    }
    return { away: "", home: "" };
  }

  function getSelectedPair(data, matchup, fallbackA, fallbackB) {
    var fromArtifact = pairFromMatchup(data, matchup);
    if (fromArtifact.away || fromArtifact.home) return fromArtifact;
    var fromMatchup = matchupTeams(matchup);
    if (fromMatchup.length === 2) return { away: fromMatchup[0], home: fromMatchup[1] };
    return { away: normalize(fallbackA), home: normalize(fallbackB) };
  }

  function getArtifactName(data) {
    if (typeof data.artifact === "string") return data.artifact;
    if (data.artifact && data.artifact.fileName) return data.artifact.fileName;
    return "Unavailable";
  }

  function trendMeta(trend) {
    return [
      ["Market", text(trend.bet_type)],
      ["Type", text(trend.trend_type || trend.kind)],
      ["Sample", trend.sample ? text(trend.sample) + " games" : "Unavailable"],
      ["Internal score", trendScore(trend)],
      ["Date range", text(trend.date_range)]
    ];
  }

  function renderTrend(trend) {
    var sourceUrl = trend.source_url ? String(trend.source_url) : "";
    var sourceLink = sourceUrl
      ? "<a class=\"ts-source-link\" href=\"" + escapeHtml(sourceUrl) + "\" target=\"_blank\" rel=\"noopener\">Open verified source</a>"
      : "";
    return [
      "<article class=\"ts-trend-card\">",
      "  <div class=\"ts-trend-head\">",
      "    <div>",
      "      <h4>" + escapeHtml(text(trend.team_abbr)) + " vs " + escapeHtml(text(trend.opponent_abbr)) + "</h4>",
      "      <p class=\"ts-trend-claim\">" + escapeHtml(text(trend.claim)) + "</p>",
      "    </div>",
      "    <span class=\"ts-trend-rank\">#" + escapeHtml(text(trend.rank)) + "</span>",
      "  </div>",
      "  <div class=\"ts-trend-meta\">" + trendMeta(trend).map(function (item) {
        return "<div><span>" + escapeHtml(item[0]) + "</span><strong>" + escapeHtml(item[1]) + "</strong></div>";
      }).join("") + "</div>",
      "  <div class=\"ts-explain\">",
      "    <article><h5>Why it matters</h5><p>" + escapeHtml(text(trend.why_it_matters)) + "</p></article>",
      "    <article><h5>Score source</h5><p>" + escapeHtml(text((trend.internal_scoring && trend.internal_scoring.source) || "Internal scoring unavailable.")) + "</p></article>",
      "  </div>",
      sourceLink,
      "</article>"
    ].join("");
  }

  function unavailableCard(message) {
    return "<div class=\"ts-unavailable\">" + escapeHtml(message) + "</div>";
  }

  function renderTrendGroup(el, trends, message) {
    if (!trends.length) {
      el.innerHTML = unavailableCard(message);
      return;
    }
    el.innerHTML = trends.map(renderTrend).join("");
  }

  function setSectionVisible(el, isVisible) {
    if (el) el.classList.toggle("is-hidden", !isVisible);
  }

  function renderList(el, items, fallback) {
    var values = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!values.length) {
      el.innerHTML = "<li>" + escapeHtml(fallback) + "</li>";
      return;
    }
    el.innerHTML = values.map(function (item) {
      if (typeof item === "string") return "<li>" + escapeHtml(item) + "</li>";
      var name = item.name || item.label || "Verified artifact";
      var status = item.status ? " - " + item.status : "";
      var purpose = item.purpose ? ": " + item.purpose : "";
      return "<li><strong>" + escapeHtml(name) + "</strong>" + escapeHtml(status + purpose) + "</li>";
    }).join("");
  }

  function categoryMatcher(kind) {
    return function (trend) {
      var betType = normalize(trend.bet_type);
      var trendType = normalize(trend.trend_type || trend.kind);
      var side = normalize(trend.side);
      var claim = normalize([trend.claim, trend.subset].join(" "));
      if (kind === "h2h") return trendType === "H2H" || claim.indexOf("HEAD") !== -1 || claim.indexOf("H2H") !== -1;
      if (kind === "venue") return side === "HOME" || side === "AWAY" || claim.indexOf(" HOME") !== -1 || claim.indexOf(" ROAD") !== -1 || claim.indexOf(" ON THE ROAD") !== -1 || claim.indexOf(" AT HOME") !== -1;
      if (kind === "form") return trendType === "STREAK" || trendType === "RECORD" || claim.indexOf("STREAK") !== -1 || claim.indexOf("AFTER ") !== -1 || claim.indexOf("COMING OFF") !== -1 || claim.indexOf("LAST ") !== -1;
      if (kind === "spread") return betType === "SPREAD" || betType === "RUN_LINE" || betType === "PUCK_LINE";
      if (kind === "total") return betType === "TOTAL" || betType === "TEAM_TOTAL" || claim.indexOf("OVER") !== -1 || claim.indexOf("UNDER") !== -1;
      return false;
    };
  }

  function unavailableNotices(data, selection, filteredTrends) {
    var notices = [];
    var baseUnavailable = Array.isArray(data.unavailable_data) ? data.unavailable_data.slice() : [];
    baseUnavailable.forEach(function (item) { notices.push(item); });
    if (!filteredTrends.length) {
      notices.push("No verified trends in the selected artifact match this exact matchup.");
    }
    if (!filteredTrends.some(categoryMatcher("h2h"))) notices.push("Head-to-head trend data is unavailable for this matchup.");
    if (!selection.home || !selection.away) notices.push("Home/road venue is unavailable because the verified artifact did not identify home and away teams.");
    if (!filteredTrends.some(categoryMatcher("venue"))) notices.push("Home/road trend data is unavailable for this matchup.");
    if (!filteredTrends.some(categoryMatcher("form"))) notices.push("Recent form trend data is unavailable for this matchup.");
    if (!filteredTrends.some(categoryMatcher("spread"))) notices.push(selection.sport === "MLB" ? "Run line trend data is unavailable." : "Spread trend data is unavailable for this matchup.");
    if (!filteredTrends.some(categoryMatcher("total"))) notices.push("Total or over-under trend data is unavailable for this matchup.");
    notices.push("Odds, injuries, user picks, user records, pending picks, and recommendations are not generated by Trendspotter.");
    renderList(els.unavailableList, uniqueValues(notices), "No unavailable data labels were returned.");
  }

  function renderOverview(data, selection, filteredTrends) {
    var slateDates = uniqueValues(filteredTrends.map(function (trend) { return trend.slate_date; }));
    var generated = formatDate(data.generated_at);
    var venue = selection.away && selection.home ? selection.away + " @ " + selection.home : "Unavailable";
    els.overviewTitle.textContent = selection.label || "Select a matchup";
    els.overviewGrid.innerHTML = [
      ["Sport", selection.sport],
      ["Matchup", selection.label || "Unavailable"],
      ["Venue", venue],
      ["Slate date", slateDates[0] || "Unavailable"],
      ["Artifact generated", generated],
      ["Verified trends found", String(filteredTrends.length)]
    ].map(function (item) {
      return "<div><span>" + escapeHtml(item[0]) + "</span><strong>" + escapeHtml(item[1]) + "</strong></div>";
    }).join("");
  }

  function renderResults(data, selection) {
    var trends = Array.isArray(data.trends) ? data.trends : [];
    var filtered = trends.filter(function (trend) { return trendMatchesSelection(trend, selection); });
    var teamA = selection.teamA || selection.away;
    var teamB = selection.teamB || selection.home;
    var teamATrends = filtered.filter(function (trend) { return normalize(trend.team_abbr) === teamA; });
    var teamBTrends = filtered.filter(function (trend) { return normalize(trend.team_abbr) === teamB; });
    var h2hTrends = filtered.filter(categoryMatcher("h2h"));
    var venueTrends = filtered.filter(categoryMatcher("venue"));
    var formTrends = filtered.filter(categoryMatcher("form"));
    var spreadTrends = filtered.filter(categoryMatcher("spread"));
    var totalTrends = filtered.filter(categoryMatcher("total"));

    els.summarySport.textContent = selection.sport;
    els.summaryMatchup.textContent = selection.label || "Unavailable";
    els.summaryCount.textContent = String(filtered.length);
    els.summaryArtifact.textContent = getArtifactName(data);
    els.teamTrendTitle.textContent = (teamA || "Team A") + " and " + (teamB || "Team B");
    els.teamAHeading.textContent = (teamA || "Team A") + " trends";
    els.teamBHeading.textContent = (teamB || "Team B") + " trends";

    renderOverview(data, selection, filtered);
    setSectionVisible(els.teamCard, filtered.length > 0);
    setSectionVisible(els.h2hCard, h2hTrends.length > 0);
    setSectionVisible(els.venueCard, venueTrends.length > 0);
    setSectionVisible(els.formCard, formTrends.length > 0);
    setSectionVisible(els.spreadCard, spreadTrends.length > 0);
    setSectionVisible(els.totalCard, totalTrends.length > 0);
    setSectionVisible(els.marketGrid, spreadTrends.length > 0 || totalTrends.length > 0);

    if (filtered.length) {
      renderTrendGroup(els.teamATrends, teamATrends, "No verified trend for this team in the selected matchup.");
      renderTrendGroup(els.teamBTrends, teamBTrends, "No verified trend for this team in the selected matchup.");
    } else {
      els.teamATrends.innerHTML = "";
      els.teamBTrends.innerHTML = "";
    }
    renderTrendGroup(els.h2hTrends, h2hTrends, "");
    renderTrendGroup(els.venueTrends, venueTrends, "");
    renderTrendGroup(els.formTrends, formTrends, "");
    renderTrendGroup(els.spreadTrends, spreadTrends, "");
    renderTrendGroup(els.totalTrends, totalTrends, "");
    renderList(els.sourceList, data.data_sources, "Source details unavailable in the verified artifact.");
    unavailableNotices(data, selection, filtered);

    if (!filtered.length) {
      setMessage("warning", "<strong>Verified matchup trends unavailable.</strong> The selected matchup has no matching verified trend records in the current artifact. No placeholder trends are shown.");
    } else {
      setMessage("", "");
    }
  }

  function resetResults(sport) {
    els.summarySport.textContent = sport;
    els.summaryMatchup.textContent = "--";
    els.summaryCount.textContent = "--";
    els.summaryArtifact.textContent = "--";
    els.overviewTitle.textContent = "Select a matchup";
    els.overviewGrid.innerHTML = "";
    setSectionVisible(els.teamCard, false);
    setSectionVisible(els.h2hCard, false);
    setSectionVisible(els.venueCard, false);
    setSectionVisible(els.formCard, false);
    setSectionVisible(els.marketGrid, false);
    setSectionVisible(els.spreadCard, false);
    setSectionVisible(els.totalCard, false);
    setSectionVisible(els.dataCard, true);
    [
      els.teamATrends,
      els.teamBTrends,
      els.h2hTrends,
      els.venueTrends,
      els.formTrends,
      els.spreadTrends,
      els.totalTrends
    ].forEach(function (el) {
      el.innerHTML = "";
    });
    renderList(els.sourceList, [], "Load a sport to see verified sources.");
    renderList(els.unavailableList, [], "Select a matchup to see availability notices.");
  }

  function buildControls(data, sport) {
    var trends = Array.isArray(data.trends) ? data.trends : [];
    var teams = getTeams(trends);
    var matchups = getMatchups(trends);

    els.teamOptions.innerHTML = teams.map(function (team) {
      return "<option value=\"" + escapeHtml(team) + "\"></option>";
    }).join("");

    els.matchupSelect.innerHTML = "<option value=\"\">Select a verified matchup board</option>" + matchups.map(function (matchup) {
      return "<option value=\"" + escapeHtml(matchup) + "\">" + escapeHtml(matchup) + "</option>";
    }).join("");

    if (!matchups.length) {
      els.matchupSelect.innerHTML = "<option value=\"\">No verified matchup board available</option>";
    }

    els.teamAInput.value = "";
    els.teamBInput.value = "";
    els.selectionHint.textContent = matchups.length
      ? "Select one of " + matchups.length + " verified matchups, or choose two teams from the artifact."
      : "No verified matchup board is available for " + sport + ".";
  }

  function getSelection(data) {
    var matchup = els.matchupSelect.value;
    var pair = getSelectedPair(data, matchup, els.teamAInput.value, els.teamBInput.value);
    var teamA = normalize(els.teamAInput.value) || pair.away;
    var teamB = normalize(els.teamBInput.value) || pair.home;
    return {
      sport: selectedSport,
      matchup: matchup,
      teamA: teamA,
      teamB: teamB,
      away: pair.away,
      home: pair.home,
      label: matchup || (teamA && teamB ? teamA + " vs " + teamB : "")
    };
  }

  function generate() {
    var data = cache[selectedSport];
    if (!data) return;
    var trends = Array.isArray(data.trends) ? data.trends : [];
    if (data.status === "missing" || !trends.length) {
      resetResults(selectedSport);
      els.summaryCount.textContent = "0";
      els.summaryArtifact.textContent = getArtifactName(data);
      setStatus("missing", selectedSport + " unavailable");
      setMessage("warning", "<strong>" + escapeHtml(selectedSport) + " unavailable.</strong> Verified trend data is not available yet. No placeholder matchup trends are shown.");
      renderList(els.sourceList, data.data_sources, "No verified source artifact is available for this sport.");
      renderList(els.unavailableList, data.unavailable_data, "Verified trend data is not available yet.");
      return;
    }

    var selection = getSelection(data);
    if (!selection.matchup && (!selection.teamA || !selection.teamB)) {
      setMessage("warning", "<strong>Select a matchup.</strong> Choose two teams or select a verified matchup board before generating trends.");
      return;
    }
    renderResults(data, selection);
  }

  async function loadSport(sport) {
    selectedSport = sport;
    els.sportSelect.value = sport;
    resetResults(sport);
    setLoading(true);
    setStatus("loading", "Loading " + sport);
    setMessage("", "");

    try {
      var response = await fetch(apiBase() + "/trendspotter/verified?sport=" + encodeURIComponent(sport), {
        headers: { "Accept": "application/json" },
        cache: "no-store"
      });
      var data = await response.json().catch(function () { return null; });
      if (!response.ok && (!data || !data.status)) {
        throw new Error("Trendspotter API returned " + response.status);
      }
      data = data || { status: "error", trends: [], trend_count: 0 };
      cache[sport] = data;
      buildControls(data, sport);
      els.summaryArtifact.textContent = getArtifactName(data);

      if (data.status === "missing" || !(Array.isArray(data.trends) && data.trends.length)) {
        setStatus("missing", sport + " unavailable");
        generate();
        return;
      }

      setStatus(data.status, sport + " verified");
      if (data.status === "stale") {
        setMessage("warning", "<strong>Stale verified artifact.</strong> This data passed validation, but it is outside the freshness window.");
      }

      if (els.matchupSelect.options.length > 1) {
        els.matchupSelect.selectedIndex = 1;
        var pair = getSelectedPair(data, els.matchupSelect.value, "", "");
        els.teamAInput.value = pair.away || "";
        els.teamBInput.value = pair.home || "";
        generate();
      }
    } catch (error) {
      cache[sport] = { status: "error", trends: [], trend_count: 0, data_sources: [], unavailable_data: [] };
      buildControls(cache[sport], sport);
      resetResults(sport);
      setStatus("error", sport + " error");
      setMessage("error", "<strong>Trendspotter could not load.</strong> " + escapeHtml(error.message));
      renderList(els.sourceList, [], "Source details unavailable because the API request failed.");
      renderList(els.unavailableList, [], "Availability could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  els.sportSelect.addEventListener("change", function () {
    var sport = els.sportSelect.value;
    if (SPORTS.indexOf(sport) !== -1) loadSport(sport);
  });

  els.matchupSelect.addEventListener("change", function () {
    var pair = getSelectedPair(cache[selectedSport], els.matchupSelect.value, "", "");
    els.teamAInput.value = pair.away || "";
    els.teamBInput.value = pair.home || "";
    if (els.matchupSelect.value) generate();
  });

  els.generateBtn.addEventListener("click", generate);
  els.teamAInput.addEventListener("change", function () { els.matchupSelect.value = ""; });
  els.teamBInput.addEventListener("change", function () { els.matchupSelect.value = ""; });

  resetResults(selectedSport);
  loadSport(selectedSport);
})();
