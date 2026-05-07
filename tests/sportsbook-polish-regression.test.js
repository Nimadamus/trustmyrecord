const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const sportsbookHtml = fs.readFileSync(path.join(ROOT, 'sportsbook', 'index.html'), 'utf8');
const polishCss = fs.readFileSync(path.join(ROOT, 'static', 'css', 'sportsbook-dk-polish.css'), 'utf8');
const reliabilityJs = fs.readFileSync(path.join(ROOT, 'static', 'js', 'sportsbook-production-fix-persist-reliability.js'), 'utf8');

function test(name, fn) {
    try {
        fn();
        console.log(`ok - ${name}`);
    } catch (error) {
        console.error(`not ok - ${name}`);
        console.error(error && error.stack ? error.stack : error);
        process.exitCode = 1;
    }
}

function includesAll(haystack, needles) {
    needles.forEach((needle) => assert.ok(haystack.includes(needle), `Missing expected source: ${needle}`));
}

test('duplicate team/book renderer variables and markup stay removed', () => {
    assert.equal(sportsbookHtml.includes('awayBookLabel'), false, 'awayBookLabel must not return');
    assert.equal(sportsbookHtml.includes('homeBookLabel'), false, 'homeBookLabel must not return');
    assert.equal(sportsbookHtml.includes('<div class="sb-board-col" data-col="team">'), false, 'duplicate TT team column must not return');
    assert.equal(sportsbookHtml.includes('<small>\' + _ttHtmlEsc(awayBookLabel)'), false, 'away book label must not render in board rows');
    assert.equal(sportsbookHtml.includes('<small>\' + _ttHtmlEsc(homeBookLabel)'), false, 'home book label must not render in board rows');
});

test('DraftKings remains in pick slip/source data, not repeated in odds-board cells', () => {
    assert.ok(sportsbookHtml.includes('Real DraftKings line'), 'pick slip should still identify DraftKings source lines');
    assert.ok(sportsbookHtml.includes("var bookLabel = sel.book || 'DraftKings';"), 'pick slip fallback book label should remain');
    assert.equal(/sb-odds[\s\S]{0,240}DraftKings/i.test(sportsbookHtml), false, 'DraftKings must not be hard-coded inside odds buttons');
    assert.equal(/sb-tt-team-cell[\s\S]{0,260}DraftKings/i.test(sportsbookHtml), false, 'DraftKings must not render under duplicate team cells');
});

test('stake mode toggle labels stay visible', () => {
    assert.ok(/>\s*RISK\s*</i.test(sportsbookHtml), 'Risk stake-mode label missing');
    assert.ok(/>\s*TO WIN\s*</i.test(sportsbookHtml), 'To Win stake-mode label missing');
    assert.ok(sportsbookHtml.includes('modeRisk'), 'Risk button id missing');
    assert.ok(sportsbookHtml.includes('modeToWin'), 'To Win button id missing');
});

test('standard odds buttons keep the canonical pick selection flow', () => {
    includesAll(sportsbookHtml, [
        'function oddsButton(line, price, ctx)',
        'window.selectGameBet && window.selectGameBet(',
        "ctx.betType",
        "ctx.team",
        "ctx.line",
        "ctx.odds",
        "ctx.awayTeam",
        "ctx.homeTeam"
    ]);
});

test('spread, moneyline, total, and team-total selections still populate the slip', () => {
    includesAll(sportsbookHtml, [
        "betType: 'spread'",
        "betType: 'ml'",
        "betType: 'over'",
        "betType: 'under'",
        "var betType = side === 'over' ? 'teamover' : 'teamunder';",
        'window.TMR._ttDirectClick',
        "if (typeof window.TMR._ttPopulateSlip === 'function')",
        "market: 'Team Total'",
        "marketType: 'team_totals'",
        '<div class="sportsbook-ticket-preview-row"><span>Game</span>',
        '<div class="sportsbook-ticket-preview-row"><span>Market</span>',
        '<div class="sportsbook-ticket-preview-row"><span>Selection</span>',
        '<div class="sportsbook-ticket-preview-row"><span>Odds</span>',
        '<div class="sportsbook-ticket-preview-row"><span>Sportsbook</span>',
        "var lineInput = document.getElementById('pickLineInput');",
        "var oddsInput = document.getElementById('pickOddsInput');",
        "summaryGame.textContent",
        "summaryPick.textContent",
        "summaryOdds.textContent"
    ]);
});

test('selected odds state and signed odds price hierarchy are preserved', () => {
    includesAll(reliabilityJs, [
        "document.querySelectorAll('.tmr-option-btn.active')",
        "button.classList.remove('active')",
        "if (active) active.classList.add('active')",
        "class=\"tmr-option-btn\"",
        "data-option-id",
        "window.tmrSelectOption(this.dataset.optionId)"
    ]);
    includesAll(reliabilityJs, [
        'tmr-option-odds',
        'option.odds_display',
        'state.selectedOption = option'
    ]);
});

test('Team Totals render as clean desktop and mobile odds-only rows', () => {
    includesAll(polishCss, [
        '#picks .sb-tt-row',
        'repeat(2, minmax(180px, 1fr))',
        '"match match"',
        '"over under"',
        '"action action"'
    ]);
    assert.equal(sportsbookHtml.includes('data-col="team"'), false, 'Team Totals duplicate team data column must not render');
    assert.ok(sportsbookHtml.includes('data-col="tt-over"'), 'Team Total Over odds column missing');
    assert.ok(sportsbookHtml.includes('data-col="tt-under"'), 'Team Total Under odds column missing');
});

test('MLB and NHL matchup identifiers/logos remain wired', () => {
    includesAll(sportsbookHtml, [
        "MLB:    { kicker: 'MLB Board'",
        "NHL:    { kicker: 'NHL Board'",
        "window.TMR._teamLogo(game.away_logo, game.away_abbr, game.away_team)",
        "window.TMR._teamLogo(game.home_logo, game.home_abbr, game.home_team)"
    ]);
});

test('sportsbook page references the current cache-busted polish CSS', () => {
    const match = sportsbookHtml.match(/\/static\/css\/sportsbook-dk-polish\.css\?v=([^"']+)/);
    assert.ok(match, 'sportsbook-dk-polish.css link missing');
    assert.ok(
        match[1] === '20260506boardclean1' || match[1] > '20260506boardclean1',
        `unexpected sportsbook-dk-polish.css cache bust: ${match[1]}`
    );
});

test('old duplicate team-name/book-label patterns are not reintroduced', () => {
    const forbiddenPatterns = [
        /sb-tt-team-cell[\s\S]{0,220}<small>/,
        /data-col=["']team["'][\s\S]{0,220}sb-tt-team-stack/,
        /awayBookLabel|homeBookLabel/,
        /book_title[\s\S]{0,160}sb-tt-team-cell/,
        /book_key[\s\S]{0,160}sb-tt-team-cell/
    ];
    forbiddenPatterns.forEach((pattern) => {
        assert.equal(pattern.test(sportsbookHtml), false, `Forbidden duplicate board markup returned: ${pattern}`);
    });
});
