from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin # <--- IMPORT THIS
from werkzeug.security import generate_password_hash, check_password_hash # <--- AND THESE

db = SQLAlchemy()

# Add UserMixin to the class definition
class User(db.Model, UserMixin): # <--- ADD UserMixin HERE
    """Represents a user in the database."""

    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    # We rename this to be clearer
    password = db.Column(db.String(128), nullable=False) # <--- RENAMED FROM password_hash

    # --- New Methods for setting and checking passwords ---
    def set_password(self, password):
        self.password = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password, password)

    def __repr__(self):
        return f'<User \'{self.username}\'>'
