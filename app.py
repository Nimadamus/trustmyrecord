from flask import Flask, render_template, request, redirect, url_for, flash, session
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from datetime import datetime

# --- CONFIGURATION ---
app = Flask(__name__)
app.config['SECRET_KEY'] = 'a_very_secret_and_complex_key_for_dev'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///site.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)
bcrypt = Bcrypt(app)

# --- DATABASE MODELS ---
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(20), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(60), nullable=False)
    picks = db.relationship('Pick', backref='author', lazy=True)

class Pick(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    selection = db.Column(db.String(100), nullable=False)
    odds = db.Column(db.Integer, nullable=False)
    units = db.Column(db.Float, nullable=False)
    result = db.Column(db.String(10), nullable=False, default='PENDING')
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

# --- ROUTES ---
@app.route("/")
@app.route("/home")
def home():
    return render_template('home.html', title='Home')

@app.route("/register", methods=['GET', 'POST'])
def register():
    if 'username' in session: return redirect(url_for('home'))
    if request.method == 'POST':
        hashed_password = bcrypt.generate_password_hash(request.form.get('password')).decode('utf-8')
        user = User(username=request.form.get('username'), email=request.form.get('email'), password_hash=hashed_password)
        db.session.add(user)
        db.session.commit()
        flash('Account created! You can now log in.', 'success')
        return redirect(url_for('login'))
    return render_template('register.html', title='Register')

@app.route("/login", methods=['GET', 'POST'])
def login():
    if 'username' in session: return redirect(url_for('home'))
    if request.method == 'POST':
        user = User.query.filter_by(email=request.form.get('email')).first()
        if user and bcrypt.check_password_hash(user.password_hash, request.form.get('password')):
            session['username'] = user.username
            flash('You have been logged in!', 'success')
            return redirect(url_for('my_profile'))
        else:
            flash('Login Unsuccessful. Please check email and password.', 'danger')
    return render_template('login.html', title='Login')

@app.route("/logout")
def logout():
    session.pop('username', None)
    flash('You have been logged out.', 'info')
    return redirect(url_for('home'))

@app.route('/profile')
def my_profile():
    if 'username' in session:
        return redirect(url_for('profile', username=session['username']))
    return redirect(url_for('login'))

@app.route("/profile/<string:username>")
def profile(username):
    user = User.query.filter_by(username=username).first_or_404()
    # Note: We will add picks and stats calculation back later.
    # For now, we just need the page to load.
    return render_template('profile.html', title=user.username, user=user)

# --- START THE APP ---
if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)
