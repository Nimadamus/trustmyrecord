# Make sure to import the Team model at the top of your file:
# from .models import User, Team

@app.route('/profile/edit', methods=['GET', 'POST'])
@login_required
def edit_profile():
    if request.method == 'POST':
        # Update standard user info
        current_user.username = request.form.get('username', current_user.username)
        current_user.bio = request.form.get('bio', current_user.bio)

        # Update the user's chosen team
        team_id = request.form.get('favorite_team')
        current_user.favorite_team_id = int(team_id) if team_id else None

        # Logic for profile picture upload would go here

        db.session.commit()
        flash('Your profile has been updated successfully!', 'success')
        return redirect(url_for('profile', username=current_user.username))

    # On a GET request, fetch all teams to populate the form's dropdown
    teams = Team.query.order_by(Team.league, Team.name).all()
    return render_template('edit_profile.html', user=current_user, teams=teams)


from flask import Flask, render_template, redirect, url_for, flash, request
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
# ... any other imports you have ...

# Your app and database setup
app = Flask(__name__)
# ... your app.config settings ...
db = SQLAlchemy(app)
login_manager = LoginManager(app)

# Your User and Team models
# ... class User ...
# ... class Team ...

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# ==========================================================
#  YOUR EXISTING ROUTES
# ==========================================================

@app.route('/')
def index():
    # ... your code for the home page ...
    return render_template('index.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    # ... your code for logging in ...
    pass

@app.route('/register', methods=['GET', 'POST'])
def register():
    # ... your code for registration ...
    pass

@app.route('/logout')
@login_required
def logout():
    # ... your code for logging out ...
    pass

@app.route('/profile/edit', methods=['GET', 'POST'])
@login_required
def edit_profile():
    # ... this is the function we built in the previous step ...
    pass

# ==========================================================
#  ===> PASTE THE NEW PROFILE PAGE CODE HERE <===
# ==========================================================

@app.route('/profile/<string:username>')
def profile(username):
    user = User.query.filter_by(username=username).first_or_404()
    return render_template('profile.html', user=user)


# ==========================================================
#  The end of your file
# ==========================================================

if __name__ == '__main__':
    app.run(debug=True)
