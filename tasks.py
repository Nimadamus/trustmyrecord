from models import PendingPick, GradedPick
from sports_api import get_odds
from extensions import db
from datetime import datetime

def grade_pending_picks():
    pending_picks = PendingPick.query.all()

    for pending_pick in pending_picks:
        # Fetch odds for the specific sport and market of the pick
        odds_data = get_odds(pending_pick.sport, market=pending_pick.market_key)

        if odds_data:
            for game in odds_data:
                # Match using the unique API event ID
                if game['id'] == pending_pick.api_event_id:
                    # Check if the game is completed and has scores
                    if game.get('completed') and game.get('scores'):
                        home_score = None
                        away_score = None
                        for score in game['scores']:
                            if score['name'] == game['home_team']:
                                home_score = int(score['score'])
                            elif score['name'] == game['away_team']:
                                away_score = int(score['score'])
                        
                        if home_score is not None and away_score is not None:
                            result = None
                            # Determine winner based on market key
                            if pending_pick.market_key == 'h2h':
                                if home_score > away_score:
                                    winner = game['home_team']
                                elif away_score > home_score:
                                    winner = game['away_team']
                                else:
                                    winner = 'push'

                                if winner == 'push':
                                    result = 'push'
                                elif pending_pick.pick_selection == winner:
                                    result = 'win'
                                else:
                                    result = 'loss'

                            elif pending_pick.market_key == 'spreads':
                                # Find the spread for the pick_selection (team or opponent)
                                spread_value = 0
                                for bookmaker in game['bookmakers']:
                                    for market in bookmaker['markets']:
                                        if market['key'] == 'spreads':
                                            for outcome in market['outcomes']:
                                                if outcome['name'] == pending_pick.pick_selection:
                                                    spread_value = outcome['point']
                                                    break
                                            if spread_value: break
                                    if spread_value: break

                                if pending_pick.pick_selection == game['home_team']:
                                    # Home team pick with spread
                                    if (home_score + spread_value) > away_score:
                                        result = 'win'
                                    elif (home_score + spread_value) < away_score:
                                        result = 'loss'
                                    else:
                                        result = 'push'
                                elif pending_pick.pick_selection == game['away_team']:
                                    # Away team pick with spread
                                    if (away_score + spread_value) > home_score:
                                        result = 'win'
                                    elif (away_score + spread_value) < home_score:
                                        result = 'loss'
                                    else:
                                        result = 'push'

                            elif pending_pick.market_key == 'totals':
                                # Find the total for the pick_selection (Over/Under)
                                total_value = 0
                                for bookmaker in game['bookmakers']:
                                    for market in bookmaker['markets']:
                                        if market['key'] == 'totals':
                                            for outcome in market['outcomes']:
                                                if outcome['name'] == pending_pick.pick_selection:
                                                    total_value = outcome['point']
                                                    break
                                            if total_value: break
                                    if total_value: break

                                combined_score = home_score + away_score
                                if pending_pick.pick_selection == 'Over':
                                    if combined_score > total_value:
                                        result = 'win'
                                    elif combined_score < total_value:
                                        result = 'loss'
                                    else:
                                        result = 'push'
                                elif pending_pick.pick_selection == 'Under':
                                    if combined_score < total_value:
                                        result = 'win'
                                    elif combined_score > total_value:
                                        result = 'loss'
                                    else:
                                        result = 'push'
                            
                            graded_odds = None
                            for bookmaker in game['bookmakers']:
                                for market in bookmaker['markets']:
                                    if market['key'] == pending_pick.market_key: 
                                        for outcome in market['outcomes']:
                                            if outcome['name'] == pending_pick.pick_selection:
                                                graded_odds = outcome['price']
                                                break
                                        if graded_odds: break
                                if graded_odds: break

                            graded_pick = GradedPick(
                                sport=pending_pick.sport,
                                event_details=pending_pick.event_details,
                                pick_selection=pending_pick.pick_selection,
                                stake_units=pending_pick.stake_units,
                                odds=pending_pick.odds,
                                date_posted=pending_pick.date_posted,
                                user_id=pending_pick.user_id,
                                bet_type=pending_pick.bet_type,
                                potential_win=pending_pick.potential_win,
                                api_event_id=pending_pick.api_event_id,
                                market_key=pending_pick.market_key,
                                result=result,
                                graded_timestamp=datetime.utcnow(),
                                graded_odds=graded_odds,
                                final_score=f'{game["home_team"]} {home_score} - {game["away_team"]} {away_score}'
                            )
                            db.session.add(graded_pick)
                            db.session.delete(pending_pick)
                            db.session.commit()
                            print(f"Graded pick {pending_pick.id}: {result}")
                    break # Break from inner loop once game is found
