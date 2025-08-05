from app import create_app
from models import User

app = create_app()

with app.app_context():
    users = User.query.all()
    if not users:
        print("No users found in the database.")
    else:
        print("Found users:")
        for user in users:
            print(f"  - Username: {user.username}, Email: {user.email}")
