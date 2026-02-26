const express = require('express');
const router = express.Router();

// Get comprehensive user profile with stats
router.get('/:username/stats', async (req, res) => {
    try {
        const { username } = req.params;

        // Get basic user info
        const userResult = await req.app.locals.pool.query(
            `SELECT id, username, avatar, bio, location, website, twitter,
                    created_at, units, record, streak,
                    poll_points, trivia_points, 
                    total_polls_answered, total_trivia_played,
                    competitions_won, competitions_lost,
                    challenges_won, challenges_lost,
                    total_picks, win_percentage
             FROM users WHERE username = $1`,
            [username]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];

        // Get followers count
        const followersResult = await req.app.locals.pool.query(
            'SELECT COUNT(*) as count FROM follows WHERE following_id = $1',
            [user.id]
        );

        // Get following count
        const followingResult = await req.app.locals.pool.query(
            'SELECT COUNT(*) as count FROM follows WHERE follower_id = $1',
            [user.id]
        );

        // Get friends count (mutual follows)
        const friendsResult = await req.app.locals.pool.query(
            `SELECT COUNT(*) as count 
             FROM follows f1
             JOIN follows f2 ON f1.follower_id = f2.following_id 
                            AND f1.following_id = f2.follower_id
             WHERE f1.follower_id = $1`,
            [user.id]
        );

        // Get competition stats
        const competitionStats = await req.app.locals.pool.query(
            `SELECT 
                COUNT(*) as total_entered,
                COUNT(CASE WHEN final_rank = 1 THEN 1 END) as first_places,
                COUNT(CASE WHEN final_rank <= 3 THEN 1 END) as podium_finishes,
                SUM(prize_amount) as total_winnings,
                AVG(final_rank) as average_rank
             FROM competition_results
             WHERE user_id = $1`,
            [user.id]
        );

        // Get challenge stats
        const challengeStats = await req.app.locals.pool.query(
            `SELECT 
                COUNT(CASE WHEN status = 'completed' AND winner_id = $1 THEN 1 END) as won,
                COUNT(CASE WHEN status = 'completed' AND winner_id != $1 THEN 1 END) as lost,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                COUNT(CASE WHEN status = 'accepted' THEN 1 END) as active
             FROM challenges
             WHERE challenger_id = $1 OR challenged_id = $1`,
            [user.id]
        );

        // Get picks stats by sport
        const picksBySport = await req.app.locals.pool.query(
            `SELECT 
                sport,
                COUNT(*) as total,
                COUNT(CASE WHEN result = 'win' THEN 1 END) as wins,
                COUNT(CASE WHEN result = 'loss' THEN 1 END) as losses,
                COUNT(CASE WHEN result = 'push' THEN 1 END) as pushes
             FROM picks
             WHERE user_id = $1
             GROUP BY sport`,
            [user.id]
        );

        // Get recent activity
        const recentActivity = await req.app.locals.pool.query(
            `(SELECT 'pick' as type, id, sport as detail, created_at, 
                    CASE WHEN result = 'win' THEN 'won' 
                         WHEN result = 'loss' THEN 'lost' 
                         ELSE 'pending' END as result
             FROM picks WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'
             ORDER BY created_at DESC LIMIT 5)
            UNION ALL
            (SELECT 'competition' as type, c.id, c.name as detail, cr.completed_at as created_at,
                    'ranked #' || cr.final_rank as result
             FROM competition_results cr
             JOIN competitions c ON cr.competition_id = c.id
             WHERE cr.user_id = $1 AND cr.completed_at > NOW() - INTERVAL '30 days'
             ORDER BY cr.completed_at DESC LIMIT 5)
            UNION ALL
            (SELECT 'challenge' as type, id, type as detail, completed_at as created_at,
                    CASE WHEN winner_id = $1 THEN 'won' ELSE 'lost' END as result
             FROM challenges 
             WHERE (challenger_id = $1 OR challenged_id = $1) 
             AND status = 'completed' 
             AND completed_at > NOW() - INTERVAL '30 days'
             ORDER BY completed_at DESC LIMIT 5)
            ORDER BY created_at DESC LIMIT 10`,
            [user.id]
        );

        // Calculate additional stats
        const record = user.record || { wins: 0, losses: 0, pushes: 0 };
        const totalPicks = parseInt(record.wins || 0) + parseInt(record.losses || 0) + parseInt(record.pushes || 0);
        const winPercentage = totalPicks > 0 
            ? ((parseInt(record.wins || 0) / (totalPicks - parseInt(record.pushes || 0))) * 100).toFixed(1)
            : 0;

        res.json({
            profile: {
                ...user,
                followers_count: parseInt(followersResult.rows[0].count),
                following_count: parseInt(followingResult.rows[0].count),
                friends_count: parseInt(friendsResult.rows[0].count),
                total_picks: totalPicks,
                win_percentage: parseFloat(winPercentage)
            },
            competitions: competitionStats.rows[0],
            challenges: challengeStats.rows[0],
            picks_by_sport: picksBySport.rows,
            recent_activity: recentActivity.rows
        });

    } catch (error) {
        console.error('Get profile stats error:', error);
        res.status(500).json({ error: 'Failed to get profile stats' });
    }
});

// Get user's friends (mutual follows)
router.get('/:username/friends', async (req, res) => {
    try {
        const { username } = req.params;

        // Get user id
        const userResult = await req.app.locals.pool.query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user_id = userResult.rows[0].id;

        // Get mutual follows (friends)
        const friendsResult = await req.app.locals.pool.query(
            `SELECT u.id, u.username, u.avatar, u.bio, f1.created_at as friends_since
             FROM follows f1
             JOIN follows f2 ON f1.follower_id = f2.following_id 
                            AND f1.following_id = f2.follower_id
             JOIN users u ON f1.following_id = u.id
             WHERE f1.follower_id = $1
             ORDER BY f1.created_at DESC`,
            [user_id]
        );

        res.json({ friends: friendsResult.rows });
    } catch (error) {
        console.error('Get friends error:', error);
        res.status(500).json({ error: 'Failed to get friends' });
    }
});

// Get detailed competition history
router.get('/:username/competitions', async (req, res) => {
    try {
        const { username } = req.params;

        const userResult = await req.app.locals.pool.query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user_id = userResult.rows[0].id;

        const competitions = await req.app.locals.pool.query(
            `SELECT cr.*, c.name, c.type, c.start_date, c.end_date, c.prize_pool
             FROM competition_results cr
             JOIN competitions c ON cr.competition_id = c.id
             WHERE cr.user_id = $1
             ORDER BY cr.completed_at DESC`,
            [user_id]
        );

        res.json({ competitions: competitions.rows });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get competitions' });
    }
});

// Get detailed challenge history
router.get('/:username/challenges', async (req, res) => {
    try {
        const { username } = req.params;

        const userResult = await req.app.locals.pool.query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user_id = userResult.rows[0].id;

        const challenges = await req.app.locals.pool.query(
            `SELECT c.*, 
                    challenger.username as challenger_username,
                    challenged.username as challenged_username,
                    winner.username as winner_username
             FROM challenges c
             JOIN users challenger ON c.challenger_id = challenger.id
             JOIN users challenged ON c.challenged_id = challenged.id
             LEFT JOIN users winner ON c.winner_id = winner.id
             WHERE c.challenger_id = $1 OR c.challenged_id = $1
             ORDER BY c.created_at DESC`,
            [user_id]
        );

        res.json({ challenges: challenges.rows });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get challenges' });
    }
});

// Get poll and trivia stats
router.get('/:username/poll-trivia-stats', async (req, res) => {
    try {
        const { username } = req.params;

        const userResult = await req.app.locals.pool.query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user_id = userResult.rows[0].id;

        // Poll stats
        const pollStats = await req.app.locals.pool.query(
            `SELECT 
                COUNT(*) as total_votes,
                COUNT(CASE WHEN is_correct = true THEN 1 END) as correct_votes,
                SUM(points_earned) as total_points
             FROM poll_votes
             WHERE user_id = $1`,
            [user_id]
        );

        // Trivia stats
        const triviaStats = await req.app.locals.pool.query(
            `SELECT 
                COUNT(*) as games_played,
                SUM(score) as total_score,
                SUM(correct_answers) as total_correct,
                SUM(total_questions) as total_questions,
                AVG(score) as average_score,
                COUNT(CASE WHEN rank = 1 THEN 1 END) as first_places
             FROM trivia_results
             WHERE user_id = $1`,
            [user_id]
        );

        // Recent trivia results
        const recentTrivia = await req.app.locals.pool.query(
            `SELECT r.*, g.title, g.category
             FROM trivia_results r
             JOIN trivia_games g ON r.game_id = g.id
             WHERE r.user_id = $1
             ORDER BY r.completed_at DESC
             LIMIT 5`,
            [user_id]
        );

        // Recent poll votes
        const recentPolls = await req.app.locals.pool.query(
            `SELECT v.*, p.question, p.sport
             FROM poll_votes v
             JOIN polls p ON v.poll_id = p.id
             WHERE v.user_id = $1
             ORDER BY v.created_at DESC
             LIMIT 5`,
            [user_id]
        );

        res.json({
            polls: pollStats.rows[0],
            trivia: triviaStats.rows[0],
            recent_trivia: recentTrivia.rows,
            recent_polls: recentPolls.rows
        });

    } catch (error) {
        res.status(500).json({ error: 'Failed to get poll/trivia stats' });
    }
});

module.exports = router;
