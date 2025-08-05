from app import create_app
from extensions import db
from models import User

app = create_app()

with app.app_context():
    db.create_all()

    # Create a test user
    test_user = User(username='testuser', email='test@example.com')
    test_user.set_password('password') # Set a simple password
    db.session.add(test_user)
    db.session.commit()

    print("Database tables created and test user 'testuser' (test@example.com) with password 'password' created.")
