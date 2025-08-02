# In app.py
import os
from flask import Flask
from extensions import db, migrate, login_manager
from models import User

def create_app():
    app = Flask(__name__)

    app.config['SECRET_KEY'] = 'a_very_secret_key'
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///site.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)

    login_manager.login_view = 'auth.login'
    login_manager.login_message_category = 'info'
    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    from routes import main as main_blueprint
    app.register_blueprint(main_blueprint)

    from auth import auth as auth_blueprint
    app.register_blueprint(auth_blueprint)

    return app

if __name__ == '__main__':
    app = create_app()
    app.run(debug=True)