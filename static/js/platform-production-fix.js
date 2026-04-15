(function() {
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

    function normalizeStatus(status) {
        return STATUS_MAP[String(status || '').toLowerCase()] || String(status || '').toLowerCase();
    }

    function normalizeRecordPick(pick) {
        const normalized = { ...(pick || {}) };
        normalized.status = normalizeStatus(normalized.status);
        normalized.units = Number(normalized.units || normalized.stake || 1);
        normalized.odds_value = Number(normalized.odds_snapshot || normalized.odds || normalized.price || -110);
        normalized.result_units_value = normalized.result_units != null && !Number.isNaN(Number(normalized.result_units))
            ? Number(normalized.result_units)
            : null;
        return normalized;
    }

    function calculatePickUnits(normalizedPick) {
        if (normalizedPick.result_units_value != null) return normalizedPick.result_units_value;
        if (normalizedPick.status === 'won') {
            return normalizedPick.odds_value < 0 ? normalizedPick.units : (normalizedPick.units * normalizedPick.odds_value / 100);
        }
        if (normalizedPick.status === 'lost') {
            return normalizedPick.odds_value < 0 ? -(normalizedPick.units * Math.abs(normalizedPick.odds_value) / 100) : -normalizedPick.units;
        }
        return 0;
    }

    function computeCanonicalRecordStats(picks) {
        const normalized = Array.isArray(picks) ? picks.map(normalizeRecordPick) : [];
        const graded = normalized.filter(function(pick) {
            return pick.status === 'won' || pick.status === 'lost' || pick.status === 'push';
        });
        const wins = graded.filter(function(pick) { return pick.status === 'won'; }).length;
        const losses = graded.filter(function(pick) { return pick.status === 'lost'; }).length;
        const pushes = graded.filter(function(pick) { return pick.status === 'push'; }).length;
        const pending = normalized.filter(function(pick) { return !pick.status || pick.status === 'pending'; }).length;
        const totalUnits = graded.reduce(function(sum, pick) {
            return sum + calculatePickUnits(pick);
        }, 0);
        const risked = graded.reduce(function(sum, pick) {
            return sum + (Number.isFinite(pick.units) ? pick.units : 0);
        }, 0);
        const sorted = graded.slice().sort(function(a, b) {
            return new Date(a.locked_at || a.created_at || 0) - new Date(b.locked_at || b.created_at || 0);
        });

        let bestWin = 0;
        let worstLoss = 0;
        let tempWin = 0;
        let tempLoss = 0;
        sorted.forEach(function(pick) {
            if (pick.status === 'won') {
                tempWin += 1;
                tempLoss = 0;
                bestWin = Math.max(bestWin, tempWin);
            } else if (pick.status === 'lost') {
                tempLoss += 1;
                tempWin = 0;
                worstLoss = Math.max(worstLoss, tempLoss);
            } else {
                tempWin = 0;
                tempLoss = 0;
            }
        });

        const recent = sorted.slice().reverse();
        let currentStreak = 0;
        let currentType = '';
        for (const pick of recent) {
            if (pick.status === 'push') continue;
            if (!currentType) {
                currentType = pick.status;
                currentStreak = 1;
            } else if (pick.status === currentType) {
                currentStreak += 1;
            } else {
                break;
            }
        }

        const oddsSamples = normalized
            .map(function(pick) { return Number(pick.odds_snapshot || pick.odds || pick.price); })
            .filter(Number.isFinite);
        const unitSamples = normalized
            .map(function(pick) { return Number(pick.units || pick.stake); })
            .filter(Number.isFinite);

        return {
            wins: wins,
            losses: losses,
            pushes: pushes,
            pending: pending,
            graded: graded.length,
            total: normalized.length,
            record: wins + '-' + losses + '-' + pushes,
            winRate: (wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '0.0',
            totalUnits: totalUnits,
            roi: risked > 0 ? ((totalUnits / risked) * 100).toFixed(1) : '0.0',
            currentStreak: currentType === 'won' ? currentStreak : currentType === 'lost' ? -currentStreak : 0,
            bestStreak: bestWin,
            worstStreak: worstLoss,
            avgOdds: oddsSamples.length ? Math.round(oddsSamples.reduce(function(a, b) { return a + b; }, 0) / oddsSamples.length) : null,
            avgUnits: unitSamples.length ? (unitSamples.reduce(function(a, b) { return a + b; }, 0) / unitSamples.length) : 0
        };
    }

    function formatMarketLabel(marketType) {
        return {
            h2h: 'Moneyline',
            spreads: 'Spread',
            totals: 'Game Total',
            team_totals: 'Team Total',
            f5_h2h: 'First 5 ML',
            f5_spreads: 'First 5 Spread',
            f5_totals: 'First 5 Total',
            first_half_h2h: 'First Half ML',
            first_half_spreads: 'First Half Spread',
            first_half_totals: 'First Half Total',
            second_half_h2h: 'Second Half ML',
            second_half_spreads: 'Second Half Spread',
            second_half_totals: 'Second Half Total',
            period_1_h2h: '1st Period ML',
            period_1_totals: '1st Period Total',
            alt_spreads: 'Alt Spread',
            alt_totals: 'Alt Total'
        }[marketType] || String(marketType || 'pick').replace(/_/g, ' ');
    }

    async function waitForApi() {
        if (typeof api === 'undefined' || !api || !api.ready) return false;
        try {
            await api.ready;
        } catch (err) {
            return false;
        }
        if (!api.backendAvailable && typeof api.detectBackend === 'function') {
            try {
                await api.detectBackend();
            } catch (err) {}
        }
        return !!(api.baseUrl || typeof api.request === 'function' || typeof api.getCurrentUser === 'function');
    }

    function getCurrentUsername() {
        if (window.auth?.currentUser?.username) return window.auth.currentUser.username;
        if (window.auth?.getCurrentUser) {
            try {
                const current = window.auth.getCurrentUser();
                if (current?.username) return current.username;
            } catch (err) {}
        }
        return null;
    }

    async function getBackendCurrentUser() {
        if (!(await waitForApi())) return null;
        try {
            const result = await api.getCurrentUser();
            return result?.user || result || null;
        } catch (err) {
            return null;
        }
    }

    async function loadCanonicalLeaderboard() {
        if (!(await waitForApi())) return false;
        if (typeof window.refreshLeaderboards !== 'function') return false;
        try {
            await window.refreshLeaderboards();
            return true;
        } catch (err) {
            console.warn('[Platform Fix] Failed to refresh leaderboard from backend:', err);
            return false;
        }
    }

    async function loadCanonicalProfilePicks() {
        const pendingContainer = document.getElementById('profilePendingPicks');
        const activityContainer = document.getElementById('profileRecentActivity');
        if (!pendingContainer && !activityContainer) return false;
        if (!(await waitForApi())) return false;

        const user = await getBackendCurrentUser();
        if (!user?.id) return false;

        try {
            const result = await api.getPicks({ userId: user.id, limit: 100, offset: 0 });
            const picks = Array.isArray(result?.picks) ? result.picks : [];
            const normalized = picks.map(function(pick) {
                return { ...pick, _status: normalizeStatus(pick.status) };
            });

            if (pendingContainer) renderPendingPicks(pendingContainer, normalized);
            if (activityContainer) renderRecentActivity(activityContainer, normalized);
            return true;
        } catch (err) {
            console.warn('[Platform Fix] Failed to load backend profile picks:', err);
            return false;
        }
    }

    function renderPendingPicks(container, picks) {
        const pending = picks
            .filter(function(pick) { return pick._status === 'pending'; })
            .slice(0, 5);

        if (!pending.length) {
            container.innerHTML = '<p class="no-data-message">No pending picks.</p>';
            return;
        }

        container.innerHTML = pending.map(function(pick) {
            const matchup = buildMatchup(pick);
            const pickDisplay = buildPickDisplay(pick);
            const odds = Number(pick.odds_snapshot || pick.odds || -110);
            return '<div class="pending-pick-item">' +
                '<div class="pick-game">' + escapeHtml(matchup) + '</div>' +
                '<div class="pick-info">' + escapeHtml(pickDisplay) + ' (' + formatOdds(odds) + ') - ' + Number(pick.units || 1) + 'u</div>' +
                '</div>';
        }).join('');
    }

    function renderRecentActivity(container, picks) {
        const graded = picks
            .filter(function(pick) { return pick._status && pick._status !== 'pending'; })
            .slice(0, 5);

        if (!graded.length) {
            container.innerHTML = '<p class="no-data-message">No recent activity.</p>';
            return;
        }

        container.innerHTML = graded.map(function(pick) {
            const icon = pick._status === 'won' ? '✅' : pick._status === 'lost' ? '❌' : '➖';
            const date = pick.locked_at || pick.created_at ? new Date(pick.locked_at || pick.created_at).toLocaleDateString() : '';
            const matchup = buildMatchup(pick);
            const odds = Number(pick.odds_snapshot || pick.odds || -110);
            const pickDisplay = buildPickDisplay(pick);
            const marketLabel = formatMarketLabel(pick.market_type);
            return '<div class="activity-item ' + escapeHtml(pick._status) + '">' +
                '<span class="activity-icon">' + icon + '</span>' +
                '<div class="activity-details">' +
                '<div class="activity-text">' + escapeHtml(pick._status.toUpperCase() + ': ' + matchup) + '</div>' +
                '<div class="activity-meta">' + escapeHtml(marketLabel + ' • ' + pickDisplay) + '</div>' +
                '<div class="activity-meta">' + escapeHtml(date) + ' • ' + Number(pick.units || 1) + 'u @ ' + formatOdds(odds) + '</div>' +
                '</div>' +
                '</div>';
        }).join('');
    }

    function buildMatchup(pick) {
        if (pick.away_team && pick.home_team) return pick.away_team + ' vs ' + pick.home_team;
        if (pick.game_label) return pick.game_label;
        return pick.game || 'Matchup unavailable';
    }

    function buildPickDisplay(pick) {
        const selection = pick.selection || pick.side || pick.team || 'Selection';
        const line = pick.line_snapshot ?? pick.line;
        return line == null || line === '' ? selection : selection + ' ' + line;
    }

    function formatOdds(odds) {
        if (!Number.isFinite(odds)) return '-110';
        return odds > 0 ? '+' + odds : String(odds);
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function injectVisualUpgradeStyles() {
        if (document.getElementById('tmr-visual-upgrade-style')) return;

        const style = document.createElement('style');
        style.id = 'tmr-visual-upgrade-style';
        style.textContent = [
            '.hero{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,0.08)!important;background:radial-gradient(circle at top left, rgba(26,214,253,0.22), transparent 34%),radial-gradient(circle at 80% 10%, rgba(34,197,94,0.16), transparent 28%),linear-gradient(145deg, rgba(10,14,22,0.96), rgba(15,23,42,0.9))!important;box-shadow:0 30px 80px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05);}',
            '.hero::before{content:"";position:absolute;inset:auto -10% -35% auto;width:340px;height:340px;border-radius:999px;background:radial-gradient(circle, rgba(0,255,255,0.18), rgba(0,255,255,0));pointer-events:none;}',
            '.hero::after{content:"";position:absolute;inset:24px 24px auto auto;width:140px;height:140px;border-radius:24px;border:1px solid rgba(255,255,255,0.08);background:linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.01));backdrop-filter:blur(8px);transform:rotate(12deg);pointer-events:none;opacity:.65;}',
            '.hero h1{max-width:12ch;letter-spacing:-0.04em;line-height:0.94;text-shadow:0 10px 30px rgba(0,0,0,0.35);}',
            '.hero p{max-width:640px;font-size:1.05rem;line-height:1.7;color:rgba(226,232,240,0.9)!important;}',
            '.hero-cta-primary{box-shadow:0 18px 40px rgba(0,255,255,0.22);}',
            '.hero-journey{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(16px);padding:18px 22px;border-radius:24px;}',
            '.journey-step{min-width:120px;}',
            '.journey-icon{box-shadow:0 10px 25px rgba(0,0,0,0.22);}',
            '.tmr-signal-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:22px;position:relative;z-index:1;}',
            '.tmr-signal-card{padding:16px 18px;border-radius:18px;border:1px solid rgba(255,255,255,0.08);background:linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03));backdrop-filter:blur(12px);}',
            '.tmr-signal-kicker{font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#7dd3fc;font-weight:700;margin-bottom:8px;}',
            '.tmr-signal-value{font-size:1rem;font-weight:800;color:#f8fafc;margin-bottom:4px;}',
            '.tmr-signal-copy{font-size:0.88rem;line-height:1.5;color:#a5b4c7;}',
            '.social-proof-section,.dashboard-command-center,.feed-container-social{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,0.07)!important;background:linear-gradient(180deg, rgba(13,17,25,0.95), rgba(15,23,42,0.9))!important;box-shadow:0 24px 70px rgba(0,0,0,0.24);}',
            '.social-proof-section::before,.dashboard-command-center::before,.feed-container-social::before{content:"";position:absolute;inset:0 0 auto 0;height:1px;background:linear-gradient(90deg, transparent, rgba(0,255,255,0.5), transparent);}',
            '.sport-card{background:linear-gradient(180deg, rgba(17,24,39,0.94), rgba(10,14,22,0.92))!important;border:1px solid rgba(255,255,255,0.08)!important;box-shadow:0 16px 40px rgba(0,0,0,0.24);}',
            '.sport-card:hover,.sport-card.selected{transform:translateY(-3px);box-shadow:0 20px 48px rgba(0,0,0,0.28), 0 0 0 1px rgba(0,255,255,0.2) inset;}',
            '.tmr-market-card{background:linear-gradient(180deg, rgba(14,19,29,0.98), rgba(9,13,20,0.98));box-shadow:0 20px 50px rgba(0,0,0,0.24);}',
            '.tmr-market-head{position:relative;}',
            '.tmr-market-head::after{content:"";position:absolute;left:20px;right:20px;bottom:0;height:1px;background:linear-gradient(90deg, rgba(255,255,255,0.08), transparent);}',
            '@media (max-width: 900px){.tmr-signal-strip{grid-template-columns:1fr;}.hero::after{display:none;}}'
        ].join('');
        document.head.appendChild(style);
    }

    function injectHeroSignalStrip() {
        const hero = document.querySelector('.hero');
        const journey = document.querySelector('.hero-journey');
        if (!hero || !journey || document.getElementById('tmrHeroSignalStrip')) return;

        const strip = document.createElement('div');
        strip.id = 'tmrHeroSignalStrip';
        strip.className = 'tmr-signal-strip reveal';
        strip.innerHTML = [
            '<div class="tmr-signal-card"><div class="tmr-signal-kicker">Verified</div><div class="tmr-signal-value">Every pick leaves a receipt</div><div class="tmr-signal-copy">No deleting losses. No fake records. Just timestamped results.</div></div>',
            '<div class="tmr-signal-card"><div class="tmr-signal-kicker">Sportsbook</div><div class="tmr-signal-value">Real-market workflow</div><div class="tmr-signal-copy">Track plays from live sportsbook lines instead of made-up consensus numbers.</div></div>',
            '<div class="tmr-signal-card"><div class="tmr-signal-kicker">Community</div><div class="tmr-signal-value">A feed built around proof</div><div class="tmr-signal-copy">See records, recent form, and pick history before you tail anyone.</div></div>'
        ].join('');
        journey.insertAdjacentElement('afterend', strip);
    }

    async function runPlatformFixes() {
        injectVisualUpgradeStyles();
        injectHeroSignalStrip();
        await loadCanonicalLeaderboard();
        await loadCanonicalProfilePicks();
    }

    window.TMR_PLATFORM_FIX = {
        loadCanonicalLeaderboard,
        loadCanonicalProfilePicks,
        runPlatformFixes,
        computeCanonicalRecordStats
    };

    window.computeCanonicalRecordStats = computeCanonicalRecordStats;
    window.loadDynamicLeaderboards = loadCanonicalLeaderboard;
    window.loadUserPendingPicks = async function() {
        const loaded = await loadCanonicalProfilePicks();
        return loaded;
    };
    window.loadUserRecentActivity = async function() {
        const loaded = await loadCanonicalProfilePicks();
        return loaded;
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runPlatformFixes);
    } else {
        runPlatformFixes();
    }
})();
