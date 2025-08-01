# ==========================================================
# PASTE THIS ENTIRE BLOCK OF CODE INTO YOUR models.py FILE
# ==========================================================

from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime # Import datetime for date_posted

db = SQLAlchemy() # Initialize SQLAlchemy

class User(db.Model, UserMixin):
    __tablename__ = 'users' # Name of the database table for users

    id = db.Column(db.Integer, primary_key=True) # Unique identifier for each user

    username = db.Column(db.String(80), unique=True, nullable=False) # Username, must be unique
    email = db.Column(db.String(120), unique=True, nullable=False) # Email, must be unique
    password_hash = db.Column(db.String(128), nullable=False) # Stores the hashed password

    # --- RELATIONSHIPS ---
    # This creates a one-to-many relationship: a User can have many Posts.
    # 'Post' is the model name, 'backref='author'' creates an 'author' attribute on the Post model
    # to access the User who created it. 'lazy=True' means SQLAlchemy will load posts only when needed.
    posts = db.relationship('Post', backref='author', lazy=True)

    # You can add more user-specific fields here later (e.g., favorite_sport, bio, win_percentage, etc.)
    # favorite_sport = db.Column(db.String(50), nullable=True)
    # win_percentage = db.Column(db.Float, default=0.0)

    def set_password(self, password):
        """Hashes the password and stores it."""
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        """Checks if the provided password matches the stored hash."""
        return check_password_hash(self.password_hash, password)

    def __repr__(self):
        """String representation of the User object."""
        return f'<User {self.username}>'

# --- NEW MODEL: Post ---
class Post(db.Model):
    __tablename__ = 'posts' # Name of the database table for posts

    id = db.Column(db.Integer, primary_key=True) # Unique identifier for each post
    title = db.Column(db.String(100), nullable=False) # Title of the forum post
    content = db.Column(db.Text, nullable=False) # The main content of the post
    # Sets the date_posted when the post is created. db.func.current_timestamp() uses the database's timestamp function.
    date_posted = db.Column(db.DateTime, nullable=False, default=db.func.current_timestamp())

    # --- FOREIGN KEY ---
    # Links a Post to a User. 'users.id' refers to the 'id' column in the 'users' table.
    # This establishes the many-to-one relationship (many posts belong to one user).
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)

    def __repr__(self):
        """String representation of the Post object."""
        return f"Post('{self.title}', '{self.date_posted}')"
3. forms.py (Complete with All Forms)
This file now includes RegistrationForm, LoginForm, PickForm (your existing one), and the new PostForm.

# ==========================================================
# PASTE THIS ENTIRE BLOCK OF CODE INTO YOUR forms.py FILE
# ==========================================================

from flask_wtf import FlaskForm
# Import the necessary fields and validators
from wtforms import StringField, IntegerField, SubmitField, PasswordField, BooleanField, TextAreaField
from wtforms.validators import DataRequired, NumberRange, Length, Email, EqualTo, ValidationError
# Import the User model to add validation for existing usernames/emails
from models import User

# YOUR EXISTING FORM - PickForm for submitting sports picks
class PickForm(FlaskForm):
    """
    Form for users to submit a sports pick.
    """
    sport = StringField('Sport', validators=[DataRequired()], render_kw={"placeholder": "e.g., NFL, NBA, MLB"})
    event_details = StringField('Event Details', validators=[DataRequired()], render_kw={"placeholder": "e.g., Green Bay Packers vs. Chicago Bears"})
    pick_selection = StringField('Your Pick', validators=[DataRequired()], render_kw={"placeholder": "e.g., Green Bay Packers -7.5"})
    stake_units = IntegerField('Stake (Units)',
                               validators=[DataRequired(), NumberRange(min=1, max=10, message="Units must be between 1 and 10.")],
                               default=1)
    odds = IntegerField('American Odds',
                        validators=[DataRequired()],
                        default=-110,
                        render_kw={"placeholder": "e.g., -110, +220"})
    submit = SubmitField('Submit Pick to Ledger')


# YOUR EXISTING FORM - RegistrationForm
class RegistrationForm(FlaskForm):
    """
    Form for new users to create an account.
    """
    username = StringField('Username',
                           validators=[DataRequired(), Length(min=2, max=20)])
    email = StringField('Email',
                        validators=[DataRequired(), Email()])
    password = PasswordField('Password', validators=[DataRequired(), Length(min=6)])
    confirm_password = PasswordField('Confirm Password',
                                     validators=[DataRequired(), EqualTo('password')])
    submit = SubmitField('Sign Up')

    # Custom validators to check if username or email already exist in the database
    def validate_username(self, username):
        user = User.query.filter_by(username=username.data).first()
        if user:
            raise ValidationError('That username is taken. Please choose a different one.')

    def validate_email(self, email):
        user = User.query.filter_by(email=email.data).first()
        if user:
            raise ValidationError('That email is taken. Please choose a different one.')

# YOUR EXISTING FORM - LoginForm
class LoginForm(FlaskForm):
    """
    Form for existing users to log in.
    """
    email = StringField('Email',
                        validators=[DataRequired(), Email()])
    password = PasswordField('Password', validators=[DataRequired()])
    remember = BooleanField('Remember Me') # Added remember me checkbox
    submit = SubmitField('Login')

# --- NEW FORM: PostForm for the forum ---
class PostForm(FlaskForm):
    """
    Form for creating new forum posts.
    """
    title = StringField('Title', validators=[DataRequired()])
    content = TextAreaField('Content', validators=[DataRequired()])
    submit = SubmitField('Post')
