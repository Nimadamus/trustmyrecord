# In routes.py
from flask import Blueprint, render_template
from flask_login import login_required

main = Blueprint('main', __name__)

@main.route('/')
@main.route('/home')
def home():
    return render_template('home.html', title='Home')

@main.route('/profile')
@login_required
def profile():
    return render_template('profile.html', title='My Profile')