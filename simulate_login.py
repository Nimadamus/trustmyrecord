import requests

# Assuming your Flask app is running on http://127.0.0.1:5000
LOGIN_URL = "http://127.0.0.1:5000/login"
USERNAME = "thebayareabeast"
PASSWORD = "password"

# Prepare the data for the login request
login_data = {
    "email": USERNAME,  # The form field is named 'email' but expects username now
    "password": PASSWORD,
    "remember": "y" # Simulate "remember me" checked
}

print(f"Attempting to log in as username: {USERNAME} with password: {PASSWORD}")

try:
    # Send the POST request
    response = requests.post(LOGIN_URL, data=login_data, allow_redirects=False)

    print(f"Response Status Code: {response.status_code}")
    print(f"Response Headers (Location for redirect): {response.headers.get('Location')}")

    if response.status_code == 302: # 302 Found indicates a redirect, usually successful login
        print("Login attempt resulted in a redirect (likely successful).")
        print(f"Redirecting to: {response.headers.get('Location')}")
    elif response.status_code == 200: # 200 OK might mean login failed and rendered login page again
        print("Login attempt returned 200 OK (likely failed, stayed on login page).")
        # You might want to inspect response.text here for error messages
    else:
        print(f"Unexpected status code: {response.status_code}")

except requests.exceptions.ConnectionError:
    print("Error: Could not connect to the Flask application. Is the server running?")
except Exception as e:
    print(f"An unexpected error occurred: {e}")
