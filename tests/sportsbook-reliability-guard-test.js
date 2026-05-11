#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'sportsbook', 'index.html'), 'utf8');
const reliability = fs.readFileSync(path.join(root, 'static', 'js', 'sportsbook-production-fix-persist-reliability.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'static', 'css', 'tmr-redesign-overrides-sportsbook.css'), 'utf8');

assert(
  html.includes('/static/js/sportsbook-production-fix-persist-reliability.js'),
  'sportsbook page must load the primary reliability script'
);
assert(
  !html.includes('tmr-redesign-test-sportsbook-logos.js'),
  'sportsbook page must not rely on the old late DOM logo enhancer'
);
assert(
  !html.includes('var LEGACY_TEAM_LOGOS'),
  'sportsbook page should use the protected reliability logo system instead of the removed inline legacy logo map'
);
assert(
  html.includes('/static/js/sportsbook-production-fix-persist-reliability.js'),
  'sportsbook page must load the protected sportsbook reliability logo system'
);
assert(reliability.includes('CANONICAL_TEAM_LOGOS'), 'canonical team logo map must exist');
assert(reliability.includes('baseball_mlb'), 'canonical logo map must include MLB');
assert(reliability.includes('icehockey_nhl'), 'canonical logo map must include NHL');
assert(reliability.includes('basketball_nba'), 'canonical logo map must include NBA');
assert(reliability.includes('americanfootball_nfl'), 'canonical logo map must include NFL');
assert(reliability.includes('Protected sportsbook logo system'), 'logo renderer must carry the protected-system comment');
assert(reliability.includes('function resolveTeamLogo'), 'logo resolver must exist');
assert(reliability.includes('function renderTeamLogo'), 'logo renderer must exist');
assert(reliability.includes('window.TMR.renderSportsbookTeamLogo = renderTeamLogo'), 'logo renderer must be exposed for legacy paths');
assert(reliability.includes("lockFunction(window.TMR, 'renderSportsbookTeamLogo', renderTeamLogo)"), 'logo renderer exposure must be locked');
assert(reliability.includes("this.parentElement.classList.add(\\'tmr-team-logo-badge--fallback\\')"), 'logo image must mark fallback on load failure');
assert(reliability.includes('this.remove();'), 'broken logo image must be removed on load failure');
assert(reliability.includes('data-tmr-logo-src'), 'logo image must expose its resolved source for live visibility checks');
assert(reliability.includes('loading="eager"'), 'sportsbook logo images must not be lazy-hidden on first board paint');
assert(reliability.includes('referrerpolicy="no-referrer"'), 'sportsbook logo images must keep the ESPN-safe referrer policy');
assert(reliability.includes('renderTeamLogo(game.away_team'), 'away matchup logo must render in the primary board');
assert(reliability.includes('renderTeamLogo(game.home_team'), 'home matchup logo must render in the primary board');
assert(css.includes('.tmr-team-logo-badge'), 'logo badge CSS must exist');
assert(css.includes('.tmr-team-logo-badge--fallback'), 'logo fallback CSS must exist');
assert(css.includes('SPORTSBOOK_LOGO_VISIBILITY_RESTORE_20260509'), 'final logo visibility restore CSS must remain');
assert(css.includes('.tmr-team-logo-badge .tmr-team-logo-img'), 'logo visibility CSS must target image elements directly');
assert(css.includes('visibility:visible !important'), 'logo visibility CSS must force visible logos');
assert(css.includes('opacity:1 !important'), 'logo visibility CSS must force opaque logos');
assert(css.includes('display:block !important'), 'logo image CSS must force rendered images');
assert(
  /tmr-redesign-overrides-sportsbook\.css\?v=202605(?:09logorestore|11teamname)\d+/.test(html),
  'sportsbook page must load the cache-busted logo restore assets'
);

assert(
  reliability.includes("if (sportKey === 'baseball_mlb' || sportKey === 'icehockey_nhl')"),
  'alternate totals must be limited to MLB/NHL'
);
assert(
  reliability.includes("addRawMarketGroup('alt_totals', 'Alt Totals', ['alt_totals', 'alternate_totals'])"),
  'alternate totals must be wired from feed-provided alt_totals aliases'
);
assert(reliability.includes("if (item.source === 'manual') return false"), 'manual placeholder markets must be stripped');
assert(reliability.includes("case 'alt_totals':"), 'alt totals must map into the pick slip');
assert(reliability.includes("case 'alternate_totals':"), 'alternate_totals alias must map into the pick slip');
assert(reliability.includes("marketType = 'alt_totals'; groupLabel = 'Alt Totals';"), 'legacy alt total selections must preserve market type');
assert(reliability.includes("alternate_totals: 'Alt Total'"), 'alternate_totals alias must have a clean market label');

assert(reliability.includes('stake_mode: stakeMode'), 'submit payload must preserve stake_mode');
assert(reliability.includes('units_mode: stakeMode'), 'submit payload must preserve units_mode');
assert(reliability.includes('market_key: option.market_key'), 'submit payload must preserve market_key');
assert(reliability.includes('market_label: option.group_label'), 'submit payload must preserve market label');
assert(reliability.includes('game_snapshot: buildSubmittedGameSnapshot(option)'), 'submit payload must preserve game context');

console.log('sportsbook reliability guard test passed');
