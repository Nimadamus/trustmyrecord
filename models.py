# Add this new class to define the teams table
class Team(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    league = db.Column(db.String(20), nullable=False)
    name = db.Column(db.String(100), nullable=False, unique=True)
    logo_url = db.Column(db.String(255), nullable=True)

# Add these two new lines to your existing User model
class User(UserMixin, db.Model):
    # ... all your existing columns like id, username, email, password_hash ...

    # ADD THIS LINE:
    favorite_team_id = db.Column(db.Integer, db.ForeignKey('team.id'), nullable=True)

    # AND ADD THIS LINE:
    favorite_team = db.relationship('Team', backref='fans', lazy='select')

# --- The Core Pick Information ---
sport = db.Column(db.String(50), nullable=False)        # e.g., 'NFL', 'NBA', 'MLB'
event_details = db.Column(db.String(255), nullable=False) # e.g., 'Green Bay Packers vs. Chicago Bears'
pick_selection = db.Column(db.String(100), nullable=False) # e.g., 'Green Bay Packers -7.5'
stake_units = db.Column(db.Float, nullable=False)         # The amount "wagered" in units
odds = db.Column(db.Integer, nullable=False)              # American odds, e.g., -110, +220

# --- Data Integrity & Record Keeping ---
submission_timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
event_timestamp = db.Column(db.DateTime, nullable=False) # The date and time of the actual game

# --- Pick Grading & Status ---
# Status can be: 'Pending', 'Win', 'Loss', 'Push'
status = db.Column(db.String(20), nullable=False, default='Pending')
result_notes = db.Column(db.String(255), nullable=True) # For admin notes on grading, e.g., "Graded based on official box score."

# --- Relationships ---
# This helps us easily access the user who made the pick, e.g., my_pick.picker.username
picker = db.relationship('User', backref='picks', lazy=True)

def __repr__(self):
    return f'<Pick {self.id} by User {self.user_id}: {self.pick_selection}>'
