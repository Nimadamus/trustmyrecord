# ============================================
# PASTE THIS COMPLETE CODE INTO YOUR app.py FILE
# ============================================

from flask import Flask, render_template, redirect, url_for, flash
from flask_migrate import Migrate
from flask_login import LoginManager, login_user, logout_user, current_user, login_required

# Make sure all necessary components are imported
from models import db, User
from forms import RegistrationForm, LoginForm, PickForm

# --- Application Setup ---
app = Flask(__name__)
app.config['SECRET_KEY'] = 'a-very-secret-key-that-you-must-change'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///site.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# --- Initialize Extensions ---
db.init_app(app)
migrate = Migrate(app, db)
login_manager = LoginManager(app)
login_manager.login_view = 'login'
login_manager.login_message_category = 'info'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


# --- Routes ---

@app.route('/')
@app.route('/home')
def home():
    # You can customize this later, e.g., to render 'forum.html'
    return "<h1>Welcome Home!</h1> <a href='/login'>Login</a> | <a href='/register'>Register</a> | <a href='/profile'>Profile</a>"

@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('profile'))
    form = RegistrationForm()
    if form.validate_on_submit():
        user = User(username=form.username.data, email=form.email.data)
        user.set_password(form.password.data)
        db.session.add(user)
        db.session.commit()
        flash('Your account has been created! You can now log in.', 'success')
        return redirect(url_for('login'))
    # Assuming you have a 'register.html' template
    return render_template('register.html', title='Register', form=form)

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('profile'))
    form = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter_by(email=form.email.data).first()
        if user and user.check_password(form.password.data):
            login_user(user)
            return redirect(url_for('profile'))
        else:
            flash('Login Unsuccessful. Please check email and password.', 'danger')
    # Assuming you have a 'login.html' template
    return render_template('login.html', title='Login', form=form)

@app.route('/logout')
def logout():
    logout_user()
    return redirect(url_for('home'))

@app.route('/profile')
@login_required
def profile():
    # Assuming you have a 'profile.html' template
    return render_template('profile.html', title='My Profile')
