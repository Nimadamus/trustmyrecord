const express = require('express');
const router = express.Router();

// Get all active polls
router.get('/', async (req, res) => {
    try {
        const { status = 'active', category } = req.query;

        let query = `
            SELECT p.*, u.username as created_by_username
            FROM polls p
            LEFT JOIN users u ON p.created_by = u.id
            WHERE p.status = $1
        `;
        const params = [status];

        if (category) {
            query += ` AND p.category = $${params.length + 1}`;
            params.push(category);
        }

        query += ' ORDER BY p.created_at DESC';

        const result = await req.app.locals.pool.query(query, params);

        // Check if user has voted
        if (req.user) {
            for (let poll of result.rows) {
                const voteCheck = await req.app.locals.pool.query(
                    'SELECT * FROM poll_votes WHERE poll_id = $1 AND user_id = $2',
                    [poll.id, req.user.userId]
                );
                poll.has_voted = voteCheck.rows.length > 0;
                poll.user_vote = voteCheck.rows[0]?.selected_option || null;
            }
        }

        res.json({ polls: result.rows });
    } catch (error) {
        console.error('Get polls error:', error);
        res.status(500).json({ error: 'Failed to get polls' });
    }
});

// Vote on poll
router.post('/:id/vote', async (req, res) => {
    try {
        const poll_id = req.params.id;
        const { selected_option } = req.body;
        const user_id = req.user.userId;

        // Check poll exists and is active
        const poll = await req.app.locals.pool.query(
            'SELECT * FROM polls WHERE id = $1 AND status = $2',
            [poll_id, 'active']
        );

        if (poll.rows.length === 0) {
            return res.status(404).json({ error: 'Poll not found or not active' });
        }

        const p = poll.rows[0];

        // Check if already voted
        const existing = await req.app.locals.pool.query(
            'SELECT * FROM poll_votes WHERE poll_id = $1 AND user_id = $2',
            [poll_id, user_id]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Already voted on this poll' });
        }

        // Check if correct
        const is_correct = p.correct_option === selected_option;
        const points_earned = is_correct ? p.points : 0;

        // Record vote
        await req.app.locals.pool.query(
            `INSERT INTO poll_votes (poll_id, user_id, selected_option, is_correct, points_earned)
             VALUES ($1, $2, $3, $4, $5)`,
            [poll_id, user_id, selected_option, is_correct, points_earned]
        );

        // Update poll vote count
        await req.app.locals.pool.query(
            'UPDATE polls SET total_votes = total_votes + 1 WHERE id = $1',
            [poll_id]
        );

        // Update user stats
        await req.app.locals.pool.query(
            `UPDATE users SET 
                poll_points = poll_points + $1,
                total_polls_answered = total_polls_answered + 1
             WHERE id = $2`,
            [points_earned, user_id]
        );

        res.json({ 
            message: 'Vote recorded',
            is_correct,
            points_earned
        });
    } catch (error) {
        console.error('Vote error:', error);
        res.status(500).json({ error: 'Failed to record vote' });
    }
});

// Get poll results
router.get('/:id/results', async (req, res) => {
    try {
        const poll_id = req.params.id;

        const poll = await req.app.locals.pool.query(
            'SELECT * FROM polls WHERE id = $1',
            [poll_id]
        );

        if (poll.rows.length === 0) {
            return res.status(404).json({ error: 'Poll not found' });
        }

        // Get vote counts by option
        const votes = await req.app.locals.pool.query(
            `SELECT selected_option, COUNT(*) as count
             FROM poll_votes
             WHERE poll_id = $1
             GROUP BY selected_option`,
            [poll_id]
        );

        res.json({
            poll: poll.rows[0],
            votes: votes.rows
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get results' });
    }
});

// Create poll (admin/creator)
router.post('/', async (req, res) => {
    try {
        const { question, options, correct_option, sport, category, points, end_date } = req.body;
        const user_id = req.user.userId;

        const result = await req.app.locals.pool.query(
            `INSERT INTO polls (question, options, correct_option, sport, category, points, end_date, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [question, JSON.stringify(options), correct_option, sport, category, points || 10, end_date, user_id]
        );

        res.status(201).json({ poll: result.rows[0] });
    } catch (error) {
        console.error('Create poll error:', error);
        res.status(500).json({ error: 'Failed to create poll' });
    }
});

module.exports = router;
