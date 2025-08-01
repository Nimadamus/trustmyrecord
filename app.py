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
    
    # ===> NEW: Register the init-db command <===
    @app.cli.command("init-db")
    def init_db_command():
        """Creates the database tables."""
        db.create_all()
        print("Initialized the database.")

    return app

def register_routes(app):
    # All your existing routes...
    @app.route('/')
    def index(): return render_template('index.html')
    # ... etc

app = create_app()
