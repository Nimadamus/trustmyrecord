# ==========================================================
# PASTE THIS ENTIRE BLOCK OF CODE INTO YOUR models.py FILE
# ==========================================================

from flask_sqlalchemy import SQLAlchemy

# Initialize the SQLAlchemy extension
db = SQLAlchemy()

class User(db.Model):
    """Represents a user in the database."""

    # Explicitly set the table name (good practice)
    __tablename__ = 'users'

    # THE FIX IS HERE: This 'id' column is the Primary Key.
    # The 'primary_key=True' argument tells SQLAlchemy to use
    # this column to uniquely identify each user.
    id = db.Column(db.Integer, primary_key=True)

    # Other common and useful fields for a user
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)

    def __repr__(self):
        """A developer-friendly string representation of the object."""
        return f'<User \'{self.username}\'>'

# You can add other models (like Post, Comment, etc.) below this line later.
