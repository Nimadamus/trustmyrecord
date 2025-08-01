from flask import Flask, render_template, redirect, url_for, flash, request
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
from flask_migrate import Migrate

from forms import PickForm
# The 'db' object is now imported from models.py to ensure it's the same instance
from models import db, User, Team, Pick

# --- App & Database Configuration ---
app = Flask(__name__)
app.config['SECRET_KEY'] = 'a-very-secret-key-for-forms'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///trustmyrecord.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# --- Initialize Extensions ---
db.init_app(app)
migrate = Migrate(app, db)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# ==========================================================
#  ROUTES
# ==========================================================

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/submit-pick', methods=['GET', 'POST'])
@login_required
def submit_pick():
    form = PickForm()
    if form.validate_on_submit():
        new_pick = Pick(
            user_id=current_user.id,
            sport=form.sport.data,
            event_details=form.event_details.data,
            pick_selection=form.pick_selection.data,
            stake_units=form.stake_units.data,
            odds=form.odds.data,
            event_timestamp=datetime.utcnow()
        )
        db.session.add(new_pick)
        db.session.commit()
        flash('Your pick has been successfully recorded to the immutable ledger.', 'success')
        return redirect(url_for('profile', username=current_user.username))
    return render_template('submit_pick.html', title='Submit a New Pick', form=form)

# --- PROFILE ROUTE (UPGRADED) ---
@app.route('/profile/<string:username>')
def profile(username):
    user = User.query.filter_by(username=username).first_or_404()
    # NEW: Fetch all picks for this user, ordered by most recent submission
    picks = Pick.query.filter_by(user_id=user.id).order_by(Pick.submission_timestamp.desc()).all()
    # We now pass both the user and their picks to the template
    return render_template('profile.html', user=user, picks=picks)

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
