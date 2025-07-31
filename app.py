# app.py

from flask import Flask, render_template, request, redirect, url_for, flash, session
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
import os

# 1. Initialization
app = Flask(__name__)

# --- Configuration ---
# Set a secret key for session management. In production, use a long, random string.
app.config['SECRET_KEY'] = 'a_very_secret_key_that_should_be_changed'
# Define the database file path. We'll use SQLite, a simple file-based database.
db_path = os.path.join(os.path.dirname(__file__), 'site.db')
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize extensions
db = SQLAlchemy(app)
bcrypt = Bcrypt(app)


# 2. Database Model
# This class defines the 'users' table in our database.
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    # Store hashed passwords, not plain text!
    password_hash = db.Column(db.String(60), nullable=False)

    def __repr__(self):
        return f'<User {self.username}>'


# 3. Routes (The URLs our app will respond to)

@app.route("/")
def home():
    # For now, the home page will redirect to the leaderboard.
    return redirect(url_for('leaderboard'))

@app.route("/register", methods=['GET', 'POST'])
def register():
    # This function handles the logic for the registration page.
    if request.method == 'POST':
        # If the form is submitted (POST request)
        username = request.form.get('username')
        email = request.form.get('email')
        password = request.form.get('password')

        # Hash the password for security
        hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')

        # Create a new User object
        new_user = User(username=username, email=email, password_hash=hashed_password)

        # Add the new user to the database
        db.session.add(new_user)
        db.session.commit()

        flash('Your account has been created! You are now able to log in.', 'success')
        return redirect(url_for('login'))

    # If it's a GET request, just show the registration page.
    return render_template('register.html')

@app.route("/login", methods=['GET', 'POST'])
def login():
    # This function handles the logic for the login page.
    if request.method == 'POST':
        email = request.form.get('email')
        password = request.form.get('password')

        # Find the user by their email
        user = User.query.filter_by(email=email).first()

        # Check if the user exists and the password is correct
        if user and bcrypt.check_password_hash(user.password_hash, password):
            # Log the user in by storing their ID in the session
            session['user_id'] = user.id
            flash('You have been logged in!', 'success')
            return redirect(url_for('profile', username=user.username)) # Redirect to their profile
        else:
            flash('Login Unsuccessful. Please check email and password.', 'danger')

    return render_template('login.html')

# We'll add a temporary route for the profile to make the login redirect work
@app.route("/profile/<username>")
def profile(username):
    # In the future, this will fetch the user's real data.
    # For now, it just renders the static page.
    return render_template('profile.html')

# We'll add a route for the leaderboard to make the home redirect work
@app.route("/leaderboard")
def leaderboard():
    return render_template('leaderboard.html')

# This part ensures that the development server runs when you execute the script.
if __name__ == '__main__':
    with app.app_context():
        # This will create the database file and the 'user' table if they don't exist.
        db.create_all()
    app.run(debug=True)
