# ============================================
# PASTE THIS CODE INTO YOUR app.py FILE
# ============================================

from flask import Flask
from flask_migrate import Migrate
from models import db  # Import the 'db' object from your models.py

# 1. Create the Flask application instance
app = Flask(__name__)

# 2. Configure the application
# This tells Flask where your database file is located.
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///site.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# 3. Initialize extensions
# Connects your database object (db) to your Flask app.
db.init_app(app)
# Connects the migration engine to your app and database.
migrate = Migrate(app, db)

# 4. Define a simple route to test the server
@app.route('/')
def index():
    # When you visit your website, it will show this message.
    return "<h1>The Flask server is running!</h1>"

# This part is optional for the 'flask run' command, but good to have
if __name__ == '__main__':
    app.run(debug=True)
