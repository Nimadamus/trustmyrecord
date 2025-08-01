from datetime import datetime
from flask_login import UserMixin
# ===> FIX: Changed from '.extensions' to 'extensions' <===
from extensions import db

class User(UserMixin, db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(100), unique=True, nullable=False)
    username = db.Column(db.String(100), unique=True, nullable=False)
    password_hash = db.Column(db.String(256))
    bio = db.Column(db.Text, nullable=True)
    role = db.Column(db.String(20), nullable=False, default='user')
    favorite_team_id = db.Column(db.Integer, db.ForeignKey('teams.id'), nullable=True)
    picks = db.relationship('Pick', backref='picker', lazy='dynamic')

class Team(db.Model):
    __tablename__ = 'teams'
    id = db.Column(db.Integer, primary_key=True)
    league = db.Column(db.String(20), nullable=False)
    name = db.Column(db.String(100), nullable=False, unique=True)
    logo_url = db.Column(db.String(255), nullable=True)
    fans = db.relationship('User', backref='favorite_team', lazy='dynamic')

class Pick(db.Model):
    __tablename__ = 'picks'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    sport = db.Column(db.String(50), nullable=False)
    event_details = db.Column(db.String(255), nullable=False)
    pick_selection = db.Column(db.String(100), nullable=False)
    stake_units = db.Column(db.Float, nullable=False)
    odds = db.Column(db.Integer, nullable=False)
    submission_timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    event_timestamp = db.Column(db.DateTime, nullable=False)
    status = db.Column(db.String(20), nullable=False, default='Pending')
    result_notes = db.Column(db.String(255), nullable=True)
