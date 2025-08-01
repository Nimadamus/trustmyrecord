# ============================================
# PASTE THIS COMPLETE CODE INTO YOUR app.py FILE
# ============================================

from flask import Flask
from flask_migrate import Migrate
from models import db  # Import the 'db' instance from your models.py

# --- Application Setup ---

# 1. Create the Flask application instance
app = Flask(__name__)

# 2. Configure the application
# This MUST match the database you have been working with.
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///site.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# 3. Initialize extensions
# This connects your Flask app with your database (db)
# and the migration engine (migrate).
db.init_app(app)
migrate = Migrate(app, db)


# --- Routes ---

# 4. Define a test route to see if the server works
@app.route('/')
def index():
    return "<h1>Success! The Flask application is running.</h1>"


# This part allows you to run with `python app.py` but is not
# needed for `flask run`. It's good practice to keep it.
if __name__ == '__main__':
    app.run(debug=True)
