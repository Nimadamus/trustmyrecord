# ==========================================================
# PASTE THIS ENTIRE BLOCK OF CODE INTO YOUR app.py FILE
# ==========================================================
import os

from flask import Flask, render_template, redirect, url_for, flash, request
from flask_migrate import Migrate
from flask_login import LoginManager, login_user, logout_user, current_user, login_required
from flask_sqlalchemy import SQLAlchemy # Import SQLAlchemy here as well if you want db defined in app.py
# from models import db # If db is defined in models.py, you'd import it like this

# --- IMPORTANT ---
# You MUST have your models.py and forms.py files in the SAME directory as app.py
# and ensure they contain the code provided in previous responses.
from models import db, User, Post # Make sure 'Post' is correctly imported from your models.py
from forms import RegistrationForm, LoginForm, PostForm # Make sure 'PostForm' is correctly imported from your forms.py

# --- Application Setup ---
app = Flask(__name__)
# IMPORTANT: Change this secret key for production! Generate a random one.
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your_super_secret_key_change_this_now!')
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///site.db') # Uses SQLite by default
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# --- Initialize Extensions ---
db.init_app(app) # Initialize db with the app
migrate = Migrate(app, db)
login_manager = LoginManager(app)
login_manager.login_view = 'login' # Redirect users to the 'login' route if they need to log in
login_manager.login_message_category = 'info' # Flash message category for login prompts

@login_manager.user_loader
def load_user(user_id):
    """Required callback to reload the user by ID from the session."""
    return User.query.get(int(user_id))

# --- Routes ---

@app.route('/')
@app.route('/home')
def home():
    """Renders the homepage."""
    return render_template('home.html', title='Home') # Assumes you have a templates/home.html

@app.route('/register', methods=['GET', 'POST'])
def register():
    """Handles user registration."""
    if current_user.is_authenticated:
        return redirect(url_for('profile')) # If already logged in, redirect to profile
    form = RegistrationForm()
    if form.validate_on_submit():
        user = User(username=form.username.data, email=form.email.data)
        user.set_password(form.password.data) # Hash and set the password
        db.session.add(user)
        db.session.commit()
        flash('Your account has been created! You can now log in.', 'success')
        return redirect(url_for('login')) # Redirect to login page after successful registration
    return render_template('register.html', title='Register', form=form)

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Handles user login."""
    if current_user.is_authenticated:
        return redirect(url_for('profile')) # If already logged in, redirect to profile
    form = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter_by(email=form.email.data).first()
        if user and user.check_password(form.password.data):
            login_user(user, remember=form.remember.data) # Log the user in
            next_page = request.args.get('next') # Check for a redirect URL
            flash('Login successful!', 'success')
            # Redirect to the 'next' page if it exists, otherwise to the profile page
            return redirect(next_page) if next_page else redirect(url_for('profile'))
        else:
            flash('Login Unsuccessful. Please check email and password.', 'danger')
    return render_template('login.html', title='Login', form=form)

@app.route('/logout')
@login_required # User must be logged in to log out
def logout():
    """Handles user logout."""
    logout_user()
    flash('You have been logged out.', 'info')
    return redirect(url_for('home'))

@app.route('/profile')
@login_required # User must be logged in to view their profile
def profile():
    """Displays the logged-in user's profile and their posts."""
    # Fetch the user's posts using the 'posts' relationship defined in the User model
    user_posts = Post.query.filter_by(user_id=current_user.id).order_by(Post.date_posted.desc()).all()
    return render_template('profile.html', title='My Profile', user_posts=user_posts) # Pass posts to the template

# --- FORUM ROUTES ---

@app.route('/forum')
@login_required # User must be logged in to view the forum
def forum():
    """Displays all posts in the forum."""
    # Fetch all posts, joining with User to get author's username.
    # The .join(User) works because Post.user_id is a ForeignKey to User.id.
    posts = Post.query.join(User).order_by(Post.date_posted.desc()).all()
    return render_template('forum.html', title='Forum', posts=posts)

@app.route('/forum/new', methods=['GET', 'POST'])
@login_required # User must be logged in to create a new post
def new_post():
    """Handles the creation of a new forum post."""
    form = PostForm() # Instantiate the PostForm
    if form.validate_on_submit():
        # Create a new Post instance with data from the form and current user's ID
        post = Post(
            title=form.title.data,
            content=form.content.data,
            user_id=current_user.id
        )
        db.session.add(post)
        db.session.commit()
        flash('Your post has been created!', 'success')
        return redirect(url_for('forum')) # Redirect back to the forum page
    # If it's a GET request, render the form
    return render_template('create_post.html', title='New Post', form=form, legend='New Post') # Assumes you have templates/create_post.html

# --- Database Initialization ---
if __name__ == '__main__':
    # This block runs when you execute 'python app.py'
    # The 'with app.app_context():' ensures that the db.create_all() call
    # has access to the application context, which is necessary for SQLAlchemy.
    with app.app_context():
        db.create_all() # Creates the database tables if they don't exist
    app.run(debug=True) # Starts the Flask development server
