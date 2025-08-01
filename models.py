# ==========================================================
#  Imports
# ==========================================================
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from datetime import datetime

# This line should be in your app.py, not here. 
# This file assumes a 'db' object is created elsewhere and is available.
# from __main__ import db 
# Note: The above line is a simplification for conceptual understanding.
# A proper Flask application structure using Blueprints or an App Factory
# would handle the 'db' import more elegantly. For our current setup,
# the way it's structured in app.py is correct.

# ==========================================================
#  Model #1: User
# ==========================================================
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(100), unique=True, nullable=False)
    username = db.Column(db.String(100), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    bio = db.Column(db.Text, nullable=True)
    
    # ===> UPGRADE: Add the new role column <===
    # We will give it a default value of 'user' for all new registrations.
    role = db.Column(db.String(20), nullable=False, default='user')
    
    # Relationship to Favorite Team
    favorite_team_id = db.Column(db.Integer, db.ForeignKey('team.id'), nullable=True)
    favorite_team = db.relationship('Team', backref='fans', lazy='select')

    def __repr__(self):
        return f'<User {self.username}>'

# ==========================================================
#  Model #2: Team
# ==========================================================
class Team(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    league = db.Column(db.String(20), nullable=False)
    name = db.Column(db.String(100), nullable=False, unique=True)
    logo_url = db.Column(db.String(255), nullable=True)

    def __repr__(self):
        return f'<Team {self.name}>'

# ==========================================================
#  Model #3: Pick (The Immutable Record)
# ==========================================================
class Pick(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    
    # Core Pick Information
    sport = db.Column(db.String(50), nullable=False)
    event_details = db.Column(db.String(255), nullable=False)
    pick_selection = db.Column(db.String(100), nullable=False)
    stake_units = db.Column(db.Float, nullable=False)
    odds = db.Column(db.Integer, nullable=False)
    
    # Data Integrity & Record Keeping
    submission_timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    event_timestamp = db.Column(db.DateTime, nullable=False)
    
    # Pick Grading & Status
    status = db.Column(db.String(20), nullable=False, default='Pending')
    result_notes = db.Column(db.String(255), nullable=True)

    # Relationships
    picker = db.relationship('User', backref='picks', lazy=True)

    def __repr__(self):
        return f'<Pick {self.id} by User {self.user_id}: {self.pick_selection}>'
