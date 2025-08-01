from flask import Flask
from flask_migrate import Migrate # <-- Import Migrate
from extensions import db, login_manager
from models import User, Team, Pick, Post, Comment # <-- Import new models

def create_app(config_object='config.DevelopmentConfig'):
    app = Flask(__name__)
    app.config.from_mapping(
        SECRET_KEY='dev',
        SQLALCHEMY_DATABASE_URI='sqlite:///trustmyrecord.db',
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
    )
    db.init_app(app)
    login_manager.init_app(app)
    
    # Initialize Flask-Migrate
    migrate = Migrate(app, db) # <-- Initialize Migrate

    # Register routes, commands, etc.
    # ...

    return app

# ... (rest of your app.py file)
