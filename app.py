#
# app.py - Main application file with all backend logic
#

from flask import Flask, render_template, redirect, url_for, flash
from flask_migrate import Migrate
from flask_login import LoginManager, login_user, logout_user, current_user, login_required

# Import all our models and forms
from models import db, User
from forms import RegistrationForm, LoginForm, PickForm # <-- Added PickForm

# 1. Create and Configure the App
app = Flask(__name__)
# This secret key is required for form security (CSRF protection)
app.config['SECRET_KEY'] = 'a-very-secret-key-that-you-should-change'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///site.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# 2. Initialize Extensions
db.init_app(app)
migrate = Migrate(app, db)
login_manager = LoginManager(app)
login_manager.login_view = 'login'  # Tells Flask-Login which page to redirect to for login
login_manager.login_message_category = 'info' # Makes the "Please log in" message look nicer

@login_manager.user_loader
def load_user(user_id):
    """Tells Flask-Login how to find a user given an ID."""
    return User.query.get(int(user_id))


# --- AUTHENTICATION ROUTES ---

@app.route('/register', methods=['GET', 'POST'])
def register():
    # If user is already logged in, they can't see the register page
    if current_user.is_authenticated:
        return redirect(url_for('profile'))
    form = RegistrationForm()
    if form.validate_on_submit():
        # Create a new user instance
        user = User(username=form.username.data, email=form.email.data)
        # Use our new method to set the hashed password
        user.set_password(form.password.data)
        # Add to database
        db.session.add(user)
        db.session.commit()
        flash('Your account has been created! You can now log in.', 'success')
        return redirect(url_for('login'))
    return render_template('register.html', title='Register', form=form)

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('profile'))
    form = LoginForm()
    if form.validate_on_submit():
        # Find the user by their email
        user = User.query.filter_by(email=form.email.data).first()
        # Check if the user exists and the password is correct
        if user and user.check_password(form.password.data):
            login_user(user) # Log the user in
            flash('Login successful!', 'success')
            return redirect(url_for('profile'))
        else:
            flash('Login Unsuccessful. Please check email and password.', 'danger')
    return render_template('login.html', title='Login', form=form)

@app.route('/logout')
def logout():
    logout_user()
    return redirect(url_for('home'))


# --- CONTENT ROUTES ---

@app.route('/')
@app.route('/home')
def home():
    # This will be your main forum/ledger page eventually
    return render_template('forum.html', title='Forum')

@app.route('/profile')
@login_required  # This decorator protects the page from non-logged-in users
def profile():
    return render_template('profile.html', title='My Profile')

# Add your other routes here, like for making a pick
@app.route('/make_pick', methods=['GET', 'POST'])
@login_required
def make_pick():
    form = PickForm()
    if form.validate_on_submit():
        # Here you would add the logic to save the pick to the database
        flash('Your pick has been submitted!', 'success')
        return redirect(url_for('home'))
    return render_template('make_pick.html', title='Make a Pick', form=form)
