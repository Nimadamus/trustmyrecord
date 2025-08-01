from flask import Flask, render_template, redirect, url_for, flash, request, abort
from flask_login import login_required, current_user, logout_user
from datetime import datetime
from functools import wraps # Required for our new decorator
from extensions import db, login_manager
from models import User, Team, Pick

# ===> NEW: Admin Required Decorator <===
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
    # ... all your existing user-facing routes ...

    # ===> NEW: Admin Dashboard Route <===
    @app.route('/admin')
    @login_required
    @admin_required
    def admin_dashboard():
        # For now, just show a simple page.
        # Later, this will fetch pending picks.
        return render_template('admin/dashboard.html')

app = create_app()
