# In app.py
import os
from flask import Flask, render_template, redirect, url_for, flash, request

# Import the extension instances from extensions.py
from extensions import db, migrate, login_manager

# Import the models and forms
from models import User, Post
from forms import RegistrationForm, LoginForm, PostForm

def create_app():
    """Application factory function."""
    app = Flask(__name__)
    
    # --- Configure the Application ---
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'a_super_secret_key')
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///site.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    # --- Initialize Extensions with the App ---
    # This is the crucial part: the extensions are initialized here.
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    
    # --- Configure Flask-Login ---
    login_manager.login_view = 'login'
    login_manager.login_message_category = 'info'

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    # --- Register Routes with the App ---
    # All your existing routes are defined within the factory
    @app.route('/')
    @app.route('/home')
    def home():
        return render_template('home.html', title='Home')

    @app.route('/register', methods=['GET', 'POST'])
    def register():
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
        logout_user()
        flash('You have been logged out.', 'info')
        return redirect(url_for('home'))

    @app.route('/profile')
    @login_required
    def profile():
        user_posts = Post.query.filter_by(user_id=current_user.id).order_by(Post.date_posted.desc()).all()
        return render_template('profile.html', title='My Profile', user_posts=user_posts)

    @app.route('/forum')
    @login_required
    def forum():
        posts = Post.query.join(User).order_by(Post.date_posted.desc()).all()
        return render_template('forum.html', title='Forum', posts=posts)

    @app.route('/forum/new', methods=['GET', 'POST'])
    @login_required
    def new_post():
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

    # Return the configured app instance
    return app

# --- Entry Point for Running the Application ---
# We create an app instance by calling our factory
app = create_app()

if __name__ == '__main__':
    # You no longer need to create the db here, only run the app
    app.run(debug=True)