<<<<<<< HEAD
from flask import Blueprint, render_template, redirect, url_for, request, flash
from flask_login import login_required, current_user

main = Blueprint('main', __name__)

@main.route('/')
def home():
    return redirect(url_for('main.leaderboard'))  # or pick a homepage

@main.route('/login')
def login():
    return render_template('login.html')

@main.route('/register')
def register():
    return render_template('register.html')
=======
from flask import Blueprint, render_template, redirect, url_for
from flask_login import current_user, login_required

# Note: We name the blueprint 'main'
main = Blueprint('main', __name__)

@main.route('/')
@main.route('/home')
def home():
    return render_template('home.html', title='Home')
>>>>>>> 937d03ef6c67f82347eb6272b967fa882bc8cf7e

@main.route('/profile')
@login_required
def profile():
<<<<<<< HEAD
    return render_template('profile.html', user=current_user)

@main.route('/edit-profile')
@login_required
def edit_profile():
    return render_template('edit-profile.html', user=current_user)

@main.route('/make-pick')
@login_required
def make_pick():
    return render_template('make_pick.html')

@main.route('/submit-pick', methods=['POST'])
@login_required
def submit_pick():
    # Add logic to save pick to DB here
    flash("Pick submitted successfully!")
    return redirect(url_for('main.make_pick'))

@main.route('/leaderboard')
def leaderboard():
    return render_template('leaderboard.html')

@main.route('/forum')
def forum():
    return render_template('forum.html')
=======
    # Your profile logic will go here
    return render_template('profile.html', title='My Profile')

# Add your forum and other main routes here as well
>>>>>>> 937d03ef6c67f82347eb6272b967fa882bc8cf7e
