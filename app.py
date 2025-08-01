from flask import Flask, render_template, redirect, url_for, flash, request, abort
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
from flask_migrate import Migrate
from functools import wraps # Required for our custom decorator

from forms import PickForm
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
#  ===> NEW: ADMIN SECURITY DECORATOR <===
# ==========================================================
def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or current_user.role != 'admin':
            abort(403) # Forbidden
        return f(*args, **kwargs)
    return decorated_function

# ==========================================================
#  ROUTES
# ==========================================================

@app.route('/')
def index():
    return render_template('index.html')

# --- NEW ADMIN-ONLY ROUTE: Pick Grading System ---
@app.route('/admin/grade', methods=['GET', 'POST'])
@login_required
@admin_required # This decorator locks the page down
def grade_picks():
    if request.method == 'POST':
        pick_id = request.form.get('pick_id')
        new_status = request.form.get('status')
        pick_to_grade = Pick.query.get(pick_id)
        
        if pick_to_grade and new_status in ['Win', 'Loss', 'Push']:
            pick_to_grade.status = new_status
            db.session.commit()
            flash(f'Pick #{pick_id} has been graded as a {new_status}.', 'success')
        else:
            flash('Invalid request. Could not grade pick.', 'danger')
            
        return redirect(url_for('grade_picks'))

    # On a GET request, fetch all picks that are still pending
    pending_picks = Pick.query.filter_by(status='Pending').order_by(Pick.event_timestamp.asc()).all()
    return render_template('admin_grade.html', picks=pending_picks)


# --- Public User Routes ---
@app.route('/submit-pick', methods=['GET', 'POST'])
@login_required
def submit_pick():
    # This route's logic remains the same
    form = PickForm()
    if form.validate_on_submit():
        # ... existing logic ...
        pass
    return render_template('submit_pick.html', title='Submit a New Pick', form=form)

@app.route('/profile/<string:username>')
def profile(username):
    # This route's logic remains the same
    user = User.query.filter_by(username=username).first_or_404()
    picks = Pick.query.filter_by(user_id=user.id).order_by(Pick.submission_timestamp.desc()).all()
    return render_template('profile.html', user=user, picks=picks)

# ... Other routes like /profile/edit, /login, etc. remain here ...

if __name__ == '__main__':
    app.run(debug=True)
