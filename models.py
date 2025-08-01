# Add this new class to define the teams table
class Team(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    league = db.Column(db.String(20), nullable=False)
    name = db.Column(db.String(100), nullable=False, unique=True)
    logo_url = db.Column(db.String(255), nullable=True)

# Add these two new lines to your existing User model
class User(UserMixin, db.Model):
    # ... all your existing columns like id, username, email, password_hash ...

    # ADD THIS LINE:
    favorite_team_id = db.Column(db.Integer, db.ForeignKey('team.id'), nullable=True)

    # AND ADD THIS LINE:
    favorite_team = db.relationship('Team', backref='fans', lazy='select')
