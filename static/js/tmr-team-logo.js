/* TrustMyRecord - shared TeamLogo helper (single source of truth).
 * window.TMRTeamLogo.html(name, {className}) -> logo mark with initials fallback.
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
  function url(name) {
    var ref = ABBR[slugify(name)];
    if (!ref) return null;
    var p = ref.split('/');
    return 'https://a.espncdn.com/i/teamlogos/' + p[0] + '/500/' + p[1] + '.png';
  }
  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  // Reusable logo mark. cls defaults to 'tmr-tl'; view supplies matching CSS.
  function html(name, opts) {
    opts = opts || {};
    var cls = opts.className || 'tmr-tl';
    var u = url(name);
    var ini = '<span class="' + cls + '-fallback" aria-hidden="true">' + esc(initials(name)) + '</span>';
    if (!u) return '<span class="' + cls + ' is-fallback">' + ini + '</span>';
    return '<span class="' + cls + '">' +
      '<img class="' + cls + '-img" src="' + esc(u) + '" alt="" loading="lazy" ' +
      'onerror="this.style.display=\'none\';this.parentNode.classList.add(\'is-fallback\');" />' +
      ini + '</span>';
  }
  // League badge logo for sport chips (NFL/MLB/NBA/NHL); null otherwise.
  var LEAGUES = { nfl: 1, mlb: 1, nba: 1, nhl: 1 };
  function leagueUrl(sport) {
    var k = String(sport || '').toLowerCase().replace(/\s+fan$/, '').trim();
    return LEAGUES[k] ? 'https://a.espncdn.com/i/teamlogos/leagues/500/' + k + '.png' : null;
  }

  window.TMRTeamLogo = { slugify: slugify, url: url, html: html, initials: initials, leagueUrl: leagueUrl };
})();
