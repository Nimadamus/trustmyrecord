from datetime import datetime, timedelta
import random

def generate_mock_odds(sport_name):
    games = []
    num_games = random.randint(3, 7) # Generate 3 to 7 games per sport

    for i in range(num_games):
        game_time = (datetime.now() + timedelta(hours=random.randint(1, 24))).strftime('%Y-%m-%d %H:%M')
        home_team = f'{sport_name.upper()} Team A {i+1}'
        away_team = f'{sport_name.upper()} Team B {i+1}'

        # Moneyline odds
        home_moneyline = random.choice([-110, -120, 100, 150, 200])
        away_moneyline = random.choice([-110, -120, 100, 150, 200])

        # Spread odds
        spread_value = random.choice([1.5, 2.5, 3.5, 4.5, 5.5])
        home_spread = f'-{spread_value}'
        away_spread = f'+{spread_value}'
        home_spread_odds = random.choice([-110, -105])
        away_spread_odds = random.choice([-110, -105])

        # Total odds
        total_value = random.choice([200.5, 210.5, 220.5, 45.5, 50.5])
        total_over = total_value
        total_under = total_value
        total_over_odds = random.choice([-110, -105])
        total_under_odds = random.choice([-110, -105])

        game = {
            'home_team': home_team,
            'away_team': away_team,
            'time': game_time,
            'home_moneyline': home_moneyline,
            'away_moneyline': away_moneyline,
            'home_spread': home_spread,
            'away_spread': away_spread,
            'home_spread_odds': home_spread_odds,
            'away_spread_odds': away_spread_odds,
            'total_over': total_over,
            'total_under': total_under,
            'total_over_odds': total_over_odds,
            'total_under_odds': total_under_odds,
        }
        games.append(game)

    return games