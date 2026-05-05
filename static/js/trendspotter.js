(function () {
  "use strict";

  var SPORTS = ["NBA", "NHL", "NFL", "MLB"];
  var selectedSport = "NBA";
  var cache = {};

  var els = {
    tabs: document.querySelectorAll("[data-sport]"),
    statusPill: document.getElementById("tsStatusPill"),
    summarySport: document.getElementById("summarySport"),
    summaryCount: document.getElementById("summaryCount"),
    summaryArtifact: document.getElementById("summaryArtifact"),
    summaryGenerated: document.getElementById("summaryGenerated"),
    message: document.getElementById("tsMessage"),
    loading: document.getElementById("tsLoading"),
    trendList: document.getElementById("trendList"),
    trendHeading: document.getElementById("trendHeading"),
    sourceList: document.getElementById("sourceList"),
    unavailableList: document.getElementById("unavailableList")
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

  function renderTrend(trend, index) {
    var rank = trend.rank || index + 1;
    var sourceUrl = trend.source_url ? String(trend.source_url) : "";
    var sourceLink = sourceUrl
      ? "<a class=\"ts-source-link\" href=\"" + escapeHtml(sourceUrl) + "\" target=\"_blank\" rel=\"noopener\">Open source schedule</a>"
      : "";

    return [
      "<article class=\"ts-trend-card\">",
      "  <div class=\"ts-trend-head\">",
      "    <div>",
      "      <h3>" + escapeHtml(text(trend.matchup)) + "</h3>",
      "      <p class=\"ts-trend-claim\">" + escapeHtml(text(trend.claim)) + "</p>",
      "    </div>",
      "    <span class=\"ts-trend-rank\">#" + escapeHtml(rank) + "</span>",
      "  </div>",
      "  <div class=\"ts-trend-meta\">",
      "    <div><span>Market</span><strong>" + escapeHtml(text(trend.bet_type)) + "</strong></div>",
      "    <div><span>Trend type</span><strong>" + escapeHtml(text(trend.trend_type || trend.kind)) + "</strong></div>",
      "    <div><span>Sample</span><strong>" + escapeHtml(text(trend.sample)) + " games</strong></div>",
      "    <div><span>Internal score</span><strong>" + escapeHtml(trendScore(trend)) + "</strong></div>",
      "  </div>",
      "  <div class=\"ts-explain\">",
      "    <article><h4>Why it matters</h4><p>" + escapeHtml(text(trend.why_it_matters)) + "</p></article>",
      "    <article><h4>Score source</h4><p>" + escapeHtml(text((trend.internal_scoring && trend.internal_scoring.source) || "Internal scoring unavailable.")) + "</p></article>",
      "  </div>",
      sourceLink,
      "</article>"
    ].join("");
  }

  function renderData(data, sport) {
    var trends = Array.isArray(data.trends) ? data.trends : [];
    els.summarySport.textContent = sport;
    els.summaryCount.textContent = String(data.trend_count || trends.length || 0);
    els.summaryArtifact.textContent = data.artifact || "Unavailable";
    els.summaryGenerated.textContent = formatDate(data.generated_at);
    els.trendHeading.textContent = sport + " trend artifacts";

    renderList(els.sourceList, data.data_sources, "Source details unavailable in the verified artifact.");
    renderList(els.unavailableList, data.unavailable_data, "No unavailable data labels were returned.");

    if (data.status === "missing" || !trends.length) {
      els.trendList.innerHTML = "";
      setStatus("missing", sport + " unavailable");
      setMessage("warning", "<strong>" + escapeHtml(sport) + " unavailable.</strong> No verified Trendspotter artifact is available for this sport. No placeholder trends are shown.");
      return;
    }

    if (data.status === "stale") {
      setStatus("stale", sport + " stale artifact");
      setMessage("warning", "<strong>Stale verified artifact.</strong> This data passed validation, but it is outside the freshness window.");
    } else {
      setStatus(data.status, sport + " verified");
      setMessage("", "");
    }

    els.trendList.innerHTML = trends.map(renderTrend).join("");
  }

  async function loadSport(sport) {
    selectedSport = sport;
    els.tabs.forEach(function (tab) {
      tab.classList.toggle("is-active", tab.getAttribute("data-sport") === sport);
    });

    if (cache[sport]) {
      renderData(cache[sport], sport);
      return;
    }

    setLoading(true);
    setStatus("loading", "Loading " + sport);
    setMessage("", "");
    els.trendList.innerHTML = "";

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
      renderData(data, sport);
    } catch (error) {
      els.summarySport.textContent = sport;
      els.summaryCount.textContent = "0";
      els.summaryArtifact.textContent = "Unavailable";
      els.summaryGenerated.textContent = "Unavailable";
      els.trendList.innerHTML = "";
      renderList(els.sourceList, [], "Source details unavailable because the API request failed.");
      renderList(els.unavailableList, [], "Availability could not be loaded.");
      setStatus("error", sport + " error");
      setMessage("error", "<strong>Trendspotter could not load.</strong> " + escapeHtml(error.message));
    } finally {
      setLoading(false);
    }
  }

  els.tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      var sport = tab.getAttribute("data-sport");
      if (SPORTS.includes(sport)) loadSport(sport);
    });
  });

  loadSport(selectedSport);
})();
