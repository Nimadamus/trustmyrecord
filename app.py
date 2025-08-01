from flask import Flask, render_template, redirect, url_for, flash, request
from flask_login import login_required, current_user, logout_user
from datetime import datetime
from extensions import db, login_manager
from models import User, Team, Pick

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

    # ===> TEMPORARY ADMIN PROMOTION OVERRIDE <===
    with app.app_context():
        username_to_promote = 'thebayareabeast'
        user = User.query.filter_by(username=username_to_promote).first()
        if user and user.role != 'admin':
            user.role = 'admin'
            db.session.commit()
            print("\n" * 2)
            print("========================================================")
            print(f"  SUCCESS: User '{username_to_promote}' has been promoted to Admin.")
            print("  You can now STOP the server (Ctrl+C) and proceed.")
            print("========================================================\n")

    return app

def register_routes(app):
    @app.route('/')
    def index(): return render_template('index.html')
    # ... all your other routes go here ...

app = create_app()
