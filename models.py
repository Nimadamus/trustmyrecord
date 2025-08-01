#
# models.py
#

from flask_sqlalchemy import SQLAlchemy

# Initialize the SQLAlchemy extension.
# It is common practice to initialize it without an app in this file,
# and then bind it to the Flask app in your main application file (e.g., app.py).
db = SQLAlchemy()

# ----------------------------------------------------------------------------#
# Models.
# ----------------------------------------------------------------------------#

class User(db.Model):
    """
    Represents a user in the database.
    """

    # Explicitly sets the table name in the database to 'users'.
    # This is a good practice to avoid ambiguity.
    __tablename__ = 'users'

    # --- Columns ---

    # This is the PRIMARY KEY. It's an integer that uniquely identifies each user.
    # The 'primary_key=True' argument is the critical fix for your error.
    id = db.Column(db.Integer, primary_key=True)

    # Username field. It must be unique for each user and cannot be empty.
    username = db.Column(db.String(80), unique=True, nullable=False)

    # Email field. It must also be unique and cannot be empty.
    email = db.Column(db.String(120), unique=True, nullable=False)

    # Password hash field.
    # It is crucial to store a HASH of the password, never the password itself.
    # The length is set to 128 to accommodate common hashing algorithms.
    password_hash = db.Column(db.String(128), nullable=False)


    # --- Methods ---

    def __repr__(self):
        """
        Provides a developer-friendly string representation of the User object,
        which is helpful for debugging.
        Example: <User 'johnny_appleseed'>
        """
        return f'<User \'{self.username}\'>'

# You can add other models here as your application grows.
# For example:
#
# class Post(db.Model):
#     __tablename__ = 'posts'
#     id = db.Column(db.Integer, primary_key=True)
#     content = db.Column(db.Text, nullable=False)
#     timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
#     # Foreign Key to link a post back to a user
#     user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
#
