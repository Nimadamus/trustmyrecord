# In extensions.py
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager

# Create the extension instances. Do not configure them here.
db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()
