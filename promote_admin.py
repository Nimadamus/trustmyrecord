import os
import sys

# This is the magic fix. It adds your project's main directory
# to Python's path, so it can now find 'app', 'models', etc.
# This line MUST be at the very top.
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

# Now the rest of the script can run because it knows where to find the other files.
from app import create_app
from models import User
from extensions import db

# Check if a username argument was provided
if len(sys.argv) < 2:
    print("Error: Please provide a username.")
    print("Usage: python promote_admin.py <username>")
    sys.exit(1)

# Get the username from the command line
username_to_promote = sys.argv[1]

# Create the app instance to work with its database
app = create_app()

# Use the app context to access the database
with app.app_context():
    # Find the user
    user = User.query.filter_by(username=username_to_promote).first()

    # Update the user if they exist
    if user:
        user.role = 'admin'
        db.session.commit()
        print(f"SUCCESS: User '{username_to_promote}' has been promoted to Admin.")
    else:
        print(f"ERROR: User '{username_to_promote}' not found.")
