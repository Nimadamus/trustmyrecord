from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager

# Create the extension instances
db = SQLAlchemy()
migrate = Migrate()
# The invalid syntax was here. This is now correct.
login_manager = LoginManager() 
