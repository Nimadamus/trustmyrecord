# In models.py

from extensions import db
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

class User(db.Model, UserMixin):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    email_private = db.Column(db.Boolean, default=False)
    is_admin = db.Column(db.Boolean, default=False)
    favorite_team = db.Column(db.String(50), nullable=True)
    avatar_url = db.Column(db.String(200), nullable=True)
    date_joined = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    pending_picks = db.relationship('PendingPick', backref='author', lazy=True)
    graded_picks = db.relationship('GradedPick', backref='author', lazy=True)
    posts = db.relationship('Post', backref='author', lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class PendingPick(db.Model):
    __tablename__ = 'pending_picks'
    id = db.Column(db.Integer, primary_key=True)
    sport = db.Column(db.String(50), nullable=False)
    event_details = db.Column(db.String(200), nullable=False)
    pick_selection = db.Column(db.String(100), nullable=False)
    stake_units = db.Column(db.Float, nullable=False)
    odds = db.Column(db.Integer, nullable=False)
    date_posted = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    bet_type = db.Column(db.String(20), default='pre-game') # pre-game, live
    potential_win = db.Column(db.Float, nullable=True)
    api_event_id = db.Column(db.String(100), nullable=True) # Unique ID from sports API for matching results
    market_key = db.Column(db.String(50), nullable=True) # e.g., 'h2h', 'spreads', 'totals'

class GradedPick(db.Model):
    __tablename__ = 'graded_picks'
    id = db.Column(db.Integer, primary_key=True)
    sport = db.Column(db.String(50), nullable=False)
    event_details = db.Column(db.String(200), nullable=False)
    pick_selection = db.Column(db.String(100), nullable=False)
    stake_units = db.Column(db.Float, nullable=False)
    odds = db.Column(db.Integer, nullable=False)
    date_posted = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    result = db.Column(db.String(20), nullable=True) # win, loss, push
    graded_timestamp = db.Column(db.DateTime, nullable=True)
    graded_odds = db.Column(db.Integer, nullable=True)
    final_score = db.Column(db.String(50), nullable=True)
    bet_type = db.Column(db.String(20), default='pre-game') # pre-game, live
    potential_win = db.Column(db.Float, nullable=True)
    api_event_id = db.Column(db.String(100), nullable=True) # Unique ID from sports API for matching results
    market_key = db.Column(db.String(50), nullable=True) # e.g., 'h2h', 'spreads', 'totals'

class GameMatch(db.Model):
    __tablename__ = 'game_matches'
    id = db.Column(db.Integer, primary_key=True)
    game_title = db.Column(db.String(100), nullable=False) # e.g., 'Madden 24', 'NBA2K24'
    player1_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    player2_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    winner_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True) # Null until game is reported
    status = db.Column(db.String(20), default='pending') # pending, completed, disputed
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    player1 = db.relationship('User', foreign_keys=[player1_id], backref='initiated_matches', lazy=True)
    player2 = db.relationship('User', foreign_keys=[player2_id], backref='challenged_matches', lazy=True)

class FriendRequest(db.Model):
    __tablename__ = 'friend_requests'
    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    receiver_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    status = db.Column(db.String(20), default='pending') # pending, accepted, rejected
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    sender = db.relationship('User', foreign_keys=[sender_id], backref='sent_friend_requests', lazy=True)
    receiver = db.relationship('User', foreign_keys=[receiver_id], backref='received_friend_requests', lazy=True)

class Message(db.Model):
    __tablename__ = 'messages'
    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    receiver_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    body = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    is_read = db.Column(db.Boolean, default=False)

    sender = db.relationship('User', foreign_keys=[sender_id], backref='sent_messages', lazy=True)
    receiver = db.relationship('User', foreign_keys=[receiver_id], backref='received_messages', lazy=True)

class Post(db.Model):
    __tablename__ = 'posts'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    body = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    category = db.Column(db.String(50), nullable=False)
    replies = db.relationship('Reply', backref='post', lazy=True, cascade="all, delete-orphan")

class Reply(db.Model):
    __tablename__ = 'replies'
    id = db.Column(db.Integer, primary_key=True)
    body = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    post_id = db.Column(db.Integer, db.ForeignKey('posts.id'), nullable=False)

class ChatMessage(db.Model):
    __tablename__ = 'chat_messages'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    message = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    user = db.relationship('User', backref='chat_messages', lazy=True)

class Event(db.Model):
    __tablename__ = 'events'
    id = db.Column(db.String(100), primary_key=True) # Using string ID from API
    sport = db.Column(db.String(50), nullable=False)
    league = db.Column(db.String(100), nullable=False)
    start_time = db.Column(db.DateTime, nullable=False)
    home_team = db.Column(db.String(100), nullable=False)
    away_team = db.Column(db.String(100), nullable=False)

    odds = db.relationship('Odds', backref='event', lazy=True, cascade="all, delete-orphan")
    picks = db.relationship('Pick', backref='event', lazy=True)

class Odds(db.Model):
    __tablename__ = 'odds'
    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.String(100), db.ForeignKey('events.id'), nullable=False)
    bookmaker = db.Column(db.String(100), nullable=False)
    market = db.Column(db.String(50), nullable=False) # ML/SP/TOT
    side = db.Column(db.String(50), nullable=False) # HOME/AWAY/OVER/UNDER
    odds_american = db.Column(db.Integer, nullable=False)
    line = db.Column(db.Float, nullable=True) # For spread/total

class Pick(db.Model):
    __tablename__ = 'picks'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    event_id = db.Column(db.String(100), db.ForeignKey('events.id'), nullable=False)
    sport = db.Column(db.String(50), nullable=False)
    market = db.Column(db.String(50), nullable=False) # ML/SP/TOT
    selection = db.Column(db.String(100), nullable=False) # e.g., "Home Team", "Over 200.5"
    odds_american = db.Column(db.Integer, nullable=False)
    units_win = db.Column(db.Numeric(6,2), nullable=False)
    units_risk = db.Column(db.Numeric(6,2), nullable=False)
    status = db.Column(db.String(20), default='pending') # pending/win/loss/push
    placed_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    graded_at = db.Column(db.DateTime, nullable=True)

    user = db.relationship('User', backref='user_picks', lazy=True)