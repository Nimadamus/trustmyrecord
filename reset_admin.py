from app import create_app
from extensions import db
from models import User

app = create_app()

with app.app_context():
    # Find the "Bay Area Beast" user
    user = User.query.filter_by(username='thebayareabeast').first()

    if user:
        # Update password and set as admin
        user.set_password('password')  # Set a known password
        user.is_admin = True
        db.session.commit()
        print(f"User '{user.username}' password reset to 'password' and admin status set to True.")
    else:
        print("User 'Bay Area Beast' not found.")
