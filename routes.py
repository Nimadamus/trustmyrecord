from flask import Blueprint, render_template, redirect, url_for, flash, request, jsonify
from flask_login import current_user, login_required
from extensions import db
import models # Import the models module directly
from forms import PickForm, ProfileEditForm, MessageForm, ForumPostForm, ReplyForm, GradePickForm
from mock_data import generate_mock_odds
from sqlalchemy import or_
from datetime import datetime
from stats_calculator import calculate_user_stats # Import the stats calculator
from sports_api import get_active_sports, get_odds

main = Blueprint('main', __name__)

@main.route('/admin')
@login_required
def admin_dashboard():
    if not current_user.is_admin:
        flash('You are not authorized to access this page.', 'danger')
        return redirect(url_for('main.home'))

    pending_picks = models.PendingPick.query.order_by(models.PendingPick.date_posted.desc()).all()
    return render_template('admin_dashboard.html', title='Admin Dashboard', pending_picks=pending_picks)

@main.route('/grade_pick/<int:pick_id>', methods=['GET', 'POST'])
@login_required
def grade_pick(pick_id):
    if not current_user.is_admin:
        flash('You are not authorized to access this page.', 'danger')
        return redirect(url_for('main.home'))

    pick = models.PendingPick.query.get_or_404(pick_id)
    form = GradePickForm()

    if form.validate_on_submit():
        graded_pick = models.GradedPick(
            sport=pick.sport,
            event_details=pick.event_details,
            pick_selection=pick.pick_selection,
            stake_units=pick.stake_units,
            odds=pick.odds,
            date_posted=pick.date_posted,
            user_id=pick.user_id,
            bet_type=pick.bet_type,
            potential_win=pick.potential_win,
            api_event_id=pick.api_event_id,
            market_key=pick.market_key,
            result=form.result.data,
            graded_timestamp=datetime.utcnow(),
            graded_odds=pick.odds,  # For simplicity
            final_score="N/A"
        )
        db.session.add(graded_pick)
        db.session.delete(pick)
        db.session.commit()
        flash('Pick has been graded!', 'success')
        return redirect(url_for('main.admin_dashboard'))

    return render_template('grade_pick.html', title='Grade Pick', form=form, pick=pick)

@main.route('/')
@main.route('/home')
def home():
    return render_template('home.html', title='Home')

@main.route('/profile/<int:user_id>')
@login_required
def profile(user_id):
    user = models.User.query.get_or_404(user_id)
    page = request.args.get('page', 1, type=int)

    # Fetch pending friend requests received by the current user
    pending_requests = models.FriendRequest.query.filter_by(receiver_id=current_user.id, status='pending').all()
    # Fetch accepted friend requests (friends)
    friends = models.User.query.join(models.FriendRequest, 
                              or_(models.FriendRequest.sender_id == models.User.id, models.FriendRequest.receiver_id == models.User.id))
    friends = friends.filter(or_(
        (models.FriendRequest.sender_id == current_user.id), 
        (models.FriendRequest.receiver_id == current_user.id)
    )).filter(models.FriendRequest.status == 'accepted').all()

    # Filter out the current user from the friends list
    friends = [friend for friend in friends if friend.id != current_user.id]

    # Calculate user stats
    user_stats = calculate_user_stats(user.id)

    # Filter picks based on whether it's the current user's profile or another user's
    if user.id == current_user.id:
        # Current user sees all their picks
        pending_picks_for_display = models.PendingPick.query.filter_by(user_id=user.id).order_by(models.PendingPick.date_posted.desc()).paginate(page=page, per_page=10)
        graded_picks_for_display = models.GradedPick.query.filter_by(user_id=user.id).order_by(models.GradedPick.date_posted.desc()).paginate(page=page, per_page=10)
    else:
        # Other users only see graded picks
        pending_picks_for_display = None
        graded_picks_for_display = models.GradedPick.query.filter_by(user_id=user.id).order_by(models.GradedPick.date_posted.desc()).paginate(page=page, per_page=10)

    return render_template('profile.html', title=f'{user.username}\'s Profile', user=user, 
                           pending_requests=pending_requests, friends=friends, user_stats=user_stats, pending_picks=pending_picks_for_display, graded_picks=graded_picks_for_display)


@main.route('/edit_profile', methods=['GET', 'POST'])
@login_required
def edit_profile():
    form = ProfileEditForm()
    if form.validate_on_submit():
        current_user.username = form.username.data
        current_user.favorite_team = form.favorite_team.data
        current_user.avatar_url = form.avatar_url.data
        current_user.email_private = form.email_private.data
        db.session.commit()
        flash('Your profile has been updated!', 'success')
        return redirect(url_for('main.profile', user_id=current_user.id))
    elif request.method == 'GET':
        form.username.data = current_user.username
        form.favorite_team.data = current_user.favorite_team
        form.avatar_url.data = current_user.avatar_url
        form.email_private.data = current_user.email_private
    return render_template('edit_profile.html', title='Edit Profile', form=form)

@main.route('/submit_pick', methods=['GET', 'POST'])
@login_required
def submit_pick():
    form = PickForm()
    if request.method == 'GET':
        form.sport.data = request.args.get('sport')
        form.event_details.data = request.args.get('event_details')
        form.pick_selection.data = request.args.get('pick_selection')
        form.odds.data = request.args.get('odds')

    if form.validate_on_submit():
        pick = models.PendingPick(
            sport=form.sport.data,
            event_details=form.event_details.data,
            pick_selection=form.pick_selection.data,
            stake_units=form.stake_units.data,
            odds=form.odds.data,
            author=current_user,
            bet_type=request.form.get('bet_type'),
            potential_win=request.form.get('potential_win', type=float),
            api_event_id=request.form.get('api_event_id'),
            market_key=request.form.get('market_key')
        )
        db.session.add(pick)
        db.session.commit()
        flash('Your pick has been submitted and is pending!', 'success')
        return redirect(url_for('main.profile', user_id=current_user.id))

    active_sports = get_active_sports()
    return render_template('submit_pick.html', title='Submit Pick', 
                           active_sports=active_sports, 
                           form=form,
                           bet_type=request.args.get('bet_type'),
                           api_event_id=request.args.get('api_event_id'),
                           market_key=request.args.get('market_key'))

from collections import defaultdict
from datetime import datetime # Import datetime for placeholder timestamps

@main.route('/forum')
def forum():
    sections = []

    # General Forums Section
    general_forums = [
        {"icon": "💬", "name": "General Discussion",
         "desc": "Talk about anything and everything.",
         "threads": 26278, "posts": 2639524,
         "last": {"title": "Site roadmap update",
                  "url": "/thread/123",
                  "user": "BetLegend",
                  "time": "Today 5:28 PM"}},
        {"icon": "🏈", "name": "Sports Betting",
         "desc": "Strategies, picks, bankroll talk.",
         "threads": 23010, "posts": 1002081,
         "last": {"title": "Live MLB card",
                  "url": "/thread/456",
                  "user": "Nima",
                  "time": "Today 6:59 PM"}},
        {"icon": "🏦", "name": "Online Sportsbooks",
         "desc": "Reviews, limits, payouts, promos.",
         "threads": 54292, "posts": 1780697,
         "last": {"title": "Limits discussion",
                  "url": "/thread/789",
                  "user": "Ape",
                  "time": "Today 1:43 PM"}},
        {"icon": "🪙", "name": "Crypto Investing",
         "desc": "Strategies for crypto allocations.",
         "threads": 695, "posts": 36867,
         "last": {"title": "BTC seasonality",
                  "url": "/thread/321",
                  "user": "Atlas",
                  "time": "Yesterday 9:44 PM"}},
        {"icon": "🎮", "name": "Online Gaming",
         "desc": "Casinos, tournaments, advantage play.",
         "threads": 8038, "posts": 240148,
         "last": {"title": "Craps dice sets",
                  "url": "/thread/654",
                  "user": "Chip",
                  "time": "Yesterday 11:57 AM"}},
        {"icon": "✈️", "name": "Travel",
         "desc": "Visa tips, destinations, digital nomad.",
         "threads": 31695, "posts": 1717191,
         "last": {"title": "Thailand notes",
                  "url": "/thread/987",
                  "user": "Nima",
                  "time": "Today 6:52 PM"}},
    ]
    sections.append({"id": "general-forums", "title": "General Forums", "forums": general_forums})

    # Sports Forums Section (dynamic)
    sports_forums_list = []
    active_sports = get_active_sports()
    if active_sports:
        for sport in active_sports:
            # Placeholder data for threads, posts, last post
            sports_forums_list.append({
                "icon": "⚽" if sport['group'] == 'Soccer' else "🏈", # Generic icon, can be improved
                "name": sport['title'],
                "key": sport['key'], # Use key for URL
                "desc": f"Discussions for {sport['title']} games and picks.",
                "threads": 1000, # Placeholder
                "posts": 50000,  # Placeholder
                "last": {"title": f"Latest {sport['title']} thread",
                         "url": f"/thread/{sport['key']}",
                         "user": "User",
                         "time": datetime.now().strftime("%m-%d %I:%M %p")} # Placeholder
            })
    sections.append({"id": "sports-forums", "title": "Sports Forums", "forums": sports_forums_list})

    return render_template("forum.html", sections=sections)

@main.route('/forum/<category_name>', methods=['GET', 'POST'])
@login_required
def forum_category(category_name):
    form = ForumPostForm()
    if form.validate_on_submit():
        post = models.Post(title=form.title.data, body=form.body.data, author=current_user, category=category_name)
        db.session.add(post)
        db.session.commit()
        flash('Your post has been added!', 'success')
        return redirect(url_for('main.forum_category', category_name=category_name))
    
    posts = models.Post.query.filter_by(category=category_name).order_by(models.Post.timestamp.desc()).all()
    
    # Create a dictionary to hold stats for each user
    user_stats = {}
    for post in posts:
        if post.author.id not in user_stats:
            user_stats[post.author.id] = calculate_user_stats(post.author.id)

    return render_template('forum_category.html', title=category_name.replace('_', ' ').title(), category_name=category_name, posts=posts, form=form, user_stats=user_stats)

@main.route('/post/<int:post_id>', methods=['GET', 'POST'])
@login_required
def post(post_id):
    post = models.Post.query.get_or_404(post_id)
    form = ReplyForm()
    if form.validate_on_submit():
        reply = models.Reply(body=form.body.data, author=current_user, post=post)
        db.session.add(reply)
        db.session.commit()
        flash('Your reply has been added!', 'success')
        return redirect(url_for('main.post', post_id=post.id))

    return render_template('post.html', title=post.title, post=post, form=form)

@main.route('/challenges')
def challenges():
    return render_template('challenges.html', title='Challenges')

@main.route('/live_odds')
def live_odds():
    return render_template('live_odds.html', title='Live Odds')

@main.route('/live_betting')
def live_betting():
    active_sports = get_active_sports()
    return render_template('live_betting.html', title='Live Betting', active_sports=active_sports)

@main.route('/api/live_odds/<sport_key>')
def api_live_odds(sport_key):
    market = request.args.get('market', 'h2h') # Default to h2h if not specified
    # Request odds specifically from DraftKings
    live_games = get_odds(sport_key, markets=market, bookmakers='draftkings')
    return jsonify(live_games)

@main.route('/soccer-leagues')
def soccer_leagues():
    active_sports = get_active_sports()
    soccer_leagues = []
    if active_sports:
        for sport in active_sports:
            if sport['group'] == 'Soccer':
                soccer_leagues.append(sport)
    return render_template('soccer_leagues.html', title='Soccer Leagues', soccer_leagues=soccer_leagues)

from collections import defaultdict

@main.route('/sports-grid')
def sports_grid():
    active_sports = get_active_sports()
    games_by_sport = {}
    if active_sports:
        for sport in active_sports:
            games = get_odds(sport['key'], bookmakers='draftkings', markets='h2h,spreads,totals')
            games_by_sport[sport['key']] = games
    
    grouped_sports = defaultdict(list)
    if active_sports:
        for sport in active_sports:
            grouped_sports[sport['group']].append(sport)

    return render_template('picks.html', title='Picks', grouped_sports=grouped_sports, games_by_sport=games_by_sport)

@main.route('/picks/<sport_name>')
@login_required
def sport_odds(sport_name):
    # Fetch real odds from The Odds API, filtered by DraftKings
    games = get_odds(sport_name, bookmakers='draftkings', markets='h2h,spreads,totals')
    
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return render_template('_games_display.html', sport_name=sport_name, games=games)
    return render_template('sport_odds.html', title=f'{sport_name.upper()} Odds', sport_name=sport_name, games=games)

@main.route('/send_friend_request/<int:receiver_id>', methods=['POST'])
@login_required
def send_friend_request(receiver_id):
    receiver = models.User.query.get_or_404(receiver_id)

    if receiver.id == current_user.id:
        flash('You cannot send a friend request to yourself.', 'danger')
        return redirect(url_for('main.profile'))

    # Check if request already exists or if they are already friends
    existing_request = models.FriendRequest.query.filter(
        or_(
            (models.FriendRequest.sender_id == current_user.id, models.FriendRequest.receiver_id == receiver.id),
            (models.FriendRequest.sender_id == receiver.id, models.FriendRequest.receiver_id == current_user.id)
        )
    ).first()

    if existing_request:
        if existing_request.status == 'pending':
            flash('Friend request already sent or received from this user.', 'info')
        elif existing_request.status == 'accepted':
            flash('You are already friends with this user.', 'info')
        return redirect(url_for('main.profile'))

    friend_request = models.FriendRequest(sender=current_user, receiver=receiver, status='pending')
    db.session.add(friend_request)
    db.session.commit()
    flash('Friend request sent!', 'success')
    return redirect(url_for('main.profile'))

@main.route('/accept_friend_request/<int:request_id>', methods=['POST'])
@login_required
def accept_friend_request(request_id):
    friend_request = models.FriendRequest.query.get_or_404(request_id)

    if friend_request.receiver_id != current_user.id:
        flash('You are not authorized to accept this request.', 'danger')
        return redirect(url_for('main.profile'))

    friend_request.status = 'accepted'
    db.session.commit()
    flash('Friend request accepted!', 'success')
    return redirect(url_for('main.profile'))

@main.route('/reject_friend_request/<int:request_id>', methods=['POST'])
@login_required
def reject_friend_request(request_id):
    friend_request = models.FriendRequest.query.get_or_404(request_id)

    if friend_request.receiver_id != current_user.id:
        flash('You are not authorized to reject this request.', 'danger')
        return redirect(url_for('main.profile'))

    db.session.delete(friend_request)
    db.session.commit()
    flash('Friend request rejected.', 'info')
    return redirect(url_for('main.profile'))

@main.route('/search_users', methods=['GET', 'POST'])
@login_required
def search_users():
    users = []
    if request.method == 'POST':
        search_term = request.form.get('search_term')
        if search_term:
            users = models.User.query.filter(models.User.username.ilike(f'%{search_term}%')).all()
            # Filter out current user and already friends/pending requests
            users = [u for u in users if u.id != current_user.id and 
                     not models.FriendRequest.query.filter(
                         or_(
                             (models.FriendRequest.sender_id == current_user.id, models.FriendRequest.receiver_id == u.id),
                             (models.FriendRequest.sender_id == u.id, models.FriendRequest.receiver_id == current_user.id)
                         )
                     ).first()]
    return render_template('search_users.html', title='Search Users', users=users)

@main.route('/send_message/<int:recipient_id>', methods=['GET', 'POST'])
@login_required
def send_message(recipient_id):
    recipient = models.User.query.get_or_404(recipient_id)
    form = MessageForm()
    if form.validate_on_submit():
        msg = models.Message(sender=current_user, receiver=recipient, body=form.body.data)
        db.session.add(msg)
        db.session.commit()
        flash('Your message has been sent!', 'success')
        return redirect(url_for('main.user_messages'))
    return render_template('send_message.html', title='Send Message', form=form, recipient=recipient)

@main.route('/messages')
@login_required
def user_messages():
    received_messages = models.Message.query.filter_by(receiver_id=current_user.id).order_by(models.Message.timestamp.desc()).all()
    sent_messages = models.Message.query.filter_by(sender_id=current_user.id).order_by(models.Message.timestamp.desc()).all()
    return render_template('messages.html', title='My Messages', received_messages=received_messages, sent_messages=sent_messages)

@main.route('/beat_the_founder')
@login_required
def beat_the_founder():
    return render_template('beat_the_founder.html', title='Beat The Founder')

@main.route('/chatroom')
@login_required
def chatroom():
    return render_template('chatroom.html', title='Chatroom')

@main.route('/api/chatroom/messages')
@login_required
def get_chat_messages():
    messages = models.ChatMessage.query.order_by(models.ChatMessage.timestamp.asc()).limit(50).all() # Get last 50 messages
    return jsonify([
        {
            'username': msg.user.username,
            'message': msg.message,
            'timestamp': msg.timestamp.strftime('%Y-%m-%d %H:%M:%S')
        } for msg in messages
    ])

@main.route('/api/chatroom/send', methods=['POST'])
@login_required
def send_chat_message():
    data = request.get_json()
    message_content = data.get('message')

    if message_content:
        new_message = models.ChatMessage(user_id=current_user.id, message=message_content)
        db.session.add(new_message)
        db.session.commit()
        return jsonify({'status': 'success'}), 201
    return jsonify({'status': 'error', 'message': 'Message content missing'}), 400
