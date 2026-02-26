const express = require('express');
const router = express.Router();

// Get all trivia games
router.get('/games', async (req, res) => {
    try {
        const { status = 'active', category } = req.query;

        let query = `
            SELECT g.*, u.username as created_by_username,
                   (SELECT COUNT(*) FROM trivia_results WHERE game_id = g.id) as total_players
            FROM trivia_games g
            LEFT JOIN users u ON g.created_by = u.id
            WHERE g.status = $1
        `;
        const params = [status];

        if (category) {
            query += ` AND g.category = $${params.length + 1}`;
            params.push(category);
        }

        query += ' ORDER BY g.created_at DESC';

        const result = await req.app.locals.pool.query(query, params);
        res.json({ games: result.rows });
    } catch (error) {
        console.error('Get trivia games error:', error);
        res.status(500).json({ error: 'Failed to get trivia games' });
    }
});

// Get trivia game with questions
router.get('/games/:id', async (req, res) => {
    try {
        const game_id = req.params.id;

        const game = await req.app.locals.pool.query(
            'SELECT * FROM trivia_games WHERE id = $1',
            [game_id]
        );

        if (game.rows.length === 0) {
            return res.status(404).json({ error: 'Game not found' });
        }

        const questions = await req.app.locals.pool.query(
            `SELECT id, question, options, points, order_index
             FROM trivia_questions
             WHERE game_id = $1
             ORDER BY order_index`,
            [game_id]
        );

        res.json({
            game: game.rows[0],
            questions: questions.rows
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get game' });
    }
});

// Submit trivia results
router.post('/games/:id/submit', async (req, res) => {
    try {
        const game_id = req.params.id;
        const { score, correct_answers, total_questions, time_taken } = req.body;
        const user_id = req.user.userId;

        // Check if already played
        const existing = await req.app.locals.pool.query(
            'SELECT * FROM trivia_results WHERE game_id = $1 AND user_id = $2',
            [game_id, user_id]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Already completed this trivia' });
        }

        // Calculate rank
        const betterScores = await req.app.locals.pool.query(
            'SELECT COUNT(*) as count FROM trivia_results WHERE game_id = $1 AND score > $2',
            [game_id, score]
        );
        const rank = parseInt(betterScores.rows[0].count) + 1;

        const result = await req.app.locals.pool.query(
            `INSERT INTO trivia_results (game_id, user_id, score, correct_answers, total_questions, time_taken, rank)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [game_id, user_id, score, correct_answers, total_questions, time_taken, rank]
        );

        // Update user stats
        await req.app.locals.pool.query(
            `UPDATE users SET 
                trivia_points = trivia_points + $1,
                total_trivia_played = total_trivia_played + 1
             WHERE id = $2`,
            [score, user_id]
        );

        res.json({
            result: result.rows[0],
            message: 'Trivia completed!',
            rank
        });
    } catch (error) {
        console.error('Submit trivia error:', error);
        res.status(500).json({ error: 'Failed to submit results' });
    }
});

// Get trivia leaderboard
router.get('/games/:id/leaderboard', async (req, res) => {
    try {
        const game_id = req.params.id;

        const results = await req.app.locals.pool.query(
            `SELECT r.*, u.username, u.avatar
             FROM trivia_results r
             JOIN users u ON r.user_id = u.id
             WHERE r.game_id = $1
             ORDER BY r.score DESC, r.time_taken ASC
             LIMIT 100`,
            [game_id]
        );

        res.json({ leaderboard: results.rows });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get leaderboard' });
    }
});

// Get user's trivia history
router.get('/my-results', async (req, res) => {
    try {
        const user_id = req.user.userId;

        const results = await req.app.locals.pool.query(
            `SELECT r.*, g.title as game_title, g.category
             FROM trivia_results r
             JOIN trivia_games g ON r.game_id = g.id
             WHERE r.user_id = $1
             ORDER BY r.completed_at DESC`,
            [user_id]
        );

        res.json({ results: results.rows });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get results' });
    }
});

module.exports = router;
