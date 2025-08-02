from flask import Blueprint, render_template, redirect, url_for
from flask_login import current_user, login_required

# Note: We name the blueprint 'main'
main = Blueprint('main', __name__)

@main.route('/')
@main.route('/home')
def home():
    return render_template('home.html', title='Home')

@main.route('/profile')
@login_required
def profile():
    # Your profile logic will go here
    return render_template('profile.html', title='My Profile')

# Add your forum and other main routes here as well
