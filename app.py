from flask import Flask, render_template, request, redirect, url_for, flash
from extensions import db, migrate, login_manager
from models import User, Team, Pick, UserStats
# Other necessary imports...

def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = 'a-very-secret-key-for-the-empire'
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///trustmyrecord.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    login_manager.login_view = 'login'

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    # All other routes (register, grade_picks, submit_pick, etc.) go here...
    
    @app.route('/profile/<string:username>')
    def profile(username):
        user = User.query.filter_by(username=username).first_or_404()
        stats = user.stats  # Fetch stats directly from the relationship
        picks = Pick.query.filter_by(user_id=user.id).order_by(Pick.submission_timestamp.desc()).all()
        return render_template('profile.html', user=user, stats=stats, picks=picks)

    return app
