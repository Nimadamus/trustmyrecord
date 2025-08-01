# Make sure to import the Team model at the top of your file:
# from .models import User, Team

@app.route('/profile/edit', methods=['GET', 'POST'])
@login_required
def edit_profile():
    if request.method == 'POST':
        # Update standard user info
        current_user.username = request.form.get('username', current_user.username)
        current_user.bio = request.form.get('bio', current_user.bio)

        # Update the user's chosen team
        team_id = request.form.get('favorite_team')
        current_user.favorite_team_id = int(team_id) if team_id else None

        # Logic for profile picture upload would go here

        db.session.commit()
        flash('Your profile has been updated successfully!', 'success')
        return redirect(url_for('profile', username=current_user.username))

    # On a GET request, fetch all teams to populate the form's dropdown
    teams = Team.query.order_by(Team.league, Team.name).all()
    return render_template('edit_profile.html', user=current_user, teams=teams)
