from flask import Flask, render_template, redirect, url_for, flash, request
from flask_login import login_required, current_user, logout_user
from datetime import datetime
import click

# We import the extensions and models from our other files
from extensions import db, login_manager
from models import User, Team, Pick

def create_app(config_object='config.DevelopmentConfig'):
    """
    This is the application factory. It creates and configures the Flask app.
    This is the professional standard for structuring Flask applications.
    """
    app = Flask(__name__)
    # A config file would be better, but we'll set it directly for now
    app.config['SECRET_KEY'] = 'a-secret-key-that-should-be-changed'
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///trustmyrecord.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    # Initialize extensions with the app
    db.init_app(app)
    login_manager.init_app(app)

    # Register our functions and commands
    register_routes(app)
    register_commands(app)

    return app

def register_routes(app):
    """A dedicated function to register all our page routes."""

    @app.route('/')
    def index():
        return render_template('index.html')

    # (All the other routes go in here, attached to 'app')
    @app.route('/login', methods=['GET', 'POST'])
    def login():
        return render_template('login.html')

    @app.route('/register', methods=['GET', 'POST'])
    def register():
        return render_template('register.html')

    @app.route('/logout')
    @login_required
    def logout():
        logout_user()
        flash('You have been logged out.', 'success')
        return redirect(url_for('index'))
    
    @app.route('/profile/<string:username>')
    def profile(username):
        user = User.query.filter_by(username=username).first_or_404()
        picks = Pick.query.filter_by(user_id=user.id).order_by(Pick.submission_timestamp.desc()).all()
        return render_template('profile.html', user=user, picks=picks)

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

    @app.route('/pick/new', methods=['GET', 'POST'])
    @login_required
    def make_pick():
        if request.method == 'POST':
            event_timestamp_str = request.form.get('event_timestamp')
            event_timestamp = datetime.strptime(event_timestamp_str, '%Y-%m-%dT%H:%M')
            new_pick = Pick(
                user_id=current_user.id, sport=request.form.get('sport'),
                event_details=request.form.get('event_details'), pick_selection=request.form.get('pick_selection'),
                stake_units=float(request.form.get('stake_units')), odds=int(request.form.get('odds')),
                event_timestamp=event_timestamp
            )
            db.session.add(new_pick)
            db.session.commit()
            flash('Your pick has been successfully recorded to the ledger!', 'success')
            return redirect(url_for('profile', username=current_user.username))
        return render_template('make_pick.html')

def register_commands(app):
    """A dedicated function to register CLI commands."""
    
    @app.cli.command("create-admin")
    @click.argument("username")
    def create_admin(username):
        """Promotes an existing user to the admin role."""
        with app.app_context(): # Commands need to run within the app context to access the db
            user = User.query.filter_by(username=username).first()
            if user:
                user.role = 'admin'
                db.session.commit()
                print(f"Success: User '{username}' has been promoted to Admin.")
            else:
                print(f"Error: User '{username}' not found.")

# This is the entry point that Flask will use when you run `flask --app app.py ...`
app = create_app()
