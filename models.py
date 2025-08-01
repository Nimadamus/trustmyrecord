# ==========================================================
# PASTE THIS ENTIRE BLOCK OF CODE INTO YOUR models.py FILE
# ==========================================================

from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

# It is a good practice to define the db extension object here
# and then initialize it in your main app.py file.
# This helps prevent circular import errors in larger applications.
db = SQLAlchemy()

class User(db.Model, UserMixin):
    """
    Represents a user in the database.

    This class includes all necessary components for:
    1. ORM (Object-Relational Mapping) via SQLAlchemy's `db.Model`.
    2. User session management via Flask-Login's `UserMixin`.
    """

    # Explicitly sets the table name in the database. This is a good practice.
    __tablename__ = 'users'

    # --- Table Columns ---

    # The Primary Key for the 'users' table, which uniquely identifies each user.
    # Adding 'primary_key=True' is the specific fix for the error you encountered.
    id = db.Column(db.Integer, primary_key=True)

    # User-specific fields with constraints.
    # `unique=True` ensures no two users can have the same username or email.
    # `nullable=False` ensures these fields must have a value.
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)

    # Column to store the hashed password.
    # Storing plain-text passwords is a major security vulnerability.
    password_hash = db.Column(db.String(128), nullable=False)


    # --- Methods ---

    def set_password(self, password):
        """
        Creates a secure hash of a password and stores it in the password_hash field.
        """
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        """
        Checks if a provided password matches the stored hash.
        Returns True if the password is correct, False otherwise.
        """
        return check_password_hash(self.password_hash, password)

    def __repr__(self):
        """
        Provides a developer-friendly string representation of a User object,
        which is helpful for debugging.
        """
        return f'<User {self.username}>'

# =================================================================
# You can define other models for your application below this line.
# For example, a model for tracking sports picks might look like:
#
# class Pick(db.Model):
#     id = db.Column(db.Integer, primary_key=True)
#     game_details = db.Column(db.String(200), nullable=False)
#     user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
#     user = db.relationship('User', backref=db.backref('picks', lazy=True))
#
# =================================================================
