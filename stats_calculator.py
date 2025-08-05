from models import GradedPick, PendingPick, User
from datetime import datetime
from collections import defaultdict

def calculate_user_stats(user_id):
    user = User.query.get(user_id)
    if not user:
        return None

    all_pending_picks = PendingPick.query.filter_by(user_id=user.id).all()
    all_graded_picks = GradedPick.query.filter_by(user_id=user.id).all()
    all_picks = all_pending_picks + all_graded_picks
    graded_picks = all_graded_picks

    # Overall Stats
    total_picks = len(graded_picks)
    wins = sum(1 for pick in graded_picks if pick.result == 'win')
    losses = sum(1 for pick in graded_picks if pick.result == 'loss')
    pushes = sum(1 for pick in graded_picks if pick.result == 'push')

    win_rate = (wins / total_picks * 100) if total_picks > 0 else 0

    total_units = 0
    for pick in graded_picks:
        if pick.result == 'win':
            # Use graded_odds for accurate payout calculation across all bet types
            if pick.graded_odds > 0:
                total_units += pick.stake_units * (pick.graded_odds / 100)
            else:
                total_units += pick.stake_units * (100 / abs(pick.graded_odds))
        elif pick.result == 'loss':
            total_units -= pick.stake_units

    total_units_risked = sum(pick.stake_units for pick in graded_picks)
    roi = (total_units / total_units_risked * 100) if total_units_risked > 0 else 0

    # New Stats
    # Average Daily Picks (ADP)
    if all_picks:
        days_with_picks = set(pick.date_posted.date() for pick in all_picks)
        num_days_with_picks = len(days_with_picks)
        adp = len(all_picks) / num_days_with_picks if num_days_with_picks > 0 else 0
    else:
        adp = 0

    # Average Bet Size (ABS)
    abs_units = total_units_risked / total_picks if total_picks > 0 else 0

    # Average Odds of Picks (AOP)
    total_odds = sum(pick.odds for pick in graded_picks)
    aop = total_odds / total_picks if total_picks > 0 else 0

    # Stats per Sport
    stats_by_sport = defaultdict(lambda: {
        'total_picks': 0,
        'wins': 0,
        'losses': 0,
        'pushes': 0,
        'win_rate': 0,
        'total_units': 0,
        'roi': 0
    })

    for pick in graded_picks:
        sport_stats = stats_by_sport[pick.sport]
        sport_stats['total_picks'] += 1
        if pick.result == 'win':
            sport_stats['wins'] += 1
            # Use graded_odds for accurate payout calculation across all bet types
            if pick.graded_odds > 0:
                sport_stats['total_units'] += pick.stake_units * (pick.graded_odds / 100)
            else:
                sport_stats['total_units'] += pick.stake_units * (100 / abs(pick.graded_odds))
        elif pick.result == 'loss':
            sport_stats['losses'] += 1
            sport_stats['total_units'] -= pick.stake_units
        elif pick.result == 'push':
            sport_stats['pushes'] += 1

    for sport, sport_stats in stats_by_sport.items():
        sport_total_picks = sport_stats['total_picks']
        sport_wins = sport_stats['wins']
        sport_stats['win_rate'] = (sport_wins / sport_total_picks * 100) if sport_total_picks > 0 else 0
        
        sport_units_risked = sum(p.stake_units for p in graded_picks if p.sport == sport)
        sport_stats['roi'] = (sport_stats['total_units'] / sport_units_risked * 100) if sport_units_risked > 0 else 0


    return {
        'total_picks': total_picks,
        'wins': wins,
        'losses': losses,
        'pushes': pushes,
        'win_rate': round(win_rate, 2),
        'total_units': round(total_units, 2),
        'roi': round(roi, 2),
        'adp': round(adp, 2),
        'abs': round(abs_units, 2),
        'aop': round(aop, 2),
        'stats_by_sport': dict(stats_by_sport)
    }
