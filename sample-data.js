
// Sample data initialization for TrustMyRecord demo
(function() {
    // Only add sample data if no data exists
    if (localStorage.getItem('tmr_picks') || localStorage.getItem('tmr_sample_data_added')) return;
    
    const sampleUser = { username: 'demo_user', email: 'demo@trustmyrecord.com' };
    localStorage.setItem('tmr_current_user', JSON.stringify(sampleUser));
    localStorage.setItem('tmr_is_logged_in', 'true');
    
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    
    const samplePicks = [
        {
            id: 'pick_' + Date.now() + '_1',
            user_id: 'demo_user',
            game_id: '401671888',
            sport: 'NBA',
            league: 'NBA',
            home_team: 'Boston Celtics',
            away_team: 'Los Angeles Lakers',
            selection: 'Boston Celtics',
            bet_type: 'spread',
            line_snapshot: -6.5,
            odds_snapshot: -110,
            units: 2,
            status: 'pending',
            profit: 0,
            created_at: now.toISOString(),
            game_date: tomorrow.toISOString().split('T')[0],
            notes: 'Celtics strong at home'
        },
        {
            id: 'pick_' + Date.now() + '_2',
            user_id: 'demo_user',
            game_id: '401671889',
            sport: 'NBA',
            league: 'NBA',
            home_team: 'Golden State Warriors',
            away_team: 'Phoenix Suns',
            selection: 'Over 228.5',
            bet_type: 'total',
            line_snapshot: 228.5,
            odds_snapshot: -110,
            units: 1,
            status: 'pending',
            profit: 0,
            created_at: now.toISOString(),
            game_date: tomorrow.toISOString().split('T')[0],
            notes: 'Both teams playing fast'
        },
        {
            id: 'pick_' + Date.now() + '_3',
            user_id: 'demo_user',
            game_id: '401671890',
            sport: 'NBA',
            league: 'NBA',
            home_team: 'Denver Nuggets',
            away_team: 'Dallas Mavericks',
            selection: 'Denver Nuggets',
            bet_type: 'moneyline',
            odds_snapshot: -140,
            units: 1.5,
            status: 'win',
            profit: 1.07,
            created_at: twoDaysAgo.toISOString(),
            game_date: yesterday.toISOString().split('T')[0],
            notes: 'MVP performance from Jokic'
        },
        {
            id: 'pick_' + Date.now() + '_4',
            user_id: 'demo_user',
            game_id: '401671891',
            sport: 'NBA',
            league: 'NBA',
            home_team: 'Milwaukee Bucks',
            away_team: 'Miami Heat',
            selection: 'Milwaukee Bucks -8',
            bet_type: 'spread',
            line_snapshot: -8,
            odds_snapshot: -110,
            units: 1,
            status: 'loss',
            profit: -1.0,
            created_at: twoDaysAgo.toISOString(),
            game_date: yesterday.toISOString().split('T')[0],
            notes: 'Heat kept it close'
        }
    ];
    
    localStorage.setItem('tmr_picks', JSON.stringify(samplePicks));
    
    // Sample forum threads
    const sampleThreads = [
        {
            id: 'thread_1',
            categoryId: 'nfl',
            title: 'Super Bowl LVIII Predictions',
            authorId: 'demo_user',
            authorUsername: 'demo_user',
            content: 'Who do you all have winning the big game? I'm leaning towards the Chiefs but the 49ers defense is no joke.',
            timestamp: twoDaysAgo.toISOString(),
            lastActivityTime: now.toISOString(),
            replyCount: 3,
            views: 156,
            replies: []
        },
        {
            id: 'thread_2',
            categoryId: 'nba',
            title: 'Best value bets this week?',
            authorId: 'sportsfan99',
            authorUsername: 'sportsfan99',
            content: 'Looking for some underdog picks. What's everyone liking?',
            timestamp: yesterday.toISOString(),
            lastActivityTime: yesterday.toISOString(),
            replyCount: 8,
            views: 89,
            replies: []
        }
    ];
    
    localStorage.setItem('tmr_forum_threads', JSON.stringify(sampleThreads));
    localStorage.setItem('tmr_sample_data_added', 'true');
    
    console.log('TrustMyRecord: Sample data loaded');
})();
