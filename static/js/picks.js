// Picks page functionality - Fetch real games and odds from API

let currentSport = null;
let availableGames = [];

/**
 * Initialize the picks page with real data
 */
async function initPicksPage() {
    console.log('Initializing picks page...');

    // Initialize API (will use mock if no key set)
    const apiKey = CONFIG?.oddsApi?.key || 'YOUR_ODDS_API_KEY';
    const api = initSportsAPI(apiKey);

    // Load sports into dropdown
    await loadSportsDropdown(api);

    // Add event listener to sport dropdown
    const sportSelect = document.getElementById('sport');
    if (sportSelect) {
        sportSelect.addEventListener('change', async (e) => {
            const sportKey = e.target.value;
            if (sportKey) {
                await loadGamesForSport(api, sportKey);
            }
        });
    }

    // Add event listener to bet type dropdown
    const betTypeSelect = document.getElementById('betType');
    if (betTypeSelect) {
        betTypeSelect.addEventListener('change', (e) => {
            updatePickOptions(e.target.value);
        });
    }

    // Add event listener to matchup dropdown
    const matchupSelect = document.getElementById('matchup');
    if (matchupSelect) {
        matchupSelect.addEventListener('change', (e) => {
            const gameId = e.target.value;
            const betType = document.getElementById('betType').value;
            if (gameId && betType) {
                populatePickOptions(gameId, betType);
            }
        });
    }

    console.log('Picks page initialized');
}

/**
 * Load sports into dropdown
 */
async function loadSportsDropdown(api) {
    const sportSelect = document.getElementById('sport');
    if (!sportSelect) return;

    try {
        const sports = await api.getSports();

        // Clear existing options
        sportSelect.innerHTML = '<option value="">Select Sport</option>';

        // Add "All Sports" option
        const allOption = document.createElement('option');
        allOption.value = 'ALL';
        allOption.textContent = '🔥 All Sports (Show Everything)';
        sportSelect.appendChild(allOption);

        // Add separator
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '──────────';
        sportSelect.appendChild(separator);

        // Group sports by category
        const grouped = {};
        sports.forEach(sport => {
            if (sport.active) {
                const group = sport.group || 'Other';
                if (!grouped[group]) grouped[group] = [];
                grouped[group].push(sport);
            }
        });

        // Add sports by group
        Object.keys(grouped).sort().forEach(group => {
            const groupHeader = document.createElement('option');
            groupHeader.disabled = true;
            groupHeader.textContent = `📊 ${group}`;
            groupHeader.style.fontWeight = 'bold';
            sportSelect.appendChild(groupHeader);

            grouped[group].forEach(sport => {
                const option = document.createElement('option');
                option.value = sport.key;
                option.textContent = `  ${sport.title}`;
                sportSelect.appendChild(option);
            });
        });

        console.log(`Loaded ${sports.length} sports in ${Object.keys(grouped).length} categories`);
    } catch (error) {
        console.error('Error loading sports:', error);
    }
}

/**
 * Load games for selected sport (or ALL sports)
 */
async function loadGamesForSport(api, sportKey) {
    console.log(`Loading games for ${sportKey}...`);

    currentSport = sportKey;

    // Show loading state
    const matchupSelect = document.getElementById('matchup');
    if (matchupSelect) {
        matchupSelect.innerHTML = '<option value="">Loading games...</option>';
        matchupSelect.disabled = true;
    }

    try {
        let games;

        if (sportKey === 'ALL') {
            // Fetch ALL sports at once
            console.log('Fetching all sports - this may take a moment...');
            games = await api.getAllUpcomingGames();
        } else {
            // Fetch single sport
            games = await api.getUpcomingGames(sportKey);
        }

        availableGames = games;

        if (matchupSelect) {
            matchupSelect.innerHTML = '<option value="">Select Matchup</option>';

            if (games.length === 0) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'No upcoming games available';
                matchupSelect.appendChild(option);
            } else {
                // Group games by sport if showing all
                if (sportKey === 'ALL') {
                    const bySport = {};
                    games.forEach(game => {
                        const sport = game.sport_title || game.sport;
                        if (!bySport[sport]) bySport[sport] = [];
                        bySport[sport].push(game);
                    });

                    // Sort by commence time within each sport
                    Object.keys(bySport).forEach(sport => {
                        bySport[sport].sort((a, b) =>
                            new Date(a.commence_time) - new Date(b.commence_time)
                        );
                    });

                    // Add grouped options
                    Object.keys(bySport).sort().forEach(sport => {
                        const groupHeader = document.createElement('option');
                        groupHeader.disabled = true;
                        groupHeader.textContent = `━━━ ${sport} ━━━`;
                        groupHeader.style.fontWeight = 'bold';
                        matchupSelect.appendChild(groupHeader);

                        bySport[sport].forEach((game, globalIndex) => {
                            const gameIndex = games.indexOf(game);
                            addGameOption(matchupSelect, game, gameIndex);
                        });
                    });
                } else {
                    // Single sport - sort by time
                    games.sort((a, b) =>
                        new Date(a.commence_time) - new Date(b.commence_time)
                    );

                    games.forEach((game, index) => {
                        addGameOption(matchupSelect, game, index);
                    });
                }
            }

            matchupSelect.disabled = false;
        }

        console.log(`Loaded ${games.length} total games`);
    } catch (error) {
        console.error('Error loading games:', error);
        if (matchupSelect) {
            matchupSelect.innerHTML = '<option value="">Error loading games</option>';
        }
    }
}

/**
 * Helper to add a game option to dropdown
 */
function addGameOption(selectElement, game, index) {
    const option = document.createElement('option');
    option.value = index;

    const date = new Date(game.commence_time);
    const now = new Date();
    const hoursUntil = (date - now) / (1000 * 60 * 60);

    let dateStr;
    if (hoursUntil < 24) {
        dateStr = date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit'
        });
        dateStr = `Today ${dateStr}`;
    } else if (hoursUntil < 48) {
        dateStr = date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit'
        });
        dateStr = `Tomorrow ${dateStr}`;
    } else {
        dateStr = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }

    // Show odds preview if available
    let oddsPreview = '';
    if (game.odds?.spread?.home?.point) {
        oddsPreview = ` [${game.odds.spread.home.point > 0 ? '+' : ''}${game.odds.spread.home.point}]`;
    } else if (game.odds?.moneyline?.home) {
        const ml = game.odds.moneyline.home;
        oddsPreview = ` [${ml > 0 ? '+' : ''}${ml}]`;
    }

    option.textContent = `${game.away_team} @ ${game.home_team}${oddsPreview} - ${dateStr}`;
    selectElement.appendChild(option);
}

/**
 * Update pick options based on bet type
 */
function updatePickOptions(betType) {
    const matchupSelect = document.getElementById('matchup');
    const gameIndex = matchupSelect?.value;

    if (gameIndex && availableGames[gameIndex]) {
        populatePickOptions(gameIndex, betType);
    }
}

/**
 * Populate pick options based on game and bet type
 */
function populatePickOptions(gameIndex, betType) {
    const game = availableGames[gameIndex];
    if (!game) return;

    const pickSelect = document.getElementById('pick');
    const oddsInput = document.getElementById('odds');

    if (!pickSelect || !oddsInput) return;

    pickSelect.innerHTML = '<option value="">Select Your Pick</option>';

    const odds = game.odds;

    switch (betType) {
        case 'moneyline':
            if (odds.moneyline) {
                addPickOption(pickSelect, `${game.home_team} ML`, odds.moneyline.home);
                addPickOption(pickSelect, `${game.away_team} ML`, odds.moneyline.away);
            }
            break;

        case 'spread':
            if (odds.spread) {
                const homeSpread = odds.spread.home.point > 0 ? `+${odds.spread.home.point}` : odds.spread.home.point;
                const awaySpread = odds.spread.away.point > 0 ? `+${odds.spread.away.point}` : odds.spread.away.point;

                addPickOption(pickSelect, `${game.home_team} ${homeSpread}`, odds.spread.home.price);
                addPickOption(pickSelect, `${game.away_team} ${awaySpread}`, odds.spread.away.price);
            }
            break;

        case 'total':
            if (odds.totals) {
                addPickOption(pickSelect, `Over ${odds.totals.over.point}`, odds.totals.over.price);
                addPickOption(pickSelect, `Under ${odds.totals.under.point}`, odds.totals.under.price);
            }
            break;

        case 'prop':
        case 'parlay':
            // Manual entry for props and parlays
            pickSelect.innerHTML = '<option value="">Enter manually below</option>';
            oddsInput.value = '';
            oddsInput.disabled = false;
            oddsInput.placeholder = 'Enter odds (e.g., -110, +150)';
            return;
    }

    // Auto-populate odds when pick is selected
    pickSelect.addEventListener('change', function() {
        const selectedOption = this.options[this.selectedIndex];
        const odds = selectedOption.dataset.odds;
        if (odds && oddsInput) {
            oddsInput.value = odds;
        }
    });
}

/**
 * Helper to add pick option with odds data
 */
function addPickOption(selectElement, label, odds) {
    const option = document.createElement('option');
    option.value = label;
    option.textContent = `${label} (${formatOdds(odds)})`;
    option.dataset.odds = odds;
    selectElement.appendChild(option);
}

/**
 * Format odds for display
 */
function formatOdds(odds) {
    if (!odds) return 'N/A';
    return odds > 0 ? `+${odds}` : odds;
}

/**
 * Calculate potential profit from odds and units
 */
function calculateProfit(odds, units) {
    if (odds > 0) {
        // Underdog: +150 means win $150 on $100 bet
        return (odds / 100) * units;
    } else {
        // Favorite: -150 means bet $150 to win $100
        return (100 / Math.abs(odds)) * units;
    }
}

/**
 * Show profit calculator
 */
function showProfitCalculator() {
    const oddsInput = document.getElementById('odds');
    const unitsInput = document.getElementById('units');

    if (!oddsInput || !unitsInput) return;

    const odds = parseFloat(oddsInput.value);
    const units = parseFloat(unitsInput.value);

    if (!isNaN(odds) && !isNaN(units)) {
        const profit = calculateProfit(odds, units);
        const risk = units;
        const toWin = profit;

        // Create or update profit display
        let profitDisplay = document.getElementById('profitDisplay');
        if (!profitDisplay) {
            profitDisplay = document.createElement('div');
            profitDisplay.id = 'profitDisplay';
            profitDisplay.style.cssText = `
                margin-top: 10px;
                padding: 10px;
                background: rgba(0, 255, 255, 0.1);
                border: 1px solid var(--neon-cyan);
                border-radius: 8px;
                font-size: 0.9rem;
            `;
            unitsInput.parentElement.appendChild(profitDisplay);
        }

        profitDisplay.innerHTML = `
            <strong>Bet Calculator:</strong><br>
            Risk: ${risk.toFixed(2)} units | To Win: ${toWin.toFixed(2)} units | Total Return: ${(risk + toWin).toFixed(2)} units
        `;
    }
}

// Add event listeners for profit calculator
document.addEventListener('DOMContentLoaded', function() {
    const oddsInput = document.getElementById('odds');
    const unitsInput = document.getElementById('units');

    if (oddsInput) {
        oddsInput.addEventListener('input', showProfitCalculator);
    }
    if (unitsInput) {
        unitsInput.addEventListener('change', showProfitCalculator);
    }
});

// Export functions
if (typeof window !== 'undefined') {
    window.initPicksPage = initPicksPage;
    window.loadGamesForSport = loadGamesForSport;
    window.calculateProfit = calculateProfit;
}
