/* TrustMyRecord - shared TeamLogo helper (single source of truth).
 * window.TMRTeamLogo.html(name, {className}) -> logo mark, or '' when there is
 * no real artwork (no badge, no initials, no empty box).
 * Self-contained: team name -> slug -> ESPN CDN logo. No network needed.
 * Used by the profile header affiliation chips AND the fan-identity favorite/
 * rival chips so the logo logic is never duplicated.
 */
(function () {
  'use strict';
  if (window.TMRTeamLogo) return;

  // Team slug -> "<espnLeague>/<espnAbbr>" for the four major pro leagues.
  var ABBR = {
  'anaheim-ducks':'nhl/ana',
  'arizona-cardinals':'nfl/ari',
  'arizona-diamondbacks':'mlb/ari',
  'athletics':'mlb/ath',
  'atlanta-braves':'mlb/atl',
  'atlanta-falcons':'nfl/atl',
  'atlanta-hawks':'nba/atl',
  'baltimore-orioles':'mlb/bal',
  'baltimore-ravens':'nfl/bal',
  'boston-bruins':'nhl/bos',
  'boston-celtics':'nba/bos',
  'boston-red-sox':'mlb/bos',
  'brooklyn-nets':'nba/bkn',
  'buffalo-bills':'nfl/buf',
  'buffalo-sabres':'nhl/buf',
  'calgary-flames':'nhl/cgy',
  'carolina-hurricanes':'nhl/car',
  'carolina-panthers':'nfl/car',
  'charlotte-hornets':'nba/cha',
  'chicago-bears':'nfl/chi',
  'chicago-blackhawks':'nhl/chi',
  'chicago-bulls':'nba/chi',
  'chicago-cubs':'mlb/chc',
  'chicago-white-sox':'mlb/chw',
  'cincinnati-bengals':'nfl/cin',
  'cincinnati-reds':'mlb/cin',
  'cleveland-browns':'nfl/cle',
  'cleveland-cavaliers':'nba/cle',
  'cleveland-guardians':'mlb/cle',
  'colorado-avalanche':'nhl/col',
  'colorado-rockies':'mlb/col',
  'columbus-blue-jackets':'nhl/cbj',
  'dallas-cowboys':'nfl/dal',
  'dallas-mavericks':'nba/dal',
  'dallas-stars':'nhl/dal',
  'denver-broncos':'nfl/den',
  'denver-nuggets':'nba/den',
  'detroit-lions':'nfl/det',
  'detroit-pistons':'nba/det',
  'detroit-red-wings':'nhl/det',
  'detroit-tigers':'mlb/det',
  'edmonton-oilers':'nhl/edm',
  'florida-panthers':'nhl/fla',
  'golden-state-warriors':'nba/gs',
  'green-bay-packers':'nfl/gb',
  'houston-astros':'mlb/hou',
  'houston-rockets':'nba/hou',
  'houston-texans':'nfl/hou',
  'indiana-pacers':'nba/ind',
  'indianapolis-colts':'nfl/ind',
  'jacksonville-jaguars':'nfl/jax',
  'kansas-city-chiefs':'nfl/kc',
  'kansas-city-royals':'mlb/kc',
  'la-clippers':'nba/lac',
  'las-vegas-raiders':'nfl/lv',
  'los-angeles-angels':'mlb/laa',
  'los-angeles-chargers':'nfl/lac',
  'los-angeles-clippers':'nba/lac',
  'los-angeles-dodgers':'mlb/lad',
  'los-angeles-kings':'nhl/la',
  'los-angeles-lakers':'nba/lal',
  'los-angeles-rams':'nfl/lar',
  'memphis-grizzlies':'nba/mem',
  'miami-dolphins':'nfl/mia',
  'miami-heat':'nba/mia',
  'miami-marlins':'mlb/mia',
  'milwaukee-brewers':'mlb/mil',
  'milwaukee-bucks':'nba/mil',
  'minnesota-timberwolves':'nba/min',
  'minnesota-twins':'mlb/min',
  'minnesota-vikings':'nfl/min',
  'minnesota-wild':'nhl/min',
  'montreal-canadiens':'nhl/mtl',
  'nashville-predators':'nhl/nsh',
  'new-england-patriots':'nfl/ne',
  'new-jersey-devils':'nhl/nj',
  'new-orleans-pelicans':'nba/no',
  'new-orleans-saints':'nfl/no',
  'new-york-giants':'nfl/nyg',
  'new-york-islanders':'nhl/nyi',
  'new-york-jets':'nfl/nyj',
  'new-york-knicks':'nba/ny',
  'new-york-mets':'mlb/nym',
  'new-york-rangers':'nhl/nyr',
  'new-york-yankees':'mlb/nyy',
  'oakland-athletics':'mlb/oak',
  'oklahoma-city-thunder':'nba/okc',
  'orlando-magic':'nba/orl',
  'ottawa-senators':'nhl/ott',
  'philadelphia-76ers':'nba/phi',
  'philadelphia-eagles':'nfl/phi',
  'philadelphia-flyers':'nhl/phi',
  'philadelphia-phillies':'mlb/phi',
  'phoenix-suns':'nba/phx',
  'pittsburgh-penguins':'nhl/pit',
  'pittsburgh-pirates':'mlb/pit',
  'pittsburgh-steelers':'nfl/pit',
  'portland-trail-blazers':'nba/por',
  'sacramento-kings':'nba/sac',
  'san-antonio-spurs':'nba/sa',
  'san-diego-padres':'mlb/sd',
  'san-francisco-49ers':'nfl/sf',
  'san-francisco-giants':'mlb/sf',
  'san-jose-sharks':'nhl/sj',
  'seattle-kraken':'nhl/sea',
  'seattle-mariners':'mlb/sea',
  'seattle-seahawks':'nfl/sea',
  'st-louis-blues':'nhl/stl',
  'st-louis-cardinals':'mlb/stl',
  'tampa-bay-buccaneers':'nfl/tb',
  'tampa-bay-lightning':'nhl/tb',
  'tampa-bay-rays':'mlb/tb',
  'tennessee-titans':'nfl/ten',
  'texas-rangers':'mlb/tex',
  'toronto-blue-jays':'mlb/tor',
  'toronto-maple-leafs':'nhl/tor',
  'toronto-raptors':'nba/tor',
  'utah-hockey-club':'nhl/utah',
  'utah-jazz':'nba/utah',
  'utah-mammoth':'nhl/utah',
  'vancouver-canucks':'nhl/van',
  'vegas-golden-knights':'nhl/vgk',
  'washington-capitals':'nhl/wsh',
  'washington-commanders':'nfl/wsh',
  'washington-nationals':'mlb/wsh',
  'washington-wizards':'nba/wsh',
  'winnipeg-jets':'nhl/wpg',
  };

  function slugify(v) {
    return String(v == null ? '' : v).toLowerCase()
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* 500px ESPN artwork, in the DARK variant. Every TMR surface that shows these
     marks is dark, and the light variant hides navy-on-navy clubs (Yankees,
     Cowboys, Duke, Texas) almost completely at row size. Same convention the
     Game File logo pipeline already uses. All 127 pro marks and a 60-school
     college sample were HEAD-checked at 200 before this switched over, and a
     miss still falls back to the light mark before the mark is dropped. */
  function variant(name, kind) {
    var slug = slugify(name);
    var ref = ABBR[slug];
    if (ref) {
      var p = ref.split('/');
      return 'https://a.espncdn.com/i/teamlogos/' + p[0] + '/' + kind + '/' + p[1] + '.png';
    }
    /* College: the same artwork the Game File pipeline bakes, from the generated
       slug -> team id map. That file is optional - a page that does not load it
       just shows the club name on its own, with no mark at all. */
    var cat = window.TMRTeamLogoCatalog;
    var id = cat && Object.prototype.hasOwnProperty.call(cat, slug) ? cat[slug] : null;
    if (id) return 'https://a.espncdn.com/i/teamlogos/ncaa/' + kind + '/' + id + '.png';
    return null;
  }
  /* WHICH artwork, decided from the surface the page actually paints. TMR runs
     dark pages (profile, homepage) and light ones (/today/, /trendspotter/) off
     the same component: dark art on a light card is a white logo on white, and
     light art on a dark table hides every navy club. So read the page's own
     background once, at first use, and default to dark - the site default -
     when nothing paints a colour. window.TMR_TL_ART forces it either way. */
  var artKind = null;
  function surfaceArt() {
    if (artKind) return artKind;
    var forced = window.TMR_TL_ART;
    if (forced === '500' || forced === '500-dark') { artKind = forced; return artKind; }
    var lum = null;
    try {
      var els = [document.body, document.documentElement];
      for (var i = 0; i < els.length && lum === null; i++) {
        if (!els[i]) continue;
        var bg = window.getComputedStyle(els[i]).backgroundColor || '';
        var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(bg);
        // A transparent or near-transparent layer paints nothing: keep looking.
        if (m && (m[4] === undefined || parseFloat(m[4]) > 0.5)) {
          lum = 0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3];
        }
      }
    } catch (e) { /* no DOM yet */ }
    var kind = (lum !== null && lum > 140) ? '500' : '500-dark';
    // Only cache once there is a body to have measured; an early call must not
    // freeze a guess for the life of the page.
    try { if (document.body) artKind = kind; } catch (e) {}
    return kind;
  }
  function url(name) { return variant(name, surfaceArt()); }
  function urlLight(name) { return variant(name, '500'); }
  function urlDark(name) { return variant(name, '500-dark'); }

  /* One delegated capture listener instead of a second inline handler: the FIRST
     failure of a mark retries the light artwork and is stopped here, so the
     inline onerror (initials badge) only ever sees a genuine second failure. */
  function onMarkError(e) {
    var t = e && e.target;
    if (!t || !t.classList || !t.classList.contains('tmr-tl-mark-img')) return;
    var alt = t.getAttribute('data-tmr-tl-alt');
    if (alt && !t.getAttribute('data-tmr-tl-retried')) {
      t.setAttribute('data-tmr-tl-retried', '1');
      t.src = alt;
      e.stopPropagation();
    }
  }
  try { document.addEventListener('error', onMarkError, true); } catch (e) { /* no DOM */ }
  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  /* Shared presentation, owned by the component so every view gets the same
     mark without copying sizes into its own stylesheet. Injected once, as the
     FIRST thing in <head>, so a view that genuinely wants a different size can
     still override it (or, better, just re-point --tmr-tl-box/--tmr-tl-art).

     The mark is a fixed-size flex box and the artwork is capped on BOTH axes
     with object-fit:contain, so a tall crest, a wide wordmark and a circular
     roundel all land on the same visual footprint: centred, never stretched,
     never clipped. The fallback badge fills the exact same box, so a missing
     logo never collapses the row or shifts the team name off its column. */
  var CSS = [
    '.tmr-tl-mark{position:relative;display:inline-flex;align-items:center;justify-content:center;',
    'box-sizing:border-box;width:var(--tmr-tl-box,34px);height:var(--tmr-tl-box,34px);',
    'flex:0 0 var(--tmr-tl-box,34px);line-height:1;vertical-align:middle}',
    '.tmr-tl-mark-img{display:block;width:auto;height:auto;',
    'max-width:var(--tmr-tl-art,28px);max-height:var(--tmr-tl-art,28px);',
    'object-fit:contain;object-position:center}',
    '.tmr-tl-mark-fb{display:none;box-sizing:border-box;align-items:center;justify-content:center;',
    'width:var(--tmr-tl-box,34px);height:var(--tmr-tl-box,34px);border-radius:8px;',
    /* Box, centring and type only. The badge skin (border/bed) is left to the
       view, so a surface that already draws its own fallback is not restyled. */
    'border:0;background:transparent;color:#9BA7B8;',
    "font-family:'Inter',sans-serif;font-weight:900;font-size:calc(var(--tmr-tl-box,34px)*.34);",
    'line-height:1;letter-spacing:.02em;text-transform:uppercase}',
    '.tmr-tl-mark.is-fallback .tmr-tl-mark-fb{display:inline-flex}',
    '.tmr-tl-row{display:inline-flex;align-items:center;gap:var(--tmr-tl-gap,9px);min-width:0;vertical-align:middle}',
    '.tmr-tl-row-name{min-width:0;overflow:hidden;text-overflow:ellipsis}',
    /* Tokens are set on the MARK only: the img and the badge inherit them, so a
       view that re-points a token on its own mark still wins on small screens. */
    '@media (max-width:640px){.tmr-tl-mark{--tmr-tl-box:30px;--tmr-tl-art:25px}}'
  ].join('');
  /* Both artwork variants failed: take the whole mark out of the DOM so the
     row is left with the name alone, no reserved box and no badge. */
  var REMOVE_MARK = 'var m=this.parentNode;if(m&&m.parentNode){m.parentNode.removeChild(m);}';

  function injectCss() {
    try {
      var d = document;
      if (!d || !d.head || d.getElementById('tmr-tl-css')) return;
      var st = d.createElement('style');
      st.id = 'tmr-tl-css';
      st.textContent = CSS;
      d.head.insertBefore(st, d.head.firstChild);
    } catch (e) { /* styling is never worth breaking a render over */ }
  }
  injectCss();

  // Reusable logo mark. cls defaults to 'tmr-tl'; the shared tmr-tl-mark*
  // classes ride along on every mark so the sizing above reaches every view.
  function html(name, opts) {
    opts = opts || {};
    var cls = opts.className || 'tmr-tl';
    var u = url(name);
    /* NO_LOGO_NO_PLACEHOLDER_20260907: a club or country with no artwork gets
       NOTHING back - no initials badge, no empty bed, not even a sized box. An
       empty string is not a flex item, so it cannot earn a gap either, and the
       name closes up naturally against whatever sits beside it. */
    if (!u) return '';
    // The retry is always the OTHER variant, so a surface that picked dark
    // falls back to light and a light surface falls back to dark.
    var alt = surfaceArt() === '500' ? urlDark(name) : urlLight(name);
    return '<span class="' + cls + ' tmr-tl-mark">' +
      '<img class="' + cls + '-img tmr-tl-mark-img" src="' + esc(u) + '" alt="" loading="lazy" ' +
      'data-tmr-tl-alt="' + esc(alt || '') + '" ' +
      'onerror="' + REMOVE_MARK + '" />' +
      '</span>';
  }
  // League badge logo for sport chips (NFL/MLB/NBA/NHL); null otherwise.
  var LEAGUES = { nfl: 1, mlb: 1, nba: 1, nhl: 1 };
  function leagueUrl(sport) {
    var k = String(sport || '').toLowerCase().replace(/\s+fan$/, '').trim();
    return LEAGUES[k] ? 'https://a.espncdn.com/i/teamlogos/leagues/500/' + k + '.png' : null;
  }
  // Which of the four pro leagues a team name belongs to, from the same table
  // the logo URL comes from, so the two can never disagree. Null when unknown
  // (college, soccer, tennis, a typo) - callers must treat that as "no league",
  // never as a default.
  function league(name) {
    var ref = ABBR[slugify(name)];
    return ref ? ref.split('/')[0] : null;
  }

  window.TMRTeamLogo = {
    slugify: slugify, url: url, urlLight: urlLight, urlDark: urlDark, html: html, initials: initials,
    leagueUrl: leagueUrl, league: league
  };
})();
