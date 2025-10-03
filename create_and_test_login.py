import requests
from app import create_app
from extensions import db
from models import User
from werkzeug.security import generate_password_hash

# --- User creation details ---
NEW_USERNAME = "testuser_cli"
NEW_EMAIL = "test_cli@example.com"
NEW_PASSWORD = "testpassword"

# --- Login simulation details ---
LOGIN_URL = "http://127.0.0.1:5000/login" # Assuming your Flask app is running here

app = create_app()

with app.app_context():
    # 1. Create the new user
    print(f"Attempting to create new user: {NEW_USERNAME}")
    user_exists = User.query.filter_by(username=NEW_USERNAME).first()
    if user_exists:
        print(f"User '{NEW_USERNAME}' already exists. Deleting and re-creating.")
        db.session.delete(user_exists)
        db.session.commit()

    new_user = User(username=NEW_USERNAME, email=NEW_EMAIL)
    new_user.set_password(NEW_PASSWORD)
    db.session.add(new_user)
    db.session.commit()
    print(f"User '{NEW_USERNAME}' created successfully.")

# 2. Simulate login with the new user
print(f"\nAttempting to log in as username: {NEW_USERNAME} with password: {NEW_PASSWORD}")

login_data = {
    "username": NEW_USERNAME, # Use 'username' field as per forms.py fix
    "password": NEW_PASSWORD,
    "remember": "y"
}

try:
    response = requests.post(LOGIN_URL, data=login_data, allow_redirects=False)

    print(f"Response Status Code: {response.status_code}")
    print(f"Response Headers (Location for redirect): {response.headers.get('Location')}")

    if response.status_code == 302:
        print("Login attempt resulted in a redirect (likely successful).")
        print(f"Redirecting to: {response.headers.get('Location')}")
    elif response.status_code == 200:
        print("Login attempt returned 200 OK (likely failed, stayed on login page).")
        print("Response content (first 500 chars):")
        print(response.text[:500]) # Print part of the response to see if it's the login page
    else:
        print(f"Unexpected status code: {response.status_code}")

except requests.exceptions.ConnectionError:
    print("Error: Could not connect to the Flask application. Is the server running?")
except Exception as e:
    print(f"An unexpected error occurred: {e}")
