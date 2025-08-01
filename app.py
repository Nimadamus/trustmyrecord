from flask import Flask, render_template, redirect, url_for, flash, request
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
from flask_migrate import Migrate

# --- Import our new form blueprint ---
from forms import PickForm
# --- Import all database models ---
from models import db, User, Team, Pick 

# --- App & Database Configuration ---
app = Flask(__name__)
app.config['SECRET_KEY'] = 'a-secret-key-that-is-very-secret'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///trustmyrecord.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# --- Initialize Extensions ---
db.init_app(app) # Connect the db object to our app
migrate = Migrate(app, db)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

# --- User Loader for Flask-Login ---
@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# ==========================================================
#  ROUTES
# ==========================================================

@app.route('/')
def index():
    return render_template('index.html')

# --- NEW ROUTE: The Pick Submission System ---
@app.route('/submit-pick', methods=['GET', 'POST'])
@login_required
def submit_pick():
    form = PickForm()
    if form.validate_on_submit():
        # A new Pick object is created using data from the validated form
        new_pick = Pick(
            user_id=current_user.id,
            sport=form.sport.data,
            event_details=form.event_details.data,
            pick_selection=form.pick_selection.data,
            stake_units=form.stake_units.data,
            odds=form.odds.data,
            # For now, event_timestamp is set to now. We'll add a date picker later.
            event_timestamp=datetime.utcnow() 
        )
        db.session.add(new_pick)
        db.session.commit()
        flash('Your pick has been successfully recorded to the immutable ledger.', 'success')
        return redirect(url_for('profile', username=current_user.username))
    
    return render_template('submit_pick.html', title='Submit a New Pick', form=form)


# --- Existing Profile Routes ---
@app.route('/profile/<string:username>')
def profile(username):
    user = User.query.filter_by(username=username).first_or_404()
    return render_template('profile.html', user=user)

@app.route('/profile/edit', methods=['GET', 'POST'])
@login_required
def edit_profile():
    # This route's logic remains the same
    # ...
    pass # Placeholder for existing logic

# --- Placeholder Auth Routes ---
@app.route('/login')
def login(): return "Login Page Placeholder"
@app.route('/register')
def register(): return "Register Page Placeholder"
@app.route('/logout')
def logout(): return "Logout Placeholder"

if __name__ == '__main__':
    app.run(debug=True)
