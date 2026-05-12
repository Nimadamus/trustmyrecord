#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'sportsbook', 'index.html'), 'utf8');
const reliability = fs.readFileSync(path.join(root, 'static', 'js', 'sportsbook-production-fix-persist-reliability.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'static', 'css', 'tmr-redesign-overrides-sportsbook.css'), 'utf8');

assert(html.includes('/static/js/sportsbook-production-fix-persist-reliability.js'), 'sportsbook page must load the primary reliability script');
assert(!html.includes('tmr-redesign-test-sportsbook-logos.js'), 'sportsbook page must not rely on the old late DOM logo enhancer');
assert(reliability.includes('CANONICAL_TEAM_LOGOS'), 'canonical team logo map must exist');
assert(reliability.includes('function resolveTeamLogo'), 'logo resolver must exist');
assert(reliability.includes('function renderTeamLogo'), 'logo renderer must exist');
assert(reliability.includes('window.TMR.renderSportsbookTeamLogo = renderTeamLogo'), 'logo renderer must be exposed for legacy paths');
assert(reliability.includes('renderTeamLogo(game.away_team'), 'away matchup logo must render in the primary board');
assert(reliability.includes('renderTeamLogo(game.home_team'), 'home matchup logo must render in the primary board');
assert(css.includes('.tmr-team-logo-badge'), 'logo badge CSS must exist');
assert(css.includes('.tmr-team-logo-badge--fallback'), 'logo fallback CSS must exist');
assert(reliability.includes("if (sportKey === 'baseball_mlb' || sportKey === 'icehockey_nhl')"), 'alternate totals must be limited to MLB/NHL');
assert(reliability.includes("addRawMarketGroup('alt_totals', 'Alt Totals', ['alt_totals', 'alternate_totals'])"), 'alternate totals must use supported feed aliases');
assert(reliability.includes("if (item.source === 'manual') return false"), 'manual placeholder markets must be stripped');
assert(reliability.includes("case 'alt_totals':"), 'alt totals must map into the pick slip');
assert(reliability.includes("case 'alternate_totals':"), 'alternate_totals alias must map into the pick slip');
assert(reliability.includes('stake_mode: stakeMode'), 'submit payload must preserve stake_mode');
assert(reliability.includes('units_mode: stakeMode'), 'submit payload must preserve units_mode');
assert(reliability.includes('market_key: option.market_key'), 'submit payload must preserve market_key');
assert(reliability.includes('game_snapshot: buildSubmittedGameSnapshot(option)'), 'submit payload must preserve game context');

console.log('sportsbook reliability guard test passed');
