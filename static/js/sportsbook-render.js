/**
 * Sportsbook-Style Game Renderer
 * Professional betting interface inspired by DraftKings/FanDuel
 *
 * Created: January 2026
 */

window.SportsbookRenderer = {
    selectedPicks: [],
    games: [],

    /**
     * Render all games in sportsbook style
     */
    renderGames: function(games, container) {
        this.games = games;

        if (!container) {
            console.error('Container not found');
            return;
        }

        if (!games || games.length === 0) {
            container.innerHTML = this.renderEmptyState();
            return;
        }

        // Sort games by time
        games.sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time));

        // Group by date
        const gamesByDate = this.groupGamesByDate(games);

        let html = '';

        // Render market headers once at top
        html += this.renderMarketHeaders();

        // Render each date group
        for (const [date, dateGames] of Object.entries(gamesByDate)) {
            html += `<div class="date-group">
                <div class="date-header">${date}</div>`;

            dateGames.forEach((game, index) => {
                html += this.renderGameRow(game, index);
            });

            html += '</div>';
        }

        container.innerHTML = html;

        // Attach event listeners
        this.attachEventListeners(container);
    },

    /**
     * Group games by date
     */
    groupGamesByDate: function(games) {
        const groups = {};
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        games.forEach(game => {
            const gameDate = new Date(game.commence_time);
            let dateKey;

            if (this.isSameDay(gameDate, today)) {
                dateKey = 'Today';
            } else if (this.isSameDay(gameDate, tomorrow)) {
                dateKey = 'Tomorrow';
            } else {
                dateKey = gameDate.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                });
            }

            if (!groups[dateKey]) groups[dateKey] = [];
            groups[dateKey].push(game);
        });

        return groups;
    },

    isSameDay: function(date1, date2) {
        return date1.toDateString() === date2.toDateString();
    },

    /**
     * Render market column headers
     */
    renderMarketHeaders: function() {
        return `
        <div class="market-headers">
            <div class="market-label">Matchup</div>
            <div class="market-label">Spread</div>
            <div class="market-label">Moneyline</div>
            <div class="market-label">Total</div>
        </div>`;
    },

    /**
     * Render a single game row
     */
    renderGameRow: function(game, gameIndex) {
        const bookmaker = game.bookmakers && game.bookmakers[0];
        const markets = bookmaker ? bookmaker.markets : [];

        // Extract odds
        let homeSpread = { point: '--', price: '' };
        let awaySpread = { point: '--', price: '' };
        let homeML = '--';
        let awayML = '--';
        let totalLine = '--';
        let overPrice = '-110';
        let underPrice = '-110';

        markets.forEach(m => {
            if (m.key === 'spreads') {
                m.outcomes.forEach(o => {
                    if (o.name === game.home_team) {
                        homeSpread = { point: o.point, price: o.price };
                    } else {
                        awaySpread = { point: o.point, price: o.price };
                    }
                });
            }
            if (m.key === 'h2h') {
                m.outcomes.forEach(o => {
                    if (o.name === game.home_team) {
                        homeML = o.price;
                    } else {
                        awayML = o.price;
                    }
                });
            }
            if (m.key === 'totals') {
                m.outcomes.forEach(o => {
                    if (o.name === 'Over') {
                        totalLine = o.point;
                        overPrice = o.price;
                    } else {
                        underPrice = o.price;
                    }
                });
            }
        });

        const gameTime = new Date(game.commence_time).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit'
        });

        return `
        <div class="game-row" data-game-id="${game.id || gameIndex}">
            <div class="game-time-header">
                <span class="game-time">${gameTime}</span>
            </div>

            <!-- Away Team Row -->
            <div class="team-row">
                <div class="team-info">
                    <div class="team-logo">${this.getTeamEmoji(game.sport_key)}</div>
                    <div class="team-details">
                        <div class="team-name">${game.away_team}</div>
                    </div>
                </div>

                <button class="odds-btn" data-game="${gameIndex}" data-type="spread" data-team="${game.away_team}" data-line="${awaySpread.point}" data-price="${awaySpread.price || -110}" data-away="${game.away_team}" data-home="${game.home_team}">
                    <span class="odds-line">${this.formatSpread(awaySpread.point)}</span>
                    <span class="odds-value ${awaySpread.price >= 0 ? 'positive' : 'negative'}">${this.formatOdds(awaySpread.price || -110)}</span>
                </button>

                <button class="odds-btn" data-game="${gameIndex}" data-type="ml" data-team="${game.away_team}" data-line="ML" data-price="${awayML}" data-away="${game.away_team}" data-home="${game.home_team}">
                    <span class="odds-line">ML</span>
                    <span class="odds-value ${awayML >= 0 ? 'positive' : 'negative'}">${this.formatOdds(awayML)}</span>
                </button>

                <button class="odds-btn totals-btn" data-game="${gameIndex}" data-type="over" data-team="Over" data-line="${totalLine}" data-price="${overPrice}" data-away="${game.away_team}" data-home="${game.home_team}">
                    <span class="totals-type">Over</span>
                    <span class="totals-line">${totalLine}</span>
                    <span class="odds-value ${overPrice >= 0 ? 'positive' : 'negative'}">${this.formatOdds(overPrice)}</span>
                </button>
            </div>

            <!-- Home Team Row -->
            <div class="team-row">
                <div class="team-info">
                    <div class="team-logo">${this.getTeamEmoji(game.sport_key)}</div>
                    <div class="team-details">
                        <div class="team-name">${game.home_team}</div>
                    </div>
                </div>

                <button class="odds-btn" data-game="${gameIndex}" data-type="spread" data-team="${game.home_team}" data-line="${homeSpread.point}" data-price="${homeSpread.price || -110}" data-away="${game.away_team}" data-home="${game.home_team}">
                    <span class="odds-line">${this.formatSpread(homeSpread.point)}</span>
                    <span class="odds-value ${homeSpread.price >= 0 ? 'positive' : 'negative'}">${this.formatOdds(homeSpread.price || -110)}</span>
                </button>

                <button class="odds-btn" data-game="${gameIndex}" data-type="ml" data-team="${game.home_team}" data-line="ML" data-price="${homeML}" data-away="${game.away_team}" data-home="${game.home_team}">
                    <span class="odds-line">ML</span>
                    <span class="odds-value ${homeML >= 0 ? 'positive' : 'negative'}">${this.formatOdds(homeML)}</span>
                </button>

                <button class="odds-btn totals-btn" data-game="${gameIndex}" data-type="under" data-team="Under" data-line="${totalLine}" data-price="${underPrice}" data-away="${game.away_team}" data-home="${game.home_team}">
                    <span class="totals-type">Under</span>
                    <span class="totals-line">${totalLine}</span>
                    <span class="odds-value ${underPrice >= 0 ? 'positive' : 'negative'}">${this.formatOdds(underPrice)}</span>
                </button>
            </div>
        </div>`;
    },

    /**
     * Format spread for display
     */
    formatSpread: function(point) {
        if (point === '--' || point === undefined || point === null) return '--';
        const num = parseFloat(point);
        return num > 0 ? `+${num}` : num.toString();
    },

    /**
     * Format odds for display
     */
    formatOdds: function(odds) {
        if (odds === '--' || odds === undefined || odds === null || odds === '') return '--';
        const num = parseInt(odds);
        if (isNaN(num)) return '--';
        return num > 0 ? `+${num}` : num.toString();
    },

    /**
     * Get sport emoji
     */
    getTeamEmoji: function(sportKey) {
        const map = {
            'basketball_nba': '🏀',
            'basketball_ncaab': '🏀',
            'americanfootball_nfl': '🏈',
            'americanfootball_ncaaf': '🏈',
            'icehockey_nhl': '🏒',
            'baseball_mlb': '⚾',
            'soccer_epl': '⚽',
            'mma_mixed_martial_arts': '🥊'
        };
        return map[sportKey] || '🎯';
    },

    /**
     * Render empty state
     */
    renderEmptyState: function() {
        return `
        <div class="no-games">
            <div class="no-games-icon">📅</div>
            <h3>No Games Available</h3>
            <p>Check back later for upcoming matchups</p>
        </div>`;
    },

    /**
     * Render loading state
     */
    renderLoading: function() {
        return `
        <div class="games-loading">
            <div class="loading-spinner"></div>
            <p>Loading games...</p>
        </div>`;
    },

    /**
     * Attach click event listeners to odds buttons
     */
    attachEventListeners: function(container) {
        const buttons = container.querySelectorAll('.odds-btn');

        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const button = e.currentTarget;
                const gameIndex = button.dataset.game;
                const betType = button.dataset.type;
                const team = button.dataset.team;
                const line = button.dataset.line;
                const price = button.dataset.price;
                const awayTeam = button.dataset.away;
                const homeTeam = button.dataset.home;

                this.handleOddsClick(button, {
                    gameIndex,
                    betType,
                    team,
                    line,
                    price,
                    awayTeam,
                    homeTeam
                });
            });
        });
    },

    /**
     * Handle odds button click
     */
    handleOddsClick: function(button, data) {
        // Toggle selection
        const wasSelected = button.classList.contains('selected');

        if (wasSelected) {
            button.classList.remove('selected');
            this.removeFromBetSlip(data);
        } else {
            button.classList.add('selected');
            button.classList.add('just-selected');
            setTimeout(() => button.classList.remove('just-selected'), 300);
            this.addToBetSlip(data);
        }

        // Also call the existing selectGameBet function if it exists
        if (window.selectGameBet && !wasSelected) {
            window.selectGameBet(
                parseInt(data.gameIndex),
                data.betType,
                data.team,
                data.line,
                data.price,
                data.awayTeam,
                data.homeTeam
            );
        }
    },

    /**
     * Add pick to bet slip
     */
    addToBetSlip: function(data) {
        this.selectedPicks.push(data);
        this.updateBetSlip();
    },

    /**
     * Remove pick from bet slip
     */
    removeFromBetSlip: function(data) {
        this.selectedPicks = this.selectedPicks.filter(p =>
            !(p.gameIndex === data.gameIndex && p.betType === data.betType && p.team === data.team)
        );
        this.updateBetSlip();
    },

    /**
     * Update bet slip display
     */
    updateBetSlip: function() {
        const slip = document.getElementById('betSlip');
        if (!slip) return;

        if (this.selectedPicks.length === 0) {
            slip.style.display = 'none';
            return;
        }

        slip.style.display = 'block';

        const countEl = slip.querySelector('.bet-slip-count');
        if (countEl) {
            countEl.textContent = this.selectedPicks.length;
        }

        const bodyEl = slip.querySelector('.bet-slip-body');
        if (bodyEl) {
            bodyEl.innerHTML = this.selectedPicks.map((pick, index) => `
                <div class="bet-slip-pick">
                    <div class="bet-slip-pick-header">
                        <div class="bet-slip-pick-info">
                            <h4>${pick.team} ${pick.line}</h4>
                            <p>${pick.awayTeam} @ ${pick.homeTeam}</p>
                        </div>
                        <button class="bet-slip-remove" data-index="${index}">&times;</button>
                    </div>
                    <div class="bet-slip-odds">
                        <span>Odds</span>
                        <span class="bet-slip-odds-value">${this.formatOdds(pick.price)}</span>
                    </div>
                </div>
            `).join('');

            // Attach remove button listeners
            bodyEl.querySelectorAll('.bet-slip-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const index = parseInt(e.target.dataset.index);
                    const removedPick = this.selectedPicks[index];

                    // Deselect the button
                    const buttons = document.querySelectorAll('.odds-btn.selected');
                    buttons.forEach(b => {
                        if (b.dataset.game === removedPick.gameIndex &&
                            b.dataset.type === removedPick.betType &&
                            b.dataset.team === removedPick.team) {
                            b.classList.remove('selected');
                        }
                    });

                    this.selectedPicks.splice(index, 1);
                    this.updateBetSlip();
                });
            });
        }
    }
};

// Date header styling
const style = document.createElement('style');
style.textContent = `
    .date-group {
        margin-bottom: 8px;
    }
    .date-header {
        padding: 10px 16px;
        background: var(--sb-bg-dark, #121418);
        color: var(--sb-text-muted, #6c7380);
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 1px;
        border-bottom: 1px solid var(--sb-border, #2d3340);
    }
`;
document.head.appendChild(style);

console.log('[SportsbookRenderer] Loaded successfully');
