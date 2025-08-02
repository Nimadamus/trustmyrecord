
#### 4. Replace Your `app.py` with the Factory

**File: `app.py`**
```python
import os
from flask import Flask

from extensions import db, migrate, login_manager
from models import User # Import User for the user_loader

def create_app():
    app = Flask(__name__)

    # --- Configuration ---
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'a_default_secret_key')
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///site.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    # --- Initialize Extensions ---
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)

    # --- Configure Login Manager ---
    login_manager.login_view = 'auth.login' # Points to the login route in the 'auth' blueprint
    login_manager.login_message_category = 'info'
    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    # --- Register Blueprints ---
    from routes import main as main_blueprint
    app.register_blueprint(main_blueprint)

    from auth import auth as auth_blueprint
    app.register_blueprint(auth_blueprint, url_prefix='/')

    return app

# This part is only for running with 'python app.py'
if __name__ == '__main__':
    app = create_app()
    app.run(debug=True)