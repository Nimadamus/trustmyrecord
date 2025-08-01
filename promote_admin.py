import sys
from app import create_app
from models import User, db

# Check if a username argument was provided from the command line
if len(sys.argv) < 2:
    print("Error: Please provide a username.")
    print("Usage: python promote_admin.py <username>")
    # Exit the script because we can't proceed
    sys.exit(1)

# Get the username from the command line argument
username_to_promote = sys.argv[1]

# We must create an instance of our app to work with its database
app = create_app()

# The 'with app.app_context()' is CRITICAL. It allows our script
# to access the database and all the application's settings.
with app.app_context():
    # Find the user in the database
    user = User.query.filter_by(username=username_to_promote).first()

    # If the user exists, update their role
    if user:
        user.role = 'admin'
        db.session.commit()
        print(f"SUCCESS: User '{username_to_promote}' has been promoted to Admin.")
    # If the user does not exist, show an error
    else:
        print(f"ERROR: User '{username_to_promote}' not found.")
