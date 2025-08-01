# ==========================================================
# PASTE THIS ENTIRE BLOCK OF CODE INTO YOUR models.py FILE
# ==========================================================

from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

# Initialize the database extension
db = SQLAlchemy()

class User(db.Model, UserMixin):
    """
    Represents a user in the database.
    This class includes all requirements for database mapping and user login management.
    """

    # Explicitly sets the table name in the database to 'users'
    __tablename__ = 'users'

    # --- Columns ---

    # The required Primary Key for the 'users' table.
    # This line fixes the "could not assemble any primary key" error.
    id = db.Column(db.Integer, primary_key=True)

    # User fields
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(128), nullable=False)


    # --- Methods ---

    def set_password(self, password_to_hash):
        """Hashes the provided password and stores it."""
        self.password = generate_password_hash(password_to_hash)

    def check_password(self, password_to_check):
        """Checks if a provided password matches the stored hash."""
        return check_password_hash(self.password, password_to_check)

    def __repr__(self):
        """Provides a developer-friendly string representation of a User object."""
        return f'<User \'{self.username}\'>'

# You can add other models for your application (e.g., Pick, Competition) below this line.
