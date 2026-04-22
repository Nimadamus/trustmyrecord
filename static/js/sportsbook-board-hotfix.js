(function() {
    'use strict';

    function injectStyles() {
        if (document.getElementById('tmr-board-hotfix-style')) return;
        var style = document.createElement('style');
        style.id = 'tmr-board-hotfix-style';
        style.textContent = [
            '.tmr-market-status{padding:6px 10px;border-radius:999px;background:color-mix(in srgb, var(--tmr-accent, #2f8f53) 18%, rgba(255,255,255,0.02));border:1px solid color-mix(in srgb, var(--tmr-accent, #2f8f53) 40%, rgba(255,255,255,0.08));font-size:10px;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;color:#f8fafc;}',
            '.tmr-team-side{display:inline-flex;align-items:center;justify-content:center;min-width:52px;padding:5px 8px;border-radius:999px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);font-size:10px;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;color:#aeb8c6;}',
            '.tmr-matchup-divider{display:flex;align-items:center;gap:10px;padding-left:62px;color:#6f7a89;font-size:10px;font-weight:900;letter-spacing:0.18em;text-transform:uppercase;}',
            '.tmr-matchup-divider::before,.tmr-matchup-divider::after{content:"";height:1px;flex:1;background:rgba(255,255,255,0.08);}',
            '.tmr-market-chip.accent{background:color-mix(in srgb, var(--tmr-accent, #2f8f53) 18%, transparent);color:#eefcf3;border-color:color-mix(in srgb, var(--tmr-accent, #2f8f53) 42%, rgba(255,255,255,0.06));}',
            '.tmr-option-topline{display:flex;align-items:center;justify-content:space-between;gap:8px;}',
            '.tmr-option-tag{display:inline-flex;align-items:center;justify-content:center;padding:4px 7px;border-radius:999px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:#c8d0dc;}',
            '.tmr-option-line{font-size:12px;font-weight:900;letter-spacing:0.08em;text-transform:uppercase;color:var(--tmr-accent-soft, #f2c94c);}',
            '@media (max-width: 700px){.tmr-team-side{min-width:46px;padding:4px 7px;}.tmr-matchup-divider{padding-left:56px;}}'
        ].join('');
        document.head.appendChild(style);
    }

    function parseStartTime(label) {
        var text = String(label || '').trim();
        if (!text) return null;
        var now = new Date();
        var direct = new Date(text);
        if (!Number.isNaN(direct.getTime())) return direct;
        var withYear = new Date(text + ', ' + now.getFullYear());
        if (!Number.isNaN(withYear.getTime())) return withYear;
        return null;
    }

    function formatStartsIn(label) {
        var date = parseStartTime(label);
        if (!date) return 'Pregame';
        var diff = date.getTime() - Date.now();
        if (diff <= 0) return 'Started';
        var totalMinutes = Math.round(diff / 60000);
        var days = Math.floor(totalMinutes / 1440);
        var hours = Math.floor((totalMinutes % 1440) / 60);
        var minutes = totalMinutes % 60;
        if (days > 0) return 'Starts in ' + days + 'd ' + (hours || 0) + 'h';
        if (hours > 0) return 'Starts in ' + hours + 'h ' + minutes + 'm';
        return 'Starts in ' + minutes + 'm';
    }

    function extractOptionLine(label) {
        var text = String(label || '').trim();
        if (!text) return '';
        var match = text.match(/([+-]\d+(\.\d+)?|\d+(\.\d+)?)$/);
        if (!match) return '';
        return match[1];
    }

    function detectOptionTag(text, card) {
        var label = String(text || '').toLowerCase();
        var rows = card ? card.querySelectorAll('.tmr-team-row .tmr-team-name') : [];
        var away = rows[0] ? rows[0].textContent.trim().toLowerCase() : '';
        var home = rows[1] ? rows[1].textContent.trim().toLowerCase() : '';
        if (away && label.indexOf(away) !== -1) return 'Away';
        if (home && label.indexOf(home) !== -1) return 'Home';
        if (label.indexOf('over') !== -1) return 'Over';
        if (label.indexOf('under') !== -1) return 'Under';
        if (label.indexOf('manual') !== -1) return 'Manual';
        return 'Market';
    }

    function patchCard(card) {
        if (!card || card.dataset.tmrBoardHotfixed === 'true') return;

        var topLine = card.querySelector('.tmr-market-topline');
        var firstChip = card.querySelector('.tmr-market-meta .tmr-market-chip');
        if (topLine && !topLine.querySelector('.tmr-market-status')) {
            var status = document.createElement('span');
            status.className = 'tmr-market-status';
            status.textContent = formatStartsIn(firstChip ? firstChip.textContent : '');
            topLine.appendChild(status);
        }

        if (firstChip) firstChip.classList.add('accent');

        var rows = card.querySelectorAll('.tmr-market-matchup .tmr-team-row');
        if (rows[0] && !rows[0].querySelector('.tmr-team-side')) {
            var away = document.createElement('span');
            away.className = 'tmr-team-side';
            away.textContent = 'Away';
            rows[0].insertBefore(away, rows[0].firstChild);
        }
        if (rows[1] && !rows[1].querySelector('.tmr-team-side')) {
            var home = document.createElement('span');
            home.className = 'tmr-team-side';
            home.textContent = 'Home';
            rows[1].insertBefore(home, rows[1].firstChild);
        }
        if (rows.length > 1 && !card.querySelector('.tmr-matchup-divider')) {
            var divider = document.createElement('div');
            divider.className = 'tmr-matchup-divider';
            divider.textContent = 'Matchup';
            rows[1].parentNode.insertBefore(divider, rows[1]);
        }

        card.querySelectorAll('.tmr-option-btn').forEach(function(button) {
            var main = button.querySelector('.tmr-option-main');
            var market = button.querySelector('.tmr-option-market');
            if (!main || !market || main.querySelector('.tmr-option-topline')) return;
            var top = document.createElement('div');
            top.className = 'tmr-option-topline';
            var tag = document.createElement('span');
            tag.className = 'tmr-option-tag';
            tag.textContent = detectOptionTag(market.textContent, card);
            top.appendChild(tag);
            var line = extractOptionLine(market.textContent);
            if (line) {
                var lineEl = document.createElement('span');
                lineEl.className = 'tmr-option-line';
                lineEl.textContent = line;
                top.appendChild(lineEl);
            }
            main.insertBefore(top, main.firstChild);
        });

        card.dataset.tmrBoardHotfixed = 'true';
    }

    function patchBoard() {
        injectStyles();
        document.querySelectorAll('.tmr-market-card').forEach(patchCard);
    }

    function boot() {
        patchBoard();
        var container = document.getElementById('gamesListContainer');
        if (!container) return;
        var observer = new MutationObserver(function() {
            patchBoard();
        });
        observer.observe(container, { childList: true, subtree: true });
        window.__tmrBoardHotfixObserver = observer;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
