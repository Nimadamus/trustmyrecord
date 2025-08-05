from sports_api import get_odds
import json

# Test with a common sport key and DraftKings bookmaker
sport_key = 'americanfootball_nfl' # Or 'basketball_nba', 'icehockey_nhl', etc.
bookmaker_key = 'draftkings'

print(f"Fetching odds for {sport_key} from {bookmaker_key}...")
odds_data = get_odds(sport_key, bookmakers=bookmaker_key)

if odds_data:
    print("Successfully fetched odds data:")
    # Print a pretty-printed version of the first game to inspect its structure
    if odds_data:
        print(json.dumps(odds_data[0], indent=2))
    else:
        print("No games found for this sport and bookmaker.")
else:
    print("Failed to fetch odds data. Check API key, internet connection, or sport_key.")
