# ==========================================================
#  Imports
# ==========================================================
from datetime import datetime
from flask_login import UserMixin
# This import is now correct for your project structure
from .extensions import db

# ==========================================================
#  Model #1: User
# ==========================================================
class User(UserMixin, db.Model):
    __tablename__ = 'users' # Explicit table name is good practice
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(100), unique=True, nullable=False)
    username = db.Column(db.String(100), unique=True, nullable=False)
    password_hash = db.Column(db.String(256))
    bio = db.Column(db.Text, nullable=True)
    
    # ===> UPGRADE: Add the new role column <===
    role = db.Column(db.String(20), nullable=False, default='user')
    
    # Relationship to Favorite Team
    favorite_team_id = db.Column(db.Integer, db.ForeignKey('teams.id'), nullable=True)
    
    # Relationship to Picks
    picks = db.relationship('Pick', backref='picker', lazy='dynamic')

    def __repr__(self):
        return f'<User {self.username}>'

# ==========================================================
#  Model #2: Team
# ==========================================================
class Team(db.Model):
    __tablename__ = 'teams'
    id = db.Column(db.Integer, primary_key=True)
    league = db.Column(db.String(20), nullable=False)
    name = db.Column(db.String(100), nullable=False, unique=True)
    logo_url = db.Column(db.String(255), nullable=True)
    
    # Relationship back to Users
    fans = db.relationship('User', backref='favorite_team', lazy='dynamic')

    def __repr__(self):
        return f'<Team {self.name}>'

# ==========================================================
#  Model #3: Pick (The Immutable Record)
# =================================m=========
class Pick(db.Model):
    __tablename__ = 'picks'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    
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

    def __repr__(self):
        return f'<Pick {self.id} by User {self.user_id}: {self.pick_selection}>'
