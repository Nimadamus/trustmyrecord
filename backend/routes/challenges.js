const express = require('express');
const router = express.Router();

// Get all challenges for user
router.get('/', async (req, res) => {
    try {
        const user_id = req.user.userId;
        const { status, type } = req.query;

        let query = `
            SELECT c.*, 
                   challenger.username as challenger_username,
                   challenger.avatar as challenger_avatar,
                   challenged.username as challenged_username,
                   challenged.avatar as challenged_avatar,
                   winner.username as winner_username
            FROM challenges c
            JOIN users challenger ON c.challenger_id = challenger.id
            JOIN users challenged ON c.challenged_id = challenged.id
            LEFT JOIN users winner ON c.winner_id = winner.id
            WHERE c.challenger_id = $1 OR c.challenged_id = $1
        `;
        const params = [user_id];

        if (status) {
            query += ` AND c.status = $${params.length + 1}`;
            params.push(status);
        }

        if (type) {
            query += ` AND c.type = $${params.length + 1}`;
            params.push(type);
        }

        query += ' ORDER BY c.created_at DESC';

        const result = await req.app.locals.pool.query(query, params);
        res.json({ challenges: result.rows });
    } catch (error) {
        console.error('Get challenges error:', error);
        res.status(500).json({ error: 'Failed to get challenges' });
    }
});

// Create challenge
router.post('/', async (req, res) => {
    try {
        const { challenged_id, type, sport, description, stake_amount, start_date, end_date } = req.body;
        const challenger_id = req.user.userId;

        // Check if user exists
        const userCheck = await req.app.locals.pool.query(
            'SELECT id FROM users WHERE id = $1',
            [challenged_id]
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check for existing pending challenge
        const existing = await req.app.locals.pool.query(
            `SELECT * FROM challenges 
             WHERE ((challenger_id = $1 AND challenged_id = $2) OR (challenger_id = $2 AND challenged_id = $1))
             AND status = 'pending'`,
            [challenger_id, challenged_id]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Challenge already pending between users' });
        }

        const result = await req.app.locals.pool.query(
            `INSERT INTO challenges (challenger_id, challenged_id, type, sport, description, stake_amount, start_date, end_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [challenger_id, challenged_id, type || '1v1', sport, description, stake_amount || 0, start_date, end_date]
        );

        // Create notification
        await req.app.locals.pool.query(
            `INSERT INTO notifications (user_id, type, title, message, data)
             VALUES ($1, 'challenge', 'New Challenge!', $2, $3)`,
            [challenged_id, 
             `${req.user.username} challenged you to a ${type || '1v1'}!`,
             JSON.stringify({ challenge_id: result.rows[0].id, challenger_id })]
        );

        res.status(201).json({ challenge: result.rows[0] });
    } catch (error) {
        console.error('Create challenge error:', error);
        res.status(500).json({ error: 'Failed to create challenge' });
    }
});

// Accept challenge
router.post('/:id/accept', async (req, res) => {
    try {
        const challenge_id = req.params.id;
        const user_id = req.user.userId;

        const challenge = await req.app.locals.pool.query(
            'SELECT * FROM challenges WHERE id = $1',
            [challenge_id]
        );

        if (challenge.rows.length === 0) {
            return res.status(404).json({ error: 'Challenge not found' });
        }

        const c = challenge.rows[0];
        if (c.challenged_id !== user_id) {
            return res.status(403).json({ error: 'Not authorized to accept this challenge' });
        }

        if (c.status !== 'pending') {
            return res.status(400).json({ error: 'Challenge is not pending' });
        }

        await req.app.locals.pool.query(
            `UPDATE challenges SET status = 'accepted', accepted_at = NOW() WHERE id = $1`,
            [challenge_id]
        );

        // Notify challenger
        await req.app.locals.pool.query(
            `INSERT INTO notifications (user_id, type, title, message, data)
             VALUES ($1, 'challenge', 'Challenge Accepted!', $2, $3)`,
            [c.challenger_id,
             `${req.user.username} accepted your challenge!`,
             JSON.stringify({ challenge_id })]
        );

        res.json({ message: 'Challenge accepted' });
    } catch (error) {
        console.error('Accept challenge error:', error);
        res.status(500).json({ error: 'Failed to accept challenge' });
    }
});

// Decline challenge
router.post('/:id/decline', async (req, res) => {
    try {
        const challenge_id = req.params.id;
        const user_id = req.user.userId;

        const challenge = await req.app.locals.pool.query(
            'SELECT * FROM challenges WHERE id = $1',
            [challenge_id]
        );

        if (challenge.rows.length === 0) {
            return res.status(404).json({ error: 'Challenge not found' });
        }

        const c = challenge.rows[0];
        if (c.challenged_id !== user_id) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        await req.app.locals.pool.query(
            `UPDATE challenges SET status = 'declined' WHERE id = $1`,
            [challenge_id]
        );

        res.json({ message: 'Challenge declined' });
    } catch (error) {
        console.error('Decline challenge error:', error);
        res.status(500).json({ error: 'Failed to decline challenge' });
    }
});

// Complete challenge with winner
router.post('/:id/complete', async (req, res) => {
    try {
        const challenge_id = req.params.id;
        const { winner_id } = req.body;
        const user_id = req.user.userId;

        const challenge = await req.app.locals.pool.query(
            'SELECT * FROM challenges WHERE id = $1',
            [challenge_id]
        );

        if (challenge.rows.length === 0) {
            return res.status(404).json({ error: 'Challenge not found' });
        }

        const c = challenge.rows[0];
        if (c.challenger_id !== user_id && c.challenged_id !== user_id) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        // Update challenge
        await req.app.locals.pool.query(
            `UPDATE challenges SET status = 'completed', winner_id = $1, completed_at = NOW() WHERE id = $2`,
            [winner_id, challenge_id]
        );

        // Update user stats
        if (winner_id) {
            await req.app.locals.pool.query(
                'UPDATE users SET challenges_won = challenges_won + 1 WHERE id = $1',
                [winner_id]
            );
            
            const loser_id = winner_id === c.challenger_id ? c.challenged_id : c.challenger_id;
            await req.app.locals.pool.pool.query(
                'UPDATE users SET challenges_lost = challenges_lost + 1 WHERE id = $1',
                [loser_id]
            );
        }

        res.json({ message: 'Challenge completed' });
    } catch (error) {
        console.error('Complete challenge error:', error);
        res.status(500).json({ error: 'Failed to complete challenge' });
    }
});

module.exports = router;
