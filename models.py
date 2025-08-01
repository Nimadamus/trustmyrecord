from app import db # Import the 'db' object FROM our main app file.
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
    
    favorite_team_id = db.Column(db.Integer, db.ForeignKey('team.id'), nullable=True)
    
    # Relationships
    favorite_team = db.relationship('Team', backref='fans', lazy='select')
    picks = db.relationship('Pick', backref='picker', lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

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
    
    sport = db.Column(db.String(50), nullable=False)
    event_details = db.Column(db.String(255), nullable=False)
    pick_selection = db.Column(db.String(100), nullable=False)
    stake_units = db.Column(db.Float, nullable=False)
    odds = db.Column(db.Integer, nullable=False)
    
    submission_timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    event_timestamp = db.Column(db.DateTime, nullable=False)
    
    status = db.Column(db.String(20), nullable=False, default='Pending')
    result_notes = db.Column(db.String(255), nullable=True)

    def __repr__(self):
        return f'<Pick {self.id} by User {self.user_id}: {self.pick_selection}>'
