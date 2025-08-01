from flask import Flask, render_template, redirect, url_for, flash, request, abort
from flask_login import login_required, current_user, logout_user
from datetime import datetime
from functools import wraps
from extensions import db, login_manager
from models import User, Team, Pick

# Admin Required Decorator
def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or current_user.role != 'admin':
            abort(403) # Forbidden
        return f(*args, **kwargs)
    return decorated_function

def create_app(config_object='config.DevelopmentConfig'):
    app = Flask(__name__)
    app.config.from_mapping(
        SECRET_KEY='dev',
        SQLALCHEMY_DATABASE_URI='sqlite:///trustmyrecord.db',
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
    )
    db.init_app(app)
    login_manager.init_app(app)
    register_routes(app)
    return app

def register_routes(app):
    # ... all other routes ...
    @app.route('/')
    def index(): return render_template('index.html')

    # ===> UPGRADED: Admin Dashboard now fetches pending picks <===
    @app.route('/admin')
    @login_required
    @admin_required
    def admin_dashboard():
        # Query the database for all picks with the status 'Pending'
        # Order them by the event date to prioritize upcoming games
        pending_picks = Pick.query.filter_by(status='Pending').order_by(Pick.event_timestamp.asc()).all()
        
        # Pass the list of picks to the template
        return render_template('admin/dashboard.html', picks=pending_picks)
    
    # ===> NEW: The route to handle the grading form submission <===
    @app.route('/admin/grade_pick/<int:pick_id>', methods=['POST'])
    @login_required
    @admin_required
    def grade_pick(pick_id):
        pick_to_grade = Pick.query.get_or_404(pick_id)
        new_status = request.form.get('status')

        # Basic validation
        if new_status in ['Win', 'Loss', 'Push']:
            pick_to_grade.status = new_status
            db.session.commit()
            flash(f'Pick #{pick_to_grade.id} has been graded as a {new_status}.', 'success')
        else:
            flash('Invalid status submitted.', 'danger')

        return redirect(url_for('admin_dashboard'))


app = create_app()
