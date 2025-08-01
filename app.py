from flask import Flask, render_template, redirect, url_for, flash, request, abort
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
from datetime import datetime

# Import from our new, stable architecture
from extensions import db, migrate, login_manager
from models import User, Team, Pick, UserStats
from forms import PickForm # We will create a RegistrationForm soon

# ==========================================================
#  The Application Factory
# ==========================================================
def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = 'a-very-secret-key-for-the-empire'
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///trustmyrecord.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    # Initialize extensions with the app
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    login_manager.login_view = 'login' # Sets the default login page

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    # ==========================================================
    #  Helper Function: The Stats Engine
    # ==========================================================
    def update_user_stats(user_id):
        user_stats = UserStats.query.filter_by(user_id=user_id).first()
        if not user_stats:
            return # Should not happen, but a good safeguard

        graded_picks = Pick.query.filter_by(user_id=user_id, status.in_(['Win', 'Loss', 'Push'])).all()
        
        wins = 0
        losses = 0
        pushes = 0
        units_net = 0.0

        for pick in graded_picks:
            if pick.status == 'Win':
                wins += 1
                if pick.odds > 0:
                    units_net += pick.stake_units * (pick.odds / 100.0)
                else:
                    units_net += pick.stake_units / (abs(pick.odds) / 100.0)
            elif pick.status == 'Loss':
                losses += 1
                units_net -= pick.stake_units
            elif pick.status == 'Push':
                pushes += 1
        
        user_stats.wins = wins
        user_stats.losses = losses
        user_stats.pushes = pushes
        user_stats.units_net = units_net
        
        db.session.commit()

    # ==========================================================
    #  ROUTES
    # ==========================================================
    @app.route('/register', methods=['GET', 'POST'])
    def register():
        # This is a simplified registration form. We'll use Flask-WTF later.
        if request.method == 'POST':
            username = request.form.get('username')
            email = request.form.get('email')
            password = request.form.get('password')

            # Check if user already exists
            user_exists = User.query.filter_by(email=email).first()
            if user_exists:
                flash('An account with that email already exists.', 'danger')
                return redirect(url_for('register'))

            # Create the new User
            new_user = User(
                email=email, 
                username=username,
            )
            new_user.set_password(password)
            
            # Create the corresponding UserStats entry
            new_user_stats = UserStats(user=new_user)

            db.session.add(new_user)
            db.session.add(new_user_stats)
            db.session.commit()

            flash('Your account has been created! You can now log in.', 'success')
            return redirect(url_for('login'))

        return render_template('register.html') # Assume a basic register.html exists

    # --- ADMIN GRADING ROUTE (UPGRADED) ---
    @app.route('/admin/grade', methods=['GET', 'POST'])
    @login_required
    # @admin_required # We will add this back later
    def grade_picks():
        if request.method == 'POST':
            pick_id = request.form.get('pick_id')
            new_status = request.form.get('status')
            pick_to_grade = Pick.query.get(pick_id)
            
            if pick_to_grade and new_status in ['Win', 'Loss', 'Push']:
                pick_to_grade.status = new_status
                db.session.commit()
                # ===> TRIGGER THE STATS ENGINE <===
                update_user_stats(pick_to_grade.user_id)
                flash(f'Pick #{pick_id} graded. User stats updated.', 'success')
            else:
                flash('Invalid request.', 'danger')
            return redirect(url_for('grade_picks'))

        pending_picks = Pick.query.filter_by(status='Pending').all()
        return render_template('admin_grade.html', picks=pending_picks)
        
    # All other routes (/profile, /submit-pick, etc.) would be here
    # ...

    return app
