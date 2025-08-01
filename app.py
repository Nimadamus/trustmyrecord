from flask import Flask, render_template, redirect, url_for, flash, request
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from datetime import datetime

# --- App & DB Initialization ---
app = Flask(__name__)
app.config['SECRET_KEY'] = 'a-secret-key-that-should-be-changed' # IMPORTANT: Change this!
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///trustmyrecord.db' # Using SQLite for now
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

# --- Import Models After db is Initialized ---
from models import User, Team, Pick

# --- User Loader for Flask-Login ---
@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# ==========================================================
#  PAGE ROUTES
# ==========================================================

@app.route('/')
def index():
    return render_template('index.html')

# --- User & Session Routes ---

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

# --- Profile Routes ---

@app.route('/profile/<string:username>')
def profile(username):
    user = User.query.filter_by(username=username).first_or_404()
    
    # ===> UPGRADE: We now also fetch the user's picks <===
    # We order by the submission timestamp in descending order (newest first)
    picks = Pick.query.filter_by(user_id=user.id).order_by(Pick.submission_timestamp.desc()).all()
    
    # We pass both the user and their picks to the template
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

# --- Pick Submission Route ---

@app.route('/pick/new', methods=['GET', 'POST'])
@login_required
def make_pick():
    if request.method == 'POST':
        event_timestamp_str = request.form.get('event_timestamp')
        event_timestamp = datetime.strptime(event_timestamp_str, '%Y-%m-%dT%H:%M')

        new_pick = Pick(
            user_id=current_user.id,
            sport=request.form.get('sport'),
            event_details=request.form.get('event_details'),
            pick_selection=request.form.get('pick_selection'),
            stake_units=float(request.form.get('stake_units')),
            odds=int(request.form.get('odds')),
            event_timestamp=event_timestamp
        )

        db.session.add(new_pick)
        db.session.commit()

        flash('Your pick has been successfully recorded to the ledger!', 'success')
        return redirect(url_for('profile', username=current_user.username))

    return render_template('make_pick.html')

# --- Main Application Runner ---
if __name__ == '__main__':
    app.run(debug=True)```

---

### Step 2: Upgrading the Frontend (`profile.html`)

Now we upgrade the profile page itself. We will replace the placeholder "Pick History" section with a dynamic table that lists every pick passed to it from our upgraded backend.

**Your Instruction:**
1.  In GitHub, navigate to and open your `templates/profile.html` file.
2.  Select and **delete everything** inside it.
3.  Copy the entire code block below.
4.  Paste it into the now-empty `profile.html` file.
5.  Save and commit the changes.

```html
{% extends "layout.html" %}

{% block title %}{{ user.username }}'s Profile - TrustMyRecord{% endblock %}

{% block content %}
<div class="container page-container">

    <div class="profile-card">
        <!-- The profile header section remains the same -->
        <div class="profile-card-header">
            <div class="profile-avatar-container">
                <div class="profile-avatar"><span>{{ user.username[0]|upper }}</span></div>
            </div>
            <div class="profile-identity">
                <div class="profile-identity-top-row">
                    <h1 class="profile-username">{{ user.username }}</h1>
                    {% if current_user.is_authenticated and current_user.id == user.id %}
                        <a href="{{ url_for('edit_profile') }}" class="btn btn-secondary btn-sm">Edit Profile</a>
                    {% endif %}
                </div>
                <div class="profile-meta">
                    <span>{{ user.email }}</span>
                    {% if user.favorite_team %}
                        <span class="team-allegiance">Favorite Team: <strong>{{ user.favorite_team.name }}</strong></span>
                    {% endif %}
                </div>
            </div>
        </div>
        <!-- The stats grid remains a placeholder for now -->
        <div class="profile-stats-grid">
            <div class="stat-box"><span class="stat-label">ROI</span><span class="stat-value roi-positive">TBD</span></div>
            <div class="stat-box"><span class="stat-label">UNITS</span><span class="stat-value units-positive">TBD</span></div>
            <div class="stat-box"><span class="stat-label">WIN %</span><span class="stat-value">TBD</span></div>
            <div class="stat-box"><span class="stat-label">RECORD</span><span class="stat-value">TBD</span></div>
            <div class="stat-box"><span class="stat-label">TOTAL PICKS</span><span class="stat-value">TBD</span></div>
        </div>
    </div>

    <!-- User Bio Section remains the same -->
    <div class="profile-section">
        <h2 class="section-title">User Bio</h2>
        <div class="content-box">
            <p>{{ user.bio or 'This user has not written a bio yet.' }}</p>
        </div>
    </div>
    
    <!-- ===> UPGRADE: The Pick History placeholder is replaced with a dynamic table <=== -->
    <div class="profile-section">
        <h2 class="section-title">Pick History</h2>
        <div class="content-box">
            {% if picks %}
                <table class="table-modern">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Event</th>
                            <th>Pick</th>
                            <th>Odds</th>
                            <th>Units</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {% for pick in picks %}
                            <tr>
                                <td data-label="Date">{{ pick.submission_timestamp.strftime('%Y-%m-%d') }}</td>
                                <td data-label="Event">{{ pick.event_details }}</td>
                                <td data-label="Pick">{{ pick.pick_selection }}</td>
                                <td data-label="Odds">{{ '%+d'|format(pick.odds) }}</td>
                                <td data-label="Units">{{ pick.stake_units }}</td>
                                <td data-label="Status">
                                    <span class="status-badge status-{{ pick.status|lower }}">{{ pick.status }}</span>
                                </td>
                            </tr>
                        {% endfor %}
                    </tbody>
                </table>
            {% else %}
                <p>This user has not recorded any picks yet.</p>
            {% endif %}
        </div>
    </div>

</div>
{% endblock %}
