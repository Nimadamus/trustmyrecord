from flask import Flask, render_template, redirect, url_for, flash, request
from flask_login import login_required, current_user, logout_user
from datetime import datetime

# We import the extensions and models from our other files
from extensions import db, login_manager
from models import User, Team, Pick

def create_app(config_object='config.DevelopmentConfig'):
    app = Flask(__name__)
    app.config['SECRET_KEY'] = 'a-secret-key-that-should-be-changed'
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///trustmyrecord.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)
    login_manager.init_app(app)

    register_routes(app)
    
    # ==========================================================
    #  ===> TEMPORARY ADMIN PROMOTION OVERRIDE (STEP 1) <===
    # ==========================================================
    with app.app_context():
        username_to_promote = 'thebayareabeast'
        user = User.query.filter_by(username=username_to_promote).first()
        if user and user.role != 'admin':
            user.role = 'admin'
            db.session.commit()
            print("========================================================")
            print(f"  SUCCESS: User '{username_to_promote}' has been promoted to Admin.")
            print("  You can now stop the server and proceed to STEP 2.")
            print("========================================================")

    return app

def register_routes(app):
    # ALL YOUR @app.route(...) functions go here, unchanged.
    @app.route('/')
    def index(): return render_template('index.html')
    @app.route('/login', methods=['GET', 'POST'])
    def login(): return render_template('login.html')
    @app.route('/register', methods=['GET', 'POST'])
    def register(): return render_template('register.html')
    @app.route('/logout')
    @login_required
    def logout():
        logout_user()
        return redirect(url_for('index'))
    @app.route('/profile/<string:username>')
    def profile(username):
        user = User.query.filter_by(username=username).first_or_404()
        picks = Pick.query.filter_by(user_id=user.id).order_by(Pick.submission_timestamp.desc()).all()
        return render_template('profile.html', user=user, picks=picks)
    # ... include all other routes ...

app = create_app()
