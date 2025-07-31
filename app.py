from flask import Flask, render_template, request, redirect, url_for, flash, session
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from datetime import datetime

# -----------------------------------------------------------------------------
# APP & DATABASE CONFIGURATION
# -----------------------------------------------------------------------------

app = Flask(__name__)
# IMPORTANT: Change this to a long, random string in a real application
app.config['SECRET_KEY'] = 'a_very_secret_and_complex_key_for_dev'
# Use SQLite for simplicity. This will create a 'site.db' file in your project folder.
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///site.db'
# This quiet downs a warning
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
bcrypt = Bcrypt(app)

# -----------------------------------------------------------------------------
# DATABASE MODELS (The structure of our data)
# -----------------------------------------------------------------------------

# User model for storing handicapper information
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(20), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    # We store a hashed password, never the plain text password
    password_hash = db.Column(db.String(60), nullable=False)
    # Bio and avatar for the profile page
    bio = db.Column(db.Text, nullable=True, default='Veteran capper specializing in data-driven MLB and NFL analysis. All picks tracked with 100% transparency.')
    avatar_image = db.Column(db.String(20), nullable=False, default='default_avatar.jpg')
    # This creates a relationship, allowing us to easily access a user's picks
    picks = db.relationship('Pick', backref='author', lazy=True)

    def __repr__(self):
        return f"User('{self.username}', '{self.email}')"

# Pick model for storing individual bet records
class Pick(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    selection = db.Column(db.String(100), nullable=False)
    odds = db.Column(db.Integer, nullable=False)
    units = db.Column(db.Float, nullable=False)
    # Result can be 'WIN', 'LOSS', 'PUSH', or 'PENDING'
    result = db.Column(db.String(10), nullable=False, default='PENDING')
    # Foreign Key links this pick to a specific user
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

    def __repr__(self):
        return f"Pick('{self.date}', '{self.selection}', '{self.result}')"

# -----------------------------------------------------------------------------
# ROUTES (The different pages of our application)
# -----------------------------------------------------------------------------

@app.route("/")
@app.route("/home")
def home():
    # In the future, this page could list top handicappers or recent picks
    return render_template('home.html', title='Home') # You will need to create a home.html

@app.route("/register", methods=['GET', 'POST'])
def register():
    # If user is already logged in, redirect them away from the register page
    if 'username' in session:
        return redirect(url_for('home'))

    if request.method == 'POST':
        username = request.form.get('username')
        email = request.form.get('email')
        password = request.form.get('password')
        
        # Hash the password before storing it
        hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
        user = User(username=username, email=email, password_hash=hashed_password)
        db.session.add(user)
        db.session.commit()
        
        flash(f'Account created for {username}! You can now log in.', 'success')
        return redirect(url_for('login'))
        
    return render_template('register.html', title='Register') # You will need a register.html

@app.route("/login", methods=['GET', 'POST'])
def login():
    # If user is already logged in, redirect them
    if 'username' in session:
        return redirect(url_for('home'))

    if request.method == 'POST':
        email = request.form.get('email')
        password = request.form.get('password')
        
        user = User.query.filter_by(email=email).first()
        if user and bcrypt.check_password_hash(user.password_hash, password):
            # If login is successful, store username in session
            session['username'] = user.username
            flash('You have been logged in!', 'success')
            return redirect(url_for('my_profile'))
        else:
            flash('Login Unsuccessful. Please check email and password.', 'danger')
            
    return render_template('login.html', title='Login') # You will need a login.html

@app.route("/logout")
def logout():
    session.pop('username', None)
    flash('You have been logged out.', 'info')
    return redirect(url_for('home'))

# ROUTE 1: PRIVATE REDIRECT for '/profile'
# This redirects a logged-in user to their own public profile page.
@app.route('/profile')
def my_profile():
    if 'username' in session:
        return redirect(url_for('profile', username=session['username']))
    else:
        # If not logged in, send to login page
        flash('You must be logged in to view your profile.', 'info')
        return redirect(url_for('login'))

# ROUTE 2: PUBLIC DYNAMIC PROFILE PAGE for '/profile/<username>'
# This is the page that displays stats and picks.
@app.route("/profile/<string:username>")
def profile(username):
    # Get the user from the database or show a 404 error if they don't exist
    user = User.query.filter_by(username=username).first_or_404()
    
    # --- TODO: Replace with real stat calculations from the database ---
    # For now, we use placeholder data so the template renders correctly.
    placeholder_stats = { 'roi': 25.19, 'units': 94.43, 'win_pct': 56.19, 'z_score': '2.99', 'clv': '2.4' }

    # Fetch this user's picks from the database, ordered by most recent first
    recent_picks = Pick.query.filter_by(author=user).order_by(Pick.date.desc()).all()

    # Pass all the necessary data to the profile.html template
    return render_template(
        'profile.html', 
        title=user.username, 
        user=user, 
        user_stats=placeholder_stats, 
        picks=recent_picks
    )

# -----------------------------------------------------------------------------
# SCRIPT EXECUTION
# -----------------------------------------------------------------------------

if __name__ == '__main__':
    # This command will create the database and tables if they don't exist
    # You should run this once from your terminal before the first run.
    with app.app_context():
        db.create_all()
    app.run(debug=True)
