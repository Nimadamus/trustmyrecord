// COMPLETE FIX FOR MAKE YOUR PICK MODULE
// This file completely replaces the broken inline JavaScript
// Debug alert removed - module loads silently now

/**
 * Parse bookmakers array (Odds API format) into simplified odds object
 * Input: [{key, markets: [{key: 'h2h', outcomes: [{name, price, point}]}]}]
 * Output: { moneyline: {home, away}, spread: {home: {point, price}, away: {point, price}}, totals: {over: {point, price}, under: {point, price}} }
 */
function parseBookmakerOdds(bookmakers) {
    if (!Array.isArray(bookmakers) || bookmakers.length === 0) return null;
    // Pick first bookmaker (or preferred)
    const bk = bookmakers[0];
    if (!bk || !bk.markets) return null;
    const result = {};
    for (const market of bk.markets) {
        if (market.key === 'h2h' && market.outcomes?.length >= 2) {
            result.moneyline = {
                away: market.outcomes[0]?.price,
                home: market.outcomes[1]?.price
            };
        } else if (market.key === 'spreads' && market.outcomes?.length >= 2) {
            result.spread = {
                away: { point: market.outcomes[0]?.point, price: market.outcomes[0]?.price },
                home: { point: market.outcomes[1]?.point, price: market.outcomes[1]?.price }
            };
        } else if (market.key === 'totals' && market.outcomes?.length >= 2) {
            const over = market.outcomes.find(o => o.name === 'Over') || market.outcomes[0];
            const under = market.outcomes.find(o => o.name === 'Under') || market.outcomes[1];
            result.totals = {
                over: { point: over?.point, price: over?.price },
                under: { point: under?.point, price: under?.price }
            };
        }
    }
    return Object.keys(result).length > 0 ? result : null;
}

// Global state
let selectedSport = null;
let selectedBetType = null;
let selectedGame = null;
let selectedConfidence = 3;
let selectedUnits = 1;
let currentFilteredGames = [];

/**
 * Select a sport and update UI
 */
function selectSport(sport) {
    console.log('selectSport() called with:', sport);
    if (typeof TMRAnalytics !== 'undefined') TMRAnalytics.makePickStarted({ button_location: 'sport_card', sport: sport });
    selectedSport = sport;
    document.querySelectorAll('.sport-card').forEach(card => {
        card.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');

    // Update bet type labels based on sport
    console.log('Calling updateBetTypeLabels for:', sport);
    updateBetTypeLabels(sport);

    setTimeout(() => {
        showStep('betType');
    }, 300);
}

/**
 * Update bet type button labels based on selected sport
 */
function updateBetTypeLabels(sport) {
    // Define sport-specific terminology
    const betTypeLabels = {
        'NHL': {
            'spread': 'Puck Line',
            'moneyline': 'Money Line',
            'total': 'Over Under',
            'prop': 'Player Props'
        },
        'MLB': {
            'spread': 'Run Line',
            'moneyline': 'Money Line',
            'total': 'Over Under',
            'prop': 'Player Props'
        },
        'NFL': {
            'spread': 'Point Spread',
            'moneyline': 'Money Line',
            'total': 'Over Under',
            'prop': 'Player Props'
        },
        'NBA': {
            'spread': 'Point Spread',
            'moneyline': 'Money Line',
            'total': 'Over Under',
            'prop': 'Player Props'
        },
        'NCAAF': {
            'spread': 'Point Spread',
            'moneyline': 'Money Line',
            'total': 'Over Under',
            'prop': 'Player Props'
        },
        'NCAAB': {
            'spread': 'Point Spread',
            'moneyline': 'Money Line',
            'total': 'Over Under',
            'prop': 'Player Props'
        }
    };

    const labels = betTypeLabels[sport] || betTypeLabels['NFL'];

    console.log(`Updating bet type labels for ${sport}:`, labels);

    // Update each bet type button label
    const buttons = document.querySelectorAll('.bet-type-btn');
    console.log(`Found ${buttons.length} bet type buttons`);

    buttons.forEach(btn => {
        const type = btn.getAttribute('data-type');
        const labelElement = btn.querySelector('.bet-label');
        if (labelElement && labels[type]) {
            console.log(`Updating ${type} label to: ${labels[type]}`);
            labelElement.textContent = labels[type];
        }
    });

    console.log('Bet type labels updated successfully');
}

/**
 * Select bet type and load games
 */
function selectBetType(betType) {
    selectedBetType = betType;
    document.querySelectorAll('.bet-type-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');

    setTimeout(() => {
        showStep('game');
        loadGames();
    }, 300);
}

/**
 * Load games for selected sport and bet type
 */
async function loadGames() {
    console.log(`Loading ${selectedSport} games for ${selectedBetType}`);

    const gamesGrid = document.getElementById('gamesGrid');
    if (!gamesGrid) {
        console.error('gamesGrid element not found');
        return;
    }

    // Show loading state
    gamesGrid.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">Loading games...</div>';

    try {
        // Map sport display names to API keys
        const sportKeyMap = {
            'NFL': 'americanfootball_nfl',
            'NBA': 'basketball_nba',
            'NHL': 'icehockey_nhl',
            'MLB': 'baseball_mlb',
            'NCAAF': 'americanfootball_ncaaf',
            'NCAAB': 'basketball_ncaab'
        };

        const sportKey = sportKeyMap[selectedSport];
        if (!sportKey) {
            gamesGrid.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted);">Invalid sport selected: ${selectedSport}</div>`;
            return;
        }

        console.log(`✅ Selected Sport: ${selectedSport}`);
        console.log(`✅ Mapped to API key: ${sportKey}`);
        console.log(`Fetching games for ${sportKey}...`);

        // Wait for backend detection to complete
        if (window.api && window.api.ready) {
            await window.api.ready;
        }

        // Fetch games from backend API (odds endpoint returns bookmakers data)
        let games = [];
        if (window.api && window.api.backendAvailable) {
            // Backend is available - use the odds endpoint for full data
            const baseUrl = window.api.baseUrl;
            const res = await fetch(`${baseUrl}/games/odds/${sportKey}`);
            const rawGames = await res.json();
            // Transform bookmakers format into simplified odds
            games = (Array.isArray(rawGames) ? rawGames : []).map(g => {
                const odds = parseBookmakerOdds(g.bookmakers || []);
                return { ...g, odds };
            }).filter(g => new Date(g.commence_time) > new Date());
        } else {
            // Fallback: use ESPN free API via TMR inline functions
            const espnPath = window.TMR?.espnPaths?.[sportKey];
            if (espnPath) {
                try {
                    const res = await fetch(`https://site.api.espn.com/apis/v2/scoreboard/header?sport=${espnPath}`);
                    const data = await res.json();
                    const events = data?.sports?.[0]?.leagues?.[0]?.events || [];
                    games = events.filter(e => e.status !== 'post').map(e => {
                        const awayTeam = e.competitors?.find(c => !c.homeAway || c.homeAway === 'away')?.displayName || 'Away';
                        const homeTeam = e.competitors?.find(c => c.homeAway === 'home')?.displayName || 'Home';
                        const odds = window.TMR?.parseEspnOdds?.(e.odds || [], homeTeam, awayTeam) || [];
                        const parsedOdds = parseBookmakerOdds(odds);
                        return {
                            id: e.id,
                            sport_key: sportKey,
                            home_team: homeTeam,
                            away_team: awayTeam,
                            commence_time: e.date,
                            odds: parsedOdds
                        };
                    });
                } catch (espnErr) {
                    console.error('ESPN API error:', espnErr);
                }
            }
        }

        console.log(`Received ${games?.length || 0} games`);

        if (!games || games.length === 0) {
            gamesGrid.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted);">No upcoming games available for ${selectedSport}</div>`;
            return;
        }

        // Filter games that have the required bet type available
        let filteredGames = games.filter(game => {
            if (!game.odds) return false;

            switch(selectedBetType) {
                case 'spread':
                    return game.odds.spread && game.odds.spread.home && game.odds.spread.away;
                case 'moneyline':
                    return game.odds.moneyline && game.odds.moneyline.home && game.odds.moneyline.away;
                case 'total':
                    return game.odds.totals && game.odds.totals.over && game.odds.totals.under;
                case 'prop':
                    return true;
                default:
                    return false;
            }
        });

        console.log(`Filtered to ${filteredGames.length} games with ${selectedBetType} odds`);

        if (filteredGames.length === 0) {
            gamesGrid.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted);">No games available with ${selectedBetType} odds for ${selectedSport}<br><br>Try selecting a different bet type.</div>`;
            return;
        }

        // Sort by commence time
        filteredGames.sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time));

        // Store for later use
        currentFilteredGames = filteredGames;

        // Render game cards
        gamesGrid.innerHTML = filteredGames.map((game, index) => {
            const date = new Date(game.commence_time);
            const now = new Date();
            const hoursUntil = (date - now) / (1000 * 60 * 60);

            let dateStr;
            if (hoursUntil < 0) {
                dateStr = 'Live Now';
            } else if (hoursUntil < 24) {
                dateStr = 'Today ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            } else if (hoursUntil < 48) {
                dateStr = 'Tomorrow ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            } else {
                dateStr = (date.getMonth()+1) + '/' + date.getDate() + '/' + String(date.getFullYear()).slice(-2) + ' ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            }

            // Generate odds display based on bet type
            let oddsDisplay = '';
            if (selectedBetType === 'spread' && game.odds.spread) {
                const homeSpread = game.odds.spread.home.point > 0 ? '+' + game.odds.spread.home.point : game.odds.spread.home.point;
                const awaySpread = game.odds.spread.away.point > 0 ? '+' + game.odds.spread.away.point : game.odds.spread.away.point;

                // Get short team names (last word)
                const awayShort = game.away_team.split(' ').pop();
                const homeShort = game.home_team.split(' ').pop();

                oddsDisplay = `
                    <div class="game-odds">
                        <div class="spread">${awayShort} ${awaySpread} (${formatOdds(game.odds.spread.away.price)})</div>
                        <div class="spread">${homeShort} ${homeSpread} (${formatOdds(game.odds.spread.home.price)})</div>
                    </div>
                `;
            } else if (selectedBetType === 'moneyline' && game.odds.moneyline) {
                const awayShort = game.away_team.split(' ').pop();
                const homeShort = game.home_team.split(' ').pop();

                oddsDisplay = `
                    <div class="game-odds">
                        <div class="moneyline">${awayShort} ${formatOdds(game.odds.moneyline.away)}</div>
                        <div class="moneyline">${homeShort} ${formatOdds(game.odds.moneyline.home)}</div>
                    </div>
                `;
            } else if (selectedBetType === 'total' && game.odds.totals) {
                oddsDisplay = `
                    <div class="game-odds">
                        <div class="total">Over ${game.odds.totals.over.point} (${formatOdds(game.odds.totals.over.price)})</div>
                        <div class="total">Under ${game.odds.totals.under.point} (${formatOdds(game.odds.totals.under.price)})</div>
                    </div>
                `;
            } else if (selectedBetType === 'prop') {
                oddsDisplay = `
                    <div class="game-odds">
                        <div class="prop">Player props available</div>
                    </div>
                `;
            }

            return `
                <div class="game-card" onclick="selectGameFromGrid(${index})">
                    <div class="game-time">${dateStr}</div>
                    <div class="game-matchup">
                        <div class="team away">
                            <span class="team-name">${game.away_team}</span>
                        </div>
                        <div class="at-symbol">@</div>
                        <div class="team home">
                            <span class="team-name">${game.home_team}</span>
                        </div>
                    </div>
                    ${oddsDisplay}
                </div>
            `;
        }).join('');

        console.log(`✅ Loaded ${filteredGames.length} ${selectedSport} games with ${selectedBetType} odds`);

    } catch (error) {
        console.error('Error loading games:', error);
        gamesGrid.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--neon-red);">Error loading games: ${error.message}<br><br>Please check your API configuration and try again.</div>`;
    }
}

/**
 * Format odds for display
 */
function formatOdds(odds) {
    if (!odds) return 'N/A';
    return odds > 0 ? '+' + odds : odds;
}

/**
 * Select game from grid
 */
function selectGameFromGrid(index) {
    if (!currentFilteredGames || !currentFilteredGames[index]) {
        console.error('Game not found at index:', index);
        return;
    }

    const game = currentFilteredGames[index];
    selectedGame = `${game.away_team} @ ${game.home_team}`;

    // Update summary display
    const summaryGame = document.getElementById('summaryGame');
    if (summaryGame) {
        summaryGame.textContent = selectedGame;
    }

    // Auto-populate pick options based on bet type
    const summaryPick = document.getElementById('summaryPick');
    const summaryOdds = document.getElementById('summaryOdds');

    if (selectedBetType === 'spread' && game.odds.spread) {
        const homeSpread = game.odds.spread.home.point > 0 ? '+' + game.odds.spread.home.point : game.odds.spread.home.point;
        if (summaryPick) summaryPick.textContent = `${game.home_team} ${homeSpread}`;
        if (summaryOdds) summaryOdds.textContent = formatOdds(game.odds.spread.home.price);
    } else if (selectedBetType === 'moneyline' && game.odds.moneyline) {
        if (summaryPick) summaryPick.textContent = `${game.home_team} ML`;
        if (summaryOdds) summaryOdds.textContent = formatOdds(game.odds.moneyline.home);
    } else if (selectedBetType === 'total' && game.odds.totals) {
        if (summaryPick) summaryPick.textContent = `Over ${game.odds.totals.over.point}`;
        if (summaryOdds) summaryOdds.textContent = formatOdds(game.odds.totals.over.price);
    }

    showStep('details');
}

/**
 * Show different steps
 */
function showStep(step) {
    document.querySelectorAll('.pick-step').forEach(s => s.classList.remove('active'));

    const steps = {
        'sport': 'sportSelection',
        'betType': 'betTypeSelection',
        'game': 'gameSelection',
        'details': 'pickDetails'
    };

    const stepElement = document.getElementById(steps[step]);
    if (stepElement) {
        stepElement.classList.add('active');
    }
}

/**
 * Go back to previous step
 */
function goBack(toStep) {
    showStep(toStep);
}

/**
 * Set confidence level
 */
function setConfidence(level) {
    selectedConfidence = level;
    document.querySelectorAll('.conf-btn').forEach(btn => btn.classList.remove('active'));
    event.currentTarget.classList.add('active');
}

/**
 * Set units
 */
function setUnits(units) {
    selectedUnits = units;
    document.querySelectorAll('.unit-btn').forEach(btn => btn.classList.remove('active'));
    event.currentTarget.classList.add('active');
}

/**
 * Submit pick - Uses backend API when available, localStorage as fallback
 */
async function submitPick() {
    const reasoning = document.getElementById('pickReasoning')?.value || '';

    // Find the selected game from currentFilteredGames
    const selectedGameObj = currentFilteredGames.find(g => `${g.away_team} @ ${g.home_team}` === selectedGame);

    if (!selectedGameObj) {
        console.error('Could not find game data for:', selectedGame);
        alert('Error: Could not find game data. Please try again.');
        return;
    }

    // Map sport display name to sport_key
    const sportKeyMap = {
        'NFL': 'americanfootball_nfl',
        'NBA': 'basketball_nba',
        'NHL': 'icehockey_nhl',
        'MLB': 'baseball_mlb',
        'NCAAF': 'americanfootball_ncaaf',
        'NCAAB': 'basketball_ncaab'
    };

    // Map bet type to market_type
    const marketTypeMap = {
        'moneyline': 'h2h',
        'spread': 'spreads',
        'total': 'totals'
    };

    // Get the actual odds based on selection
    let oddsValue = -110;
    let lineValue = null;
    let selection = '';
    const awayTeam = selectedGameObj.away_team;
    const homeTeam = selectedGameObj.home_team;

    if (selectedBetType === 'moneyline') {
        selection = homeTeam;  // Default to home team
        if (selectedGameObj.odds?.moneyline?.home) {
            oddsValue = selectedGameObj.odds.moneyline.home;
        }
    } else if (selectedBetType === 'spread') {
        selection = homeTeam;
        if (selectedGameObj.odds?.spread?.home) {
            oddsValue = selectedGameObj.odds.spread.home.price;
            lineValue = selectedGameObj.odds.spread.home.point;
        }
    } else if (selectedBetType === 'total') {
        selection = 'Over';
        if (selectedGameObj.odds?.totals?.over) {
            oddsValue = selectedGameObj.odds.totals.over.price;
            lineValue = selectedGameObj.odds.totals.over.point;
        }
    }

    const sportKey = sportKeyMap[selectedSport] || selectedSport.toLowerCase();
    const marketType = marketTypeMap[selectedBetType] || selectedBetType;

    // Try backend API first
    if (window.api && window.api.backendAvailable && window.api.isLoggedIn()) {
        try {
            const result = await window.api.createPick({
                game_id: selectedGameObj.id,
                sport_key: sportKey,
                market_type: marketType,
                selection: selection,
                odds_snapshot: oddsValue,
                line_snapshot: lineValue,
                units: selectedUnits || 1
            });
            console.log('[TMR] Pick submitted via backend:', result);
            alert('Pick submitted and recorded on your permanent record!');
        } catch (err) {
            console.error('[TMR] Backend pick submission failed:', err);
            alert(`Pick submission failed: ${err.message || 'Unknown error'}. Please try again.`);
            return;
        }
    } else {
        // Fallback: save to localStorage
        const pick = {
            id: Date.now().toString(),
            game_id: selectedGameObj.id || null,
            sport_key: sportKey,
            sport_title: selectedSport,
            home_team: homeTeam,
            away_team: awayTeam,
            market_type: marketType,
            selection: selection,
            line_snapshot: lineValue,
            odds_snapshot: oddsValue,
            units: selectedUnits || 1,
            commence_time: selectedGameObj.commence_time,
            status: 'pending',
            confidence: selectedConfidence,
            reasoning: reasoning,
            created_at: new Date().toISOString(),
            locked_at: new Date().toISOString()
        };

        const picks = JSON.parse(localStorage.getItem('tmr_picks') || '[]');
        picks.unshift(pick);
        localStorage.setItem('tmr_picks', JSON.stringify(picks));
        console.log('[TMR] Pick saved to localStorage:', pick);
        alert('Pick submitted! (Saved locally - connect to backend for permanent record)');
    }

    // Analytics: track pick submission
    if (typeof TMRAnalytics !== 'undefined') TMRAnalytics.pickSubmitted({ sport: selectedSport, pick_type: selectedBetType, odds: oddsValue, units: selectedUnits, league: sportKey });

    // Update picks history display if it exists
    if (typeof loadPicksHistory === 'function') {
        loadPicksHistory();
    }

    // Reset and go back to sport selection
    selectedSport = null;
    selectedBetType = null;
    selectedGame = null;
    selectedConfidence = 3;
    selectedUnits = 1;
    document.getElementById('pickReasoning').value = '';

    // Clear game grid
    const gamesGrid = document.getElementById('gamesGrid');
    if (gamesGrid) {
        gamesGrid.innerHTML = '';
    }

    showStep('sport');
}
/**
 * Load picks history
 */
function loadPicksHistory() {
    const picks = JSON.parse(localStorage.getItem('tmr_picks') || '[]');
    const container = document.getElementById('recentPicksContainer');

    if (!container) return;

    if (picks.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 40px;">No picks yet. Make your first pick above!</p>';
        return;
    }

    container.innerHTML = picks.slice(0, 10).map(pick => {
        const sportKey = pick.sport_key || pick.sport || 'general';
        const homeTeam = pick.home_team || pick.team1 || 'Home';
        const awayTeam = pick.away_team || pick.team2 || 'Away';
        const units = pick.units || pick.stake || 1;
        const odds = pick.odds_snapshot || pick.odds || -110;
        const selection = pick.selection || 'Unknown';
        const marketType = pick.market_type || pick.pickType || pick.betType || 'h2h';
        const status = pick.status || pick.result || 'pending';
        
        // Format the pick description based on market type
        let pickDesc = '';
        if (marketType === 'h2h' || marketType === 'moneyline' || marketType === 'Moneyline') {
            pickDesc = selection;
        } else if (marketType === 'spreads' || marketType === 'spread' || marketType === 'Spread') {
            const line = pick.line_snapshot || pick.line || 0;
            pickDesc = `${selection} ${line > 0 ? '+' : ''}${line}`;
        } else if (marketType === 'totals' || marketType === 'total' || marketType === 'Total') {
            const line = pick.line_snapshot || pick.line || 0;
            pickDesc = `${selection} ${line}`;
        } else {
            pickDesc = selection;
        }
        
        const createdAt = pick.created_at || pick.createdAt || pick.timestamp || pick.locked_at;
        
        return `
        <div class="pick-history-item ${status}">
            <div class="pick-history-header">
                <span class="pick-sport-badge">${sportKey.split('_')[0].toUpperCase()}</span>
                <span class="pick-bet-type">${marketType}</span>
                <span class="pick-date">${createdAt ? new Date(createdAt).toLocaleDateString() : 'Today'}</span>
            </div>
            <div class="pick-history-details">
                <div class="pick-game-info">${awayTeam} @ ${homeTeam}</div>
                <div class="pick-confidence">${pickDesc} | ${units}u @ ${odds > 0 ? '+' : ''}${odds}</div>
                ${pick.reasoning ? `<div class="pick-reasoning">${pick.reasoning}</div>` : ''}
            </div>
            <div class="pick-status-badge ${status}">${status.toUpperCase()}</div>
        </div>
    `}).join('');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    console.log('========================================');
    console.log('✅ PICKS-COMPLETE-FIX.JS LOADED');
    console.log('========================================');
    console.log('Functions exported to window:');
    console.log('- selectSport:', typeof window.selectSport);
    console.log('- selectBetType:', typeof window.selectBetType);
    console.log('- loadGames:', typeof window.loadGames);
    console.log('- updateBetTypeLabels:', typeof window.updateBetTypeLabels);

    if (document.getElementById('sportSelection')) {
        showStep('sport');

        // Clear any hardcoded games from HTML
        const gamesGrid = document.getElementById('gamesGrid');
        if (gamesGrid) {
            gamesGrid.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">Select a sport and bet type to see available games</div>';
        }

        // Load picks history from localStorage
        if (typeof loadPicksHistory === 'function') {
            loadPicksHistory();
        }
    }

    console.log('Picks module initialized successfully');
});

// Export functions to window
if (typeof window !== 'undefined') {
    window.selectSport = selectSport;
    window.selectBetType = selectBetType;
    window.selectGameFromGrid = selectGameFromGrid;
    window.loadGames = loadGames;
    window.formatOdds = formatOdds;
    window.showStep = showStep;
    window.goBack = goBack;
    window.setConfidence = setConfidence;
    window.setUnits = setUnits;
    window.submitPick = submitPick;
    window.loadPicksHistory = loadPicksHistory;
    window.updateBetTypeLabels = updateBetTypeLabels;
}
