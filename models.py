from app import db
from flask_login import UserMixin
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

# ==========================================================
#  Model #1: User
# ==========================================================
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(100), unique=True, nullable=False)
    username = db.Column(db.String(100), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    bio = db.Column(db.Text, nullable=True)
    role = db.Column(db.String(20), nullable=False, default='user')
    join_date = db.Column(db.DateTime, nullable=False, default=datetime.utcnow) # ADDED
    
    favorite_team_id = db.Column(db.Integer, db.ForeignKey('team.id'), nullable=True)
    
    # Relationships
    favorite_team = db.relationship('Team', backref='fans', lazy='select')
    picks = db.relationship('Pick', backref='picker', lazy='select')
    # NEW: One-to-one relationship to UserStats
    stats = db.relationship('UserStats', backref='user', uselist=False, cascade="all, delete-orphan")

    def __repr__(self):
        return f'<User {self.username}>'

# ==========================================================
#  ===> NEW: USER STATS MODEL (THE FLAIR ENGINE) <===
# ==========================================================
class UserStats(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, unique=True)
    
    # Core Handicapping Stats
    wins = db.Column(db.Integer, default=0)
    losses = db.Column(db.Integer, default=0)
    pushes = db.Column(db.Integer, default=0)
    units_net = db.Column(db.Float, default=0.0)
    
    # Gamification & Community Stats
    trophy_count = db.Column(db.Integer, default=0)
    contest_wins = db.Column(db.Integer, default=0)
    poll_points = db.Column(db.Integer, default=0)
    trivia_points = db.Column(db.Integer, default=0)

    def __repr__(self):
        return f'<UserStats for UserID {self.user_id}>'

# ==========================================================
#  Model #2: Team & Model #3: Pick
# ==========================================================
# (The Team and Pick models remain unchanged below this)
class Team(db.Model):
    #...
    pass
class Pick(db.Model):
    #...
    pass
