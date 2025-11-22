// COMPLETE FIX FOR MAKE YOUR PICK MODULE
// This file completely replaces the broken inline JavaScript

// Global state
let selectedSport = null;
let selectedBetType = null;
let selectedGame = null;
let selectedGameObject = null; // Store the full game object
let selectedPickSide = null; // Store which side user selected (home/away/over/under)
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
    selectedGameObject = game; // Store full game object
    selectedPickSide = null; // Reset pick side selection

    // Update summary display
    const summaryGame = document.getElementById('summaryGame');
    if (summaryGame) {
        summaryGame.textContent = selectedGame;
    }

    // Create pick selection UI
    createPickSelection(game);

    showStep('details');
}

/**
 * Create pick selection interface based on bet type
 */
function createPickSelection(game) {
    const pickSelectionContainer = document.getElementById('pickSelectionContainer');
    if (!pickSelectionContainer) {
        console.warn('pickSelectionContainer not found');
        return;
    }

    let html = '<div class="pick-selection-grid">';

    if (selectedBetType === 'spread' && game.odds.spread) {
        const homeSpread = game.odds.spread.home.point > 0 ? '+' + game.odds.spread.home.point : game.odds.spread.home.point;
        const awaySpread = game.odds.spread.away.point > 0 ? '+' + game.odds.spread.away.point : game.odds.spread.away.point;

        html += `
            <div class="pick-option-card" onclick="selectPickSide('away')">
                <div class="pick-team">${game.away_team}</div>
                <div class="pick-line">${awaySpread}</div>
                <div class="pick-odds">${formatOdds(game.odds.spread.away.price)}</div>
            </div>
            <div class="pick-option-card" onclick="selectPickSide('home')">
                <div class="pick-team">${game.home_team}</div>
                <div class="pick-line">${homeSpread}</div>
                <div class="pick-odds">${formatOdds(game.odds.spread.home.price)}</div>
            </div>
        `;
    } else if (selectedBetType === 'moneyline' && game.odds.moneyline) {
        html += `
            <div class="pick-option-card" onclick="selectPickSide('away')">
                <div class="pick-team">${game.away_team}</div>
                <div class="pick-line">ML</div>
                <div class="pick-odds">${formatOdds(game.odds.moneyline.away)}</div>
            </div>
            <div class="pick-option-card" onclick="selectPickSide('home')">
                <div class="pick-team">${game.home_team}</div>
                <div class="pick-line">ML</div>
                <div class="pick-odds">${formatOdds(game.odds.moneyline.home)}</div>
            </div>
        `;
    } else if (selectedBetType === 'total' && game.odds.totals) {
        html += `
            <div class="pick-option-card" onclick="selectPickSide('over')">
                <div class="pick-team">OVER</div>
                <div class="pick-line">${game.odds.totals.over.point}</div>
                <div class="pick-odds">${formatOdds(game.odds.totals.over.price)}</div>
            </div>
            <div class="pick-option-card" onclick="selectPickSide('under')">
                <div class="pick-team">UNDER</div>
                <div class="pick-line">${game.odds.totals.under.point}</div>
                <div class="pick-odds">${formatOdds(game.odds.totals.under.price)}</div>
            </div>
        `;
    } else if (selectedBetType === 'prop') {
        html += `
            <div class="pick-option-card" onclick="selectPickSide('prop')">
                <div class="pick-team">Enter Prop Manually</div>
                <div class="pick-line">Various Props Available</div>
            </div>
        `;
    }

    html += '</div>';
    pickSelectionContainer.innerHTML = html;
}

/**
 * Select which side/pick the user wants
 */
function selectPickSide(side) {
    selectedPickSide = side;

    // Highlight selected option
    document.querySelectorAll('.pick-option-card').forEach(card => {
        card.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');

    // Update summary display
    updatePickSummary();
}

/**
 * Update pick summary based on selection
 */
function updatePickSummary() {
    if (!selectedGameObject || !selectedPickSide) return;

    const game = selectedGameObject;
    const summaryPick = document.getElementById('summaryPick');
    const summaryOdds = document.getElementById('summaryOdds');

    let pickText = '';
    let oddsValue = '';

    if (selectedBetType === 'spread' && game.odds.spread) {
        if (selectedPickSide === 'home') {
            const homeSpread = game.odds.spread.home.point > 0 ? '+' + game.odds.spread.home.point : game.odds.spread.home.point;
            pickText = `${game.home_team} ${homeSpread}`;
            oddsValue = formatOdds(game.odds.spread.home.price);
        } else if (selectedPickSide === 'away') {
            const awaySpread = game.odds.spread.away.point > 0 ? '+' + game.odds.spread.away.point : game.odds.spread.away.point;
            pickText = `${game.away_team} ${awaySpread}`;
            oddsValue = formatOdds(game.odds.spread.away.price);
        }
    } else if (selectedBetType === 'moneyline' && game.odds.moneyline) {
        if (selectedPickSide === 'home') {
            pickText = `${game.home_team} ML`;
            oddsValue = formatOdds(game.odds.moneyline.home);
        } else if (selectedPickSide === 'away') {
            pickText = `${game.away_team} ML`;
            oddsValue = formatOdds(game.odds.moneyline.away);
        }
    } else if (selectedBetType === 'total' && game.odds.totals) {
        if (selectedPickSide === 'over') {
            pickText = `Over ${game.odds.totals.over.point}`;
            oddsValue = formatOdds(game.odds.totals.over.price);
        } else if (selectedPickSide === 'under') {
            pickText = `Under ${game.odds.totals.under.point}`;
            oddsValue = formatOdds(game.odds.totals.under.price);
        }
    }

    if (summaryPick) summaryPick.textContent = pickText;
    if (summaryOdds) summaryOdds.textContent = oddsValue;
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
    // Validate user is logged in
    if (!auth || !auth.isLoggedIn()) {
        alert('⚠️ You must be logged in to submit picks!');
        if (typeof showSection === 'function') {
            showSection('login');
        }
        return;
    }

    // Validate pick side is selected
    if (!selectedPickSide) {
        alert('⚠️ Please select which side you want to pick!');
        return;
    }

    if (!selectedGameObject) {
        alert('⚠️ Game data missing. Please try selecting the game again.');
        return;
    }

    const reasoning = document.getElementById('pickReasoning').value;
    const game = selectedGameObject;

    // Get the actual pick details based on selection
    let pickText = '';
    let oddsValue = null;

    if (selectedBetType === 'spread' && game.odds.spread) {
        if (selectedPickSide === 'home') {
            const homeSpread = game.odds.spread.home.point > 0 ? '+' + game.odds.spread.home.point : game.odds.spread.home.point;
            pickText = `${game.home_team} ${homeSpread}`;
            oddsValue = game.odds.spread.home.price;
        } else if (selectedPickSide === 'away') {
            const awaySpread = game.odds.spread.away.point > 0 ? '+' + game.odds.spread.away.point : game.odds.spread.away.point;
            pickText = `${game.away_team} ${awaySpread}`;
            oddsValue = game.odds.spread.away.price;
        }
    } else if (selectedBetType === 'moneyline' && game.odds.moneyline) {
        if (selectedPickSide === 'home') {
            pickText = `${game.home_team} ML`;
            oddsValue = game.odds.moneyline.home;
        } else if (selectedPickSide === 'away') {
            pickText = `${game.away_team} ML`;
            oddsValue = game.odds.moneyline.away;
        }
    } else if (selectedBetType === 'total' && game.odds.totals) {
        if (selectedPickSide === 'over') {
            pickText = `Over ${game.odds.totals.over.point}`;
            oddsValue = game.odds.totals.over.price;
        } else if (selectedPickSide === 'under') {
            pickText = `Under ${game.odds.totals.under.point}`;
            oddsValue = game.odds.totals.under.price;
        }
    } else if (selectedBetType === 'prop') {
        pickText = reasoning || 'Custom Prop Bet';
        oddsValue = -110; // Default prop odds
    }

    // Map sport display name to API key for sport field
    const sportKeyMap = {
        'NFL': 'americanfootball_nfl',
        'NBA': 'basketball_nba',
        'NHL': 'icehockey_nhl',
        'MLB': 'baseball_mlb',
        'NCAAF': 'americanfootball_ncaaf',
        'NCAAB': 'basketball_ncaab'
    };

    // Create complete pick object matching expected schema
    const pick = {
        id: 'pick_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        userId: auth.currentUser.id,
        username: auth.currentUser.username,
        timestamp: new Date().toISOString(),
        sport: sportKeyMap[selectedSport] || selectedSport.toLowerCase(),
        league: selectedSport, // Display name (NFL, NBA, etc.)
        team1: game.away_team,
        team2: game.home_team,
        betType: selectedBetType,
        pick: pickText,
        pickSide: selectedPickSide, // Store which side they picked
        odds: oddsValue,
        units: selectedUnits,
        confidence: selectedConfidence,
        reasoning: reasoning || '',
        status: 'pending',
        profit: 0, // Will be calculated when graded
        gameId: game.id, // Store API game ID for grading
        commenceTime: game.commence_time,
        // Social engagement fields
        likes: 0,
        comments: 0,
        shares: 0,
        isPublic: true // Make picks public by default
    };

    // Save to localStorage with CORRECT key (snake_case)
    const picks = JSON.parse(localStorage.getItem('trustmyrecord_picks') || '[]');
    picks.unshift(pick);
    localStorage.setItem('trustmyrecord_picks', JSON.stringify(picks));

    console.log('✅ Pick submitted and saved:', pick);

    // Update user stats - increment total picks
    auth.currentUser.stats.totalPicks += 1;
    auth.updateProfile({ stats: auth.currentUser.stats });

    alert('✅ Pick submitted and saved to your permanent record!');

    // Update picks history display if it exists
    if (typeof loadPicksHistory === 'function') {
        loadPicksHistory();
    }

    // Refresh feed if social system exists
    if (typeof renderFeed === 'function') {
        renderFeed();
    }

    // Reset and go back to sport selection
    selectedSport = null;
    selectedBetType = null;
    selectedGame = null;
    selectedGameObject = null;
    selectedPickSide = null;
    selectedConfidence = 3;
    selectedUnits = 1;
    document.getElementById('pickReasoning').value = '';

    // Clear game grid
    const gamesGrid = document.getElementById('gamesGrid');
    if (gamesGrid) {
        gamesGrid.innerHTML = '';
    }

    // Clear pick selection
    const pickSelectionContainer = document.getElementById('pickSelectionContainer');
    if (pickSelectionContainer) {
        pickSelectionContainer.innerHTML = '';
    }

    showStep('sport');
}

/**
 * Load picks history
 */
function loadPicksHistory() {
    const picks = JSON.parse(localStorage.getItem('trustmyrecord_picks') || '[]');
    const container = document.getElementById('recentPicksContainer');

    if (!container) return;

    // Filter to current user's picks if logged in
    let userPicks = picks;
    if (auth && auth.isLoggedIn()) {
        userPicks = picks.filter(p => p.userId === auth.currentUser.id);
    }

    if (userPicks.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 40px;">No picks yet. Make your first pick above!</p>';
        return;
    }

    container.innerHTML = userPicks.slice(0, 10).map(pick => {
        // Handle both old format (pick.game) and new format (pick.team1/team2)
        const gameDisplay = pick.game || `${pick.team1} @ ${pick.team2}`;
        const leagueDisplay = pick.league || pick.sport.toUpperCase();

        // Status color
        let statusClass = pick.status;
        if (pick.status === 'win') statusClass = 'win';
        else if (pick.status === 'loss') statusClass = 'loss';
        else if (pick.status === 'push') statusClass = 'push';

        return `
            <div class="pick-history-item ${statusClass}">
                <div class="pick-history-header">
                    <span class="pick-sport-badge">${leagueDisplay}</span>
                    <span class="pick-bet-type">${pick.betType}</span>
                    <span class="pick-date">${new Date(pick.timestamp).toLocaleDateString()}</span>
                </div>
                <div class="pick-history-details">
                    <div class="pick-game-info">
                        <strong>${gameDisplay}</strong>
                    </div>
                    <div class="pick-selection">
                        Pick: ${pick.pick} ${pick.odds ? `(${formatOdds(pick.odds)})` : ''}
                    </div>
                    <div class="pick-confidence">
                        Confidence: ${pick.confidence}/5 | Units: ${pick.units}
                        ${pick.profit ? ` | Profit: ${pick.profit > 0 ? '+' : ''}${pick.profit.toFixed(2)}u` : ''}
                    </div>
                    ${pick.reasoning ? `<div class="pick-reasoning">"${pick.reasoning}"</div>` : ''}
                </div>
                <div class="pick-status-badge ${statusClass}">${pick.status.toUpperCase()}</div>
            </div>
        `;
    }).join('');
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
    window.selectPickSide = selectPickSide;
    window.updatePickSummary = updatePickSummary;
    window.createPickSelection = createPickSelection;
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
