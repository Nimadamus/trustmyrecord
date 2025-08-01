from flask import Flask, render_template, redirect, url_for, flash, request
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

# --- App & Database Configuration ---
app = Flask(__name__)
# IMPORTANT: You must have a SECRET_KEY for sessions (flask-login) to work.
app.config['SECRET_KEY'] = 'a-secret-key-that-is-very-secret' 
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///trustmyrecord.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# --- Initialize Extensions ---
db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login' # Redirect to login page if user is not authenticated

# --- Import Models ---
# This is now done AFTER db is initialized to avoid circular import errors.
from models import User, Team, Pick

# --- User Loader for Flask-Login ---
@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# ==========================================================
#  ROUTES
# ==========================================================

@app.route('/')
def index():
    return render_template('index.html')

# ... (login, register, logout routes would be here) ...
# Placeholder for now
@app.route('/login')
def login():
    return "Login Page Placeholder"

@app.route('/register')
def register():
    return "Register Page Placeholder"

@app.route('/logout')
def logout():
    return "Logout Placeholder"

@app.route('/profile/<string:username>')
def profile(username):
    user = User.query.filter_by(username=username).first_or_404()
    return render_template('profile.html', user=user)

@app.route('/profile/edit', methods=['GET', 'POST'])
@login_required
def edit_profile():
    if request.method == 'POST':
        current_user.username = request.form.get('username', current_user.username)
        current_user.bio = request.form.get('bio', current_user.bio)
        team_id = request.form.get('favorite_team')
        current_user.favorite_team_id = int(team_id) if team_id else None
        db.session.commit()
        flash('Your profile has been updated successfully!', 'success')
        return redirect(url_for('profile', username=current_user.username))
    
    teams = Team.query.order_by(Team.league, Team.name).all()
    return render_template('edit_profile.html', user=current_user, teams=teams)


if __name__ == '__main__':
    app.run(debug=True)
