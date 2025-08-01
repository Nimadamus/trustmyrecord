from flask import Flask
# Import the instances from our new extensions file
from extensions import db, migrate, login_manager
from models import User, Team, Pick, UserStats # Import models
# ... (other imports like render_template, etc.)

def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = 'a-very-secret-key'
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///trustmyrecord.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    # Initialize extensions with the app
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login' # We will create an 'auth' blueprint later

    # We will register our blueprints here later
    # from .routes import main as main_blueprint
    # app.register_blueprint(main_blueprint)
    
    return app
