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

        // Clear existing options except the first
        sportSelect.innerHTML = '<option value="">Select Sport</option>';

        // Add sports
        sports.forEach(sport => {
            if (sport.active) {
                const option = document.createElement('option');
                option.value = sport.key;
                option.textContent = sport.title;
                sportSelect.appendChild(option);
            }
        });

        console.log(`Loaded ${sports.length} sports`);
    } catch (error) {
        console.error('Error loading sports:', error);
    }
}

/**
 * Load games for selected sport
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
        const games = await api.getUpcomingGames(sportKey);
        availableGames = games;

        if (matchupSelect) {
            matchupSelect.innerHTML = '<option value="">Select Matchup</option>';

            if (games.length === 0) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'No upcoming games available';
                matchupSelect.appendChild(option);
            } else {
                games.forEach((game, index) => {
                    const option = document.createElement('option');
                    option.value = index;

                    const date = new Date(game.commence_time);
                    const dateStr = date.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                    });

                    option.textContent = `${game.away_team} @ ${game.home_team} - ${dateStr}`;
                    matchupSelect.appendChild(option);
                });
            }

            matchupSelect.disabled = false;
        }

        console.log(`Loaded ${games.length} games`);
    } catch (error) {
        console.error('Error loading games:', error);
        if (matchupSelect) {
            matchupSelect.innerHTML = '<option value="">Error loading games</option>';
        }
    }
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
