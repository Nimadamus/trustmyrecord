// COMPLETE FIX FOR MAKE YOUR PICK MODULE
// This file completely replaces the broken inline JavaScript

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
        // Initialize API
        const apiKey = CONFIG?.oddsApi?.key || 'YOUR_ODDS_API_KEY';

        if (!window.initSportsAPI) {
            throw new Error('SportsAPI not initialized. Make sure api.js is loaded.');
        }

        const api = initSportsAPI(apiKey);

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
        console.log(`Fetching games from API for ${sportKey}...`);

        // Fetch games for the selected sport
        const games = await api.getUpcomingGames(sportKey);

        console.log(`Received ${games?.length || 0} games from API`);
        if (games && games.length > 0) {
            console.log('First game details:', {
                sport: games[0].sport,
                sport_title: games[0].sport_title,
                matchup: `${games[0].away_team} @ ${games[0].home_team}`
            });
        }

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
                    return true; // Props are always available for manual entry
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
                dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
            }

            // Generate clickable odds options based on bet type
            let oddsDisplay = '';
            if (selectedBetType === 'spread' && game.odds.spread) {
                const homeSpread = game.odds.spread.home.point > 0 ? '+' + game.odds.spread.home.point : game.odds.spread.home.point;
                const awaySpread = game.odds.spread.away.point > 0 ? '+' + game.odds.spread.away.point : game.odds.spread.away.point;

                oddsDisplay = `
                    <div class="game-odds clickable">
                        <div class="bet-option" onclick="selectBetOption(${index}, 'away', '${game.away_team} ${awaySpread}', ${game.odds.spread.away.price})">
                            <div class="bet-team">${game.away_team}</div>
                            <div class="bet-line">${awaySpread}</div>
                            <div class="bet-odds">${formatOdds(game.odds.spread.away.price)}</div>
                        </div>
                        <div class="bet-option" onclick="selectBetOption(${index}, 'home', '${game.home_team} ${homeSpread}', ${game.odds.spread.home.price})">
                            <div class="bet-team">${game.home_team}</div>
                            <div class="bet-line">${homeSpread}</div>
                            <div class="bet-odds">${formatOdds(game.odds.spread.home.price)}</div>
                        </div>
                    </div>
                `;
            } else if (selectedBetType === 'moneyline' && game.odds.moneyline) {
                oddsDisplay = `
                    <div class="game-odds clickable">
                        <div class="bet-option" onclick="selectBetOption(${index}, 'away', '${game.away_team} ML', ${game.odds.moneyline.away})">
                            <div class="bet-team">${game.away_team}</div>
                            <div class="bet-line">ML</div>
                            <div class="bet-odds">${formatOdds(game.odds.moneyline.away)}</div>
                        </div>
                        <div class="bet-option" onclick="selectBetOption(${index}, 'home', '${game.home_team} ML', ${game.odds.moneyline.home})">
                            <div class="bet-team">${game.home_team}</div>
                            <div class="bet-line">ML</div>
                            <div class="bet-odds">${formatOdds(game.odds.moneyline.home)}</div>
                        </div>
                    </div>
                `;
            } else if (selectedBetType === 'total' && game.odds.totals) {
                oddsDisplay = `
                    <div class="game-odds clickable">
                        <div class="bet-option" onclick="selectBetOption(${index}, 'over', 'Over ${game.odds.totals.over.point}', ${game.odds.totals.over.price})">
                            <div class="bet-team">OVER</div>
                            <div class="bet-line">${game.odds.totals.over.point}</div>
                            <div class="bet-odds">${formatOdds(game.odds.totals.over.price)}</div>
                        </div>
                        <div class="bet-option" onclick="selectBetOption(${index}, 'under', 'Under ${game.odds.totals.under.point}', ${game.odds.totals.under.price})">
                            <div class="bet-team">UNDER</div>
                            <div class="bet-line">${game.odds.totals.under.point}</div>
                            <div class="bet-odds">${formatOdds(game.odds.totals.under.price)}</div>
                        </div>
                    </div>
                `;
            } else if (selectedBetType === 'prop') {
                oddsDisplay = `
                    <div class="game-odds clickable">
                        <div class="bet-option prop-option" onclick="selectBetOption(${index}, 'prop', 'Player Prop', -110)">
                            <div class="bet-team">Player Props</div>
                            <div class="bet-line">Select to customize</div>
                        </div>
                    </div>
                `;
            }

            return `
                <div class="game-card">
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
                    <div class="pick-instruction">Click your pick below:</div>
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
 * Select a specific bet option from a game
 */
let selectedPickText = '';
let selectedOddsValue = 0;

function selectBetOption(gameIndex, side, pickText, odds) {
    if (!currentFilteredGames || !currentFilteredGames[gameIndex]) {
        console.error('Game not found at index:', gameIndex);
        return;
    }

    const game = currentFilteredGames[gameIndex];
    selectedGame = `${game.away_team} @ ${game.home_team}`;
    selectedPickText = pickText;
    selectedOddsValue = odds;

    // Update summary display
    const summaryGame = document.getElementById('summaryGame');
    const summaryPick = document.getElementById('summaryPick');
    const summaryOdds = document.getElementById('summaryOdds');

    if (summaryGame) summaryGame.textContent = selectedGame;
    if (summaryPick) summaryPick.textContent = pickText;
    if (summaryOdds) summaryOdds.textContent = formatOdds(odds);

    console.log(`Selected: ${pickText} (${formatOdds(odds)}) for game: ${selectedGame}`);

    showStep('details');
}

/**
 * Legacy function for backwards compatibility
 */
function selectGameFromGrid(index) {
    // Default to home team/over for backwards compatibility
    const game = currentFilteredGames[index];
    if (!game) return;

    if (selectedBetType === 'spread' && game.odds.spread) {
        const homeSpread = game.odds.spread.home.point > 0 ? '+' + game.odds.spread.home.point : game.odds.spread.home.point;
        selectBetOption(index, 'home', `${game.home_team} ${homeSpread}`, game.odds.spread.home.price);
    } else if (selectedBetType === 'moneyline' && game.odds.moneyline) {
        selectBetOption(index, 'home', `${game.home_team} ML`, game.odds.moneyline.home);
    } else if (selectedBetType === 'total' && game.odds.totals) {
        selectBetOption(index, 'over', `Over ${game.odds.totals.over.point}`, game.odds.totals.over.price);
    } else {
        selectBetOption(index, 'prop', 'Player Prop', -110);
    }
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
 * Submit pick
 */
function submitPick() {
    const reasoning = document.getElementById('pickReasoning').value;

    const pick = {
        sport: selectedSport,
        betType: selectedBetType,
        game: selectedGame,
        pick: selectedPickText,
        odds: selectedOddsValue,
        confidence: selectedConfidence,
        units: selectedUnits,
        reasoning: reasoning,
        timestamp: new Date().toISOString(),
        status: 'pending',
        id: Date.now()
    };

    // Save to localStorage
    const picks = JSON.parse(localStorage.getItem('trustMyRecordPicks') || '[]');
    picks.unshift(pick);
    localStorage.setItem('trustMyRecordPicks', JSON.stringify(picks));

    console.log('Pick submitted and saved:', pick);

    // Show success message without alert
    const successMsg = document.createElement('div');
    successMsg.className = 'pick-success-toast';
    successMsg.innerHTML = '✅ Pick locked in!';
    document.body.appendChild(successMsg);
    setTimeout(() => successMsg.remove(), 2000);

    // Update picks history display if it exists
    loadPicksHistory();

    // Reset and go back to sport selection
    selectedSport = null;
    selectedBetType = null;
    selectedGame = null;
    selectedPickText = '';
    selectedOddsValue = 0;
    selectedConfidence = 3;
    selectedUnits = 1;
    document.getElementById('pickReasoning').value = '';

    // Reset confidence and units buttons
    document.querySelectorAll('.conf-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('.conf-btn[data-conf="3"]')?.classList.add('active');
    document.querySelectorAll('.unit-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('.unit-btn[data-units="1"]')?.classList.add('active');

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
    const picks = JSON.parse(localStorage.getItem('trustMyRecordPicks') || '[]');
    const container = document.getElementById('recentPicksContainer');

    if (!container) return;

    if (picks.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 40px;">No picks yet. Make your first pick above!</p>';
        return;
    }

    container.innerHTML = picks.slice(0, 10).map(pick => `
        <div class="pick-history-item ${pick.status}">
            <div class="pick-history-header">
                <span class="pick-sport-badge">${pick.sport}</span>
                <span class="pick-bet-type">${pick.betType}</span>
                <span class="pick-date">${new Date(pick.timestamp).toLocaleDateString()}</span>
            </div>
            <div class="pick-history-details">
                <div class="pick-game-info">${pick.game}</div>
                <div class="pick-selection">
                    <strong>${pick.pick || 'N/A'}</strong>
                    ${pick.odds ? `<span class="pick-odds">(${formatOdds(pick.odds)})</span>` : ''}
                </div>
                <div class="pick-confidence">Confidence: ${'🔥'.repeat(pick.confidence)} | Units: ${pick.units}</div>
                ${pick.reasoning ? `<div class="pick-reasoning">"${pick.reasoning}"</div>` : ''}
            </div>
            <div class="pick-status-badge ${pick.status}">${pick.status.toUpperCase()}</div>
        </div>
    `).join('');
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
    window.selectBetOption = selectBetOption;
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
