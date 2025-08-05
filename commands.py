import click
from flask.cli import with_appcontext
from datetime import datetime
import random

from extensions import db
from models import PendingPick, GradedPick

@click.group()
def grade():
    """Grade picks commands."""
    pass

@grade.command('all')
@with_appcontext
def grade_all_picks():
    """Grades all pending picks with random results."""
    pending_picks = PendingPick.query.all()
    if not pending_picks:
        click.echo("No pending picks to grade.")
        return

    graded_count = 0
    for pending_pick in pending_picks:
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
            result=random.choice(['win', 'loss', 'push']),
            graded_timestamp=datetime.utcnow(),
            graded_odds=pending_pick.odds,  # For simplicity
            final_score=f"{random.randint(0, 100)}-{random.randint(0, 100)}"
        )
        db.session.add(graded_pick)
        db.session.delete(pending_pick)
        graded_count += 1

    db.session.commit()
    click.echo(f"Successfully graded {graded_count} picks.")
