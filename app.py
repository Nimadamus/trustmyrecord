import os

from flask import Flask, render_template, redirect, url_for, flash, request
from flask_migrate import Migrate
from flask_login import LoginManager, login_user, logout_user, current_user, login_required
from flask_sqlalchemy import SQLAlchemy

# These models are being imported from your models.py file
from models import db, User, Post 
# These forms are being imported from your forms.py file
from forms import RegistrationForm, LoginForm, PostForm

# --- Application Setup ---
app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your_super_secret_key_change_this_now!')
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///site.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# --- Initialize Extensions ---
# Initialize the database with the app
db.init_app(app) 
# Initialize Flask-Migrate for database migrations
migrate = Migrate(app, db) 
# Initialize Flask-Login for user session management
login_manager = LoginManager(app)
# Tell Flask-Login which route handles logging in
login_manager.login_view = 'login' 
# Set the style for flashed messages
login_manager.login_message_category = 'info' 

@login_manager.user_loader
def load_user(user_id):
    """Flask-Login function to load a user from the database."""
    return User.query.get(int(user_id))

# --- Routes ---

@app.route('/')
@app.route('/home')
def home():
    """Renders the home page."""
    return render_template('home.html', title='Home')

@app.route('/register', methods=['GET', 'POST'])
def register():
    """Handles user registration."""
    if current_user.is_authenticated:
        return redirect(url_for('profile'))
    form = RegistrationForm()
    if form.validate_on_submit():
        user = User(username=form.username.data, email=form.email.data)
        user.set_password(form.password.data)
        db.session.add(user)
        db.session.commit()
        flash('Your account has been created! You can now log in.', 'success')
        return redirect(url_for('login'))
    return render_template('register.html', title='Register', form=form)

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Handles user login."""
    if current_user.is_authenticated:
        return redirect(url_for('profile'))
    form = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter_by(email=form.email.data).first()
        if user and user.check_password(form.password.data):
            login_user(user, remember=form.remember.data)
            next_page = request.args.get('next')
            flash('Login successful!', 'success')
            return redirect(next_page) if next_page else redirect(url_for('profile'))
        else:
            flash('Login Unsuccessful. Please check email and password.', 'danger')
    return render_template('login.html', title='Login', form=form)

@app.route('/logout')
@login_required
def logout():
    """Handles user logout."""
    logout_user()
    flash('You have been logged out.', 'info')
    return redirect(url_for('home'))

@app.route('/profile')
@login_required
def profile():
    """Renders the user's profile page."""
    user_posts = Post.query.filter_by(user_id=current_user.id).order_by(Post.date_posted.desc()).all()
    return render_template('profile.html', title='My Profile', user_posts=user_posts)

@app.route('/forum')
@login_required
def forum():
    """Renders the main forum page with all posts."""
    posts = Post.query.join(User).order_by(Post.date_posted.desc()).all()
    return render_template('forum.html', title='Forum', posts=posts)

@app.route('/forum/new', methods=['GET', 'POST'])
@login_required
def new_post():
    """Handles creation of a new forum post."""
    form = PostForm()
    if form.validate_on_submit():
        post = Post(
            title=form.title.data,
            content=form.content.data,
            user_id=current_user.id
        )
        db.session.add(post)
        db.session.commit()
        flash('Your post has been created!', 'success')
        return redirect(url_for('forum'))
    return render_template('create_post.html', title='New Post', form=form, legend='New Post')

# --- Start the Application ---
if __name__ == '__main__':
    # This command now ONLY starts the web server.
    app.run(debug=True)
