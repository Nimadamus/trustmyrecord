(function() {
    'use strict';

    const STATUS_MAP = {
        win: 'won',
        won: 'won',
        loss: 'lost',
        lost: 'lost',
        push: 'push',
        pushed: 'push',
        pending: 'pending',
        void: 'void'
    };

    const SPORT_LABELS = {
        basketball_nba: 'NBA',
        americanfootball_nfl: 'NFL',
        icehockey_nhl: 'NHL',
        baseball_mlb: 'MLB',
        soccer_epl: 'Soccer',
        americanfootball_ncaaf: 'NCAAF',
        basketball_ncaab: 'NCAAB',
        NBA: 'NBA',
        NFL: 'NFL',
        NHL: 'NHL',
        MLB: 'MLB',
        Soccer: 'Soccer',
        NCAAF: 'NCAAF',
        NCAAB: 'NCAAB'
    };

    const MARKET_LABELS = {
        h2h: 'Moneyline',
        spreads: 'Spread',
        totals: 'Total',
        team_totals: 'Team Total',
        f5_h2h: 'First 5 ML',
        f5_spreads: 'First 5 Spread',
        f5_totals: 'First 5 Total',
        first_half_h2h: 'First Half ML',
        first_half_spreads: 'First Half Spread',
        first_half_totals: 'First Half Total',
        second_half_h2h: 'Second Half ML',
        second_half_spreads: 'Second Half Spread',
        second_half_totals: 'Second Half Total'
    };

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizeStatus(status, result) {
        return STATUS_MAP[String(status || result || 'pending').toLowerCase()] || 'pending';
    }

    function includesTeam(pick, team) {
        const haystack = [
            pick.away_team,
            pick.home_team,
            pick.matchup,
            pick.game,
            pick.event_name
        ].join(' ').toLowerCase();
        return haystack.indexOf(team.toLowerCase()) !== -1;
    }

    function calculateWinUnits(pick) {
        const units = Number(pick.units || pick.stake || 1);
        const odds = Number(pick.odds_snapshot || pick.odds || pick.price || -110);
        if (!Number.isFinite(units)) return 1;
        if (!Number.isFinite(odds)) return units;
        return odds < 0 ? (units * 100 / Math.abs(odds)) : (units * odds / 100);
    }

    function normalizePick(pick) {
        const normalized = Object.assign({}, pick || {});
        normalized.status = normalizeStatus(normalized.status, normalized.result);
        normalized.units = Number(normalized.units || normalized.stake || 1);
        normalized.odds_snapshot = normalized.odds_snapshot != null ? normalized.odds_snapshot : normalized.odds;
        normalized.line_snapshot = normalized.line_snapshot != null ? normalized.line_snapshot : normalized.line;
        return normalized;
    }

    function currentUserIds() {
        const ids = [];
        try {
            const user = window.auth && typeof window.auth.getCurrentUser === 'function'
                ? window.auth.getCurrentUser()
                : null;
            if (user) {
                if (user.id != null) ids.push(String(user.id));
                if (user.username) ids.push(String(user.username));
                if (user.email) ids.push(String(user.email));
            }
        } catch (error) {}
        try {
            const stored = JSON.parse(localStorage.getItem('tmr_current_user') || localStorage.getItem('trustmyrecord_session') || 'null');
            const user = stored && stored.user ? stored.user : stored;
            if (user) {
                if (user.id != null) ids.push(String(user.id));
                if (user.username) ids.push(String(user.username));
                if (user.email) ids.push(String(user.email));
            }
        } catch (error) {}
        ids.push('local');
        return Array.from(new Set(ids));
    }

    function readLocalPicks() {
        // DISABLED Apr 30, 2026 — local picks must never appear on TrustMyRecord
        // surfaces. Eagerly clear the legacy keys so stale demo/seed data
        // (e.g. Apr 11 Giants -3.45u, Buffalo Sabres push) cannot resurface
        // from a previously-cached browser.
        try {
            ['tmr_picks', 'trustmyrecord_picks', 'tmr_picks_legacy'].forEach(function(key) {
                localStorage.removeItem(key);
            });
        } catch (error) {}
        return [];
    }

    function getCanonicalPicks() {
        const backend = Array.isArray(window._cachedBackendPicks) ? window._cachedBackendPicks : [];
        readLocalPicks();
        return backend.map(normalizePick).sort(function(a, b) {
            return new Date(b.locked_at || b.created_at || b.commence_time || 0) -
                new Date(a.locked_at || a.created_at || a.commence_time || 0);
        });
    }

    function computeStats(picks) {
        if (typeof window.computeCanonicalRecordStats === 'function') {
            return window.computeCanonicalRecordStats(picks);
        }
        const wins = picks.filter(function(p) { return p.status === 'won'; }).length;
        const losses = picks.filter(function(p) { return p.status === 'lost'; }).length;
        const pushes = picks.filter(function(p) { return p.status === 'push'; }).length;
        const pending = picks.filter(function(p) { return p.status === 'pending'; }).length;
        const graded = wins + losses + pushes;
        const totalUnits = picks.reduce(function(sum, pick) {
            if (pick.status === 'pending') return sum;
            return sum + (Number(pick.result_units) || 0);
        }, 0);
        const risked = picks.reduce(function(sum, pick) {
            if (pick.status === 'pending') return sum;
            return sum + (Number(pick.units) || 0);
        }, 0);
        return {
            wins: wins,
            losses: losses,
            pushes: pushes,
            pending: pending,
            graded: graded,
            total: picks.length,
            record: wins + '-' + losses + '-' + pushes,
            winRate: wins + losses ? ((wins / (wins + losses)) * 100).toFixed(1) : '0.0',
            totalUnits: totalUnits,
            roi: risked ? ((totalUnits / risked) * 100).toFixed(1) : '0.0',
            currentStreak: 0,
            bestStreak: 0,
            avgOdds: null,
            avgUnits: 0
        };
    }

    function text(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function formatUnits(value) {
        const units = Number(value) || 0;
        return (units >= 0 ? '+' : '') + units.toFixed(2) + 'u';
    }

    function formatStreak(value) {
        const streak = Number(value) || 0;
        if (streak > 0) return streak + 'W';
        if (streak < 0) return Math.abs(streak) + 'L';
        return '0';
    }

    function groupStats(picks, resolver) {
        const groups = {};
        picks.forEach(function(pick) {
            const key = resolver(pick) || 'Other';
            if (!groups[key]) groups[key] = { wins: 0, losses: 0, pushes: 0, pending: 0, units: 0 };
            if (pick.status === 'won') groups[key].wins += 1;
            else if (pick.status === 'lost') groups[key].losses += 1;
            else if (pick.status === 'push') groups[key].pushes += 1;
            else groups[key].pending += 1;
            if (pick.status !== 'pending') groups[key].units += Number(pick.result_units) || 0;
        });
        return Object.keys(groups).sort().map(function(key) {
            return Object.assign({ key: key }, groups[key]);
        });
    }

    function renderBreakdown(id, rows) {
        const el = document.getElementById(id);
        if (!el) return;
        if (!rows.length) {
            el.innerHTML = '<div class="breakdown-empty">No graded data yet.</div>';
            return;
        }
        el.innerHTML = rows.map(function(row) {
            const decisions = row.wins + row.losses;
            const winRate = decisions ? Math.round((row.wins / decisions) * 100) + '%' : '0%';
            return '<div class="breakdown-row">' +
                '<span>' + escapeHtml(row.key) + '</span>' +
                '<strong>' + row.wins + '-' + row.losses + '-' + row.pushes + '</strong>' +
                '<em>' + winRate + ' / ' + formatUnits(row.units) + '</em>' +
                '</div>';
        }).join('');
    }

    function updateRecentPicksDisplay() {
        const container = document.getElementById('dashboardRecentPicks');
        if (!container) return;
        const picks = getCanonicalPicks();
        if (!picks.length) {
            container.innerHTML = '<p class="no-picks-message">No picks yet. Make your first pick to start building your record.</p>';
            return;
        }
        container.innerHTML = picks.slice(0, 8).map(function(pick) {
            const status = normalizeStatus(pick.status, pick.result);
            const matchup = (pick.away_team || '') + ' vs ' + (pick.home_team || '');
            const odds = pick.odds_snapshot != null ? Number(pick.odds_snapshot) : '';
            const pickDisplay = (pick.selection || 'Pick') + (pick.line_snapshot ? ' ' + pick.line_snapshot : '');
            const result = status !== 'pending' ? formatUnits(pick.result_units) : (Number(pick.units || 1).toFixed(1) + 'u risked');
            return '<div class="recent-pick-item">' +
                '<div class="pick-info">' +
                '<div class="pick-game">' + escapeHtml(matchup) + '</div>' +
                '<div class="pick-details-text">' + escapeHtml(pickDisplay) + ' ' + (odds !== '' ? '(' + (odds > 0 ? '+' : '') + odds + ')' : '') + ' - ' + result + '</div>' +
                (pick.tmr_corrected_result ? '<div class="pick-correction-note">Corrected from legacy push grading.</div>' : '') +
                '</div>' +
                '<span class="pick-status ' + status + '">' + escapeHtml(status.toUpperCase()) + '</span>' +
                '</div>';
        }).join('');
    }

    function updateStatsDashboard() {
        const dashboard = document.getElementById('userStatsDashboard');
        const picks = getCanonicalPicks();
        const stats = computeStats(picks);
        if (dashboard) dashboard.style.display = 'block';

        text('totalPicks', stats.total);
        text('winRate', stats.winRate + '%');
        text('totalUnits', formatUnits(stats.totalUnits));
        text('currentStreak', formatStreak(stats.currentStreak));
        text('picksBreakdown', stats.wins + 'W - ' + stats.losses + 'L - ' + stats.pushes + 'P' + (stats.pending ? ' | ' + stats.pending + ' Pending' : ''));
        text('roiDisplay', stats.roi + '% ROI');
        text('bestStreak', 'Best: ' + (stats.bestStreak || 0) + 'W');
        text('dashboardWins', stats.wins);
        text('dashboardLosses', stats.losses);
        text('dashboardPushes', stats.pushes);
        text('dashboardPending', stats.pending);
        text('dashboardGraded', stats.graded);
        text('dashboardAvgOdds', stats.avgOdds == null ? '--' : (stats.avgOdds > 0 ? '+' : '') + stats.avgOdds);
        text('dashboardAvgUnits', (Number(stats.avgUnits) || 0).toFixed(2) + 'u');
        text('dashboardBestStreak', (stats.bestStreak || 0) + 'W');

        const totalUnitsEl = document.getElementById('totalUnits');
        if (totalUnitsEl) totalUnitsEl.className = Number(stats.totalUnits) >= 0 ? 'stat-value positive' : 'stat-value negative';

        renderBreakdown('dashboardSportBreakdown', groupStats(picks, function(pick) {
            return SPORT_LABELS[pick.sport_key] || SPORT_LABELS[pick.sport] || pick.sport_display || pick.sport;
        }));
        renderBreakdown('dashboardMarketBreakdown', groupStats(picks, function(pick) {
            return MARKET_LABELS[pick.market_type] || MARKET_LABELS[pick.bet_type] || pick.market_type || pick.bet_type || 'Other';
        }));
        updateRecentPicksDisplay();
        renderConsensus();
    }

    function calculateUserStats() {
        const picks = getCanonicalPicks();
        const stats = computeStats(picks);
        return {
            totalPicks: stats.total,
            winRate: stats.winRate,
            totalUnits: Number(stats.totalUnits).toFixed(2),
            currentStreak: formatStreak(stats.currentStreak),
            triviaPoints: 0,
            pollVoteCount: 0
        };
    }

    function setActiveSportsbookTab(button) {
        document.querySelectorAll('.sportsbook-sports-nav button').forEach(function(tab) {
            tab.classList.toggle('active', tab === button);
        });
    }

    function showSportsbookSport(sport, button) {
        if (button) setActiveSportsbookTab(button);
        if (typeof window.showSection === 'function') window.showSection('picks');
        window.setTimeout(function() {
            if (typeof window.selectSportAndShowGames === 'function') {
                window.selectSportAndShowGames(sport);
            }
        }, 50);
    }

    function wireSportsbookTabs() {
        document.querySelectorAll('.sportsbook-sports-nav button, .workflow-card[data-sportsbook-tab]').forEach(function(button) {
            if (button.dataset.tmrTabBound === 'true') return;
            button.dataset.tmrTabBound = 'true';
            button.addEventListener('click', function() {
                const tab = button.dataset.sportsbookTab;
                if (tab === 'sport') {
                    showSportsbookSport(button.dataset.sport, button);
                } else if (tab === 'promos') {
                    setActiveSportsbookTab(button);
                    if (typeof window.showSection === 'function') window.showSection('promos');
                    renderPromoNotes();
                } else if (tab === 'consensus') {
                    setActiveSportsbookTab(button);
                    if (typeof window.showSection === 'function') window.showSection('consensus');
                    renderConsensus();
                }
            });
        });
    }

    function renderPromoNotes() {
        const list = document.getElementById('promoNotesList');
        if (!list) return;
        let notes = [];
        try { notes = JSON.parse(localStorage.getItem('tmr_promo_notes') || '[]'); } catch (error) {}
        if (!notes.length) {
            list.innerHTML = '<div class="tool-empty">No promo notes saved yet.</div>';
            return;
        }
        list.innerHTML = notes.map(function(note) {
            return '<div class="promo-note">' +
                '<strong>' + escapeHtml(note.book) + '</strong>' +
                '<span>' + escapeHtml(note.offer) + '</span>' +
                '<small>' + escapeHtml(note.notes) + '</small>' +
                '</div>';
        }).join('');
    }

    function addPromoNote() {
        const book = document.getElementById('promoBook');
        const offer = document.getElementById('promoOffer');
        const notes = document.getElementById('promoNotes');
        const entry = {
            book: book && book.value.trim() ? book.value.trim() : 'Sportsbook',
            offer: offer && offer.value.trim() ? offer.value.trim() : 'Offer',
            notes: notes && notes.value.trim() ? notes.value.trim() : 'No notes entered.',
            savedAt: new Date().toISOString()
        };
        let existing = [];
        try { existing = JSON.parse(localStorage.getItem('tmr_promo_notes') || '[]'); } catch (error) {}
        existing.unshift(entry);
        localStorage.setItem('tmr_promo_notes', JSON.stringify(existing.slice(0, 20)));
        if (book) book.value = '';
        if (offer) offer.value = '';
        if (notes) notes.value = '';
        renderPromoNotes();
    }

    function renderConsensus() {
        const panel = document.getElementById('consensusPicksPanel');
        if (!panel) return;
        const picks = getCanonicalPicks().filter(function(pick) {
            return pick.status !== 'pending';
        });
        const clusters = {};
        picks.forEach(function(pick) {
            const matchup = (pick.away_team || '') + ' vs ' + (pick.home_team || '');
            const selection = pick.selection || 'Pick';
            const key = matchup + '|' + selection;
            if (!clusters[key]) {
                clusters[key] = {
                    matchup: matchup,
                    selection: selection,
                    count: 0,
                    wins: 0,
                    losses: 0,
                    pushes: 0,
                    units: 0
                };
            }
            clusters[key].count += 1;
            if (pick.status === 'won') clusters[key].wins += 1;
            if (pick.status === 'lost') clusters[key].losses += 1;
            if (pick.status === 'push') clusters[key].pushes += 1;
            clusters[key].units += Number(pick.result_units) || 0;
        });
        const rows = Object.keys(clusters).map(function(key) { return clusters[key]; })
            .sort(function(a, b) { return b.count - a.count || b.units - a.units; })
            .slice(0, 10);
        if (!rows.length) {
            panel.innerHTML = '<div class="tool-empty">No graded pick data is loaded yet, so there is no consensus to show.</div>';
            return;
        }
        panel.innerHTML = rows.map(function(row) {
            const decisions = row.wins + row.losses;
            const winRate = decisions ? Math.round((row.wins / decisions) * 100) + '%' : '0%';
            return '<div class="consensus-row">' +
                '<div><strong>' + escapeHtml(row.selection) + '</strong><span>' + escapeHtml(row.matchup) + '</span></div>' +
                '<div><b>' + row.count + '</b><small>Picks</small></div>' +
                '<div><b>' + row.wins + '-' + row.losses + '-' + row.pushes + '</b><small>Record</small></div>' +
                '<div><b>' + winRate + '</b><small>Win Rate</small></div>' +
                '<div><b>' + formatUnits(row.units) + '</b><small>Units</small></div>' +
                '</div>';
        }).join('');
    }

    function refreshFromBackend() {
        if (typeof window.ensureBackendPicks === 'function') {
            window.ensureBackendPicks(function() {
                updateStatsDashboard();
            });
        } else {
            updateStatsDashboard();
        }
    }

    window.tmrAddPromoNote = addPromoNote;
    window.tmrRenderPromoNotes = renderPromoNotes;
    window.tmrRenderConsensus = renderConsensus;
    window.tmrGetCanonicalSportsbookPicks = getCanonicalPicks;
    window.updateStatsDashboard = updateStatsDashboard;
    window.updateRecentPicksDisplay = updateRecentPicksDisplay;
    window.calculateUserStats = calculateUserStats;

    document.addEventListener('DOMContentLoaded', function() {
        wireSportsbookTabs();
        renderPromoNotes();
        refreshFromBackend();
        window.setTimeout(refreshFromBackend, 800);
        window.setTimeout(refreshFromBackend, 2200);
    });
})();
