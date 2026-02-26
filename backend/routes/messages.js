const express = require('express');
const router = express.Router();

// Get all conversations for user
router.get('/conversations', async (req, res) => {
    try {
        const user_id = req.user.userId;

        const result = await req.app.locals.pool.query(
            `SELECT c.*, 
                    cp.last_read_at,
                    (SELECT COUNT(*) FROM messages m 
                     WHERE m.conversation_id = c.id 
                     AND m.sender_id != $1
                     AND m.created_at > cp.last_read_at) as unread_count,
                    (SELECT content FROM messages m 
                     WHERE m.conversation_id = c.id 
                     ORDER BY m.created_at DESC LIMIT 1) as last_message,
                    (SELECT created_at FROM messages m 
                     WHERE m.conversation_id = c.id 
                     ORDER BY m.created_at DESC LIMIT 1) as last_message_at,
                    (SELECT json_agg(json_build_object(
                        'id', u.id,
                        'username', u.username,
                        'avatar', u.avatar
                    )) FROM conversation_participants cpp
                    JOIN users u ON cpp.user_id = u.id
                    WHERE cpp.conversation_id = c.id AND u.id != $1) as participants
            FROM conversations c
            JOIN conversation_participants cp ON c.id = cp.conversation_id
            WHERE cp.user_id = $1
            ORDER BY c.last_message_at DESC`,
            [user_id]
        );

        res.json({ conversations: result.rows });
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({ error: 'Failed to get conversations' });
    }
});

// Get or create direct conversation with user
router.post('/conversations/direct', async (req, res) => {
    try {
        const { user_id: other_user_id } = req.body;
        const user_id = req.user.userId;

        // Check for existing direct conversation
        const existing = await req.app.locals.pool.query(
            `SELECT c.* FROM conversations c
             JOIN conversation_participants cp1 ON c.id = cp1.conversation_id AND cp1.user_id = $1
             JOIN conversation_participants cp2 ON c.id = cp2.conversation_id AND cp2.user_id = $2
             WHERE c.type = 'direct'`,
            [user_id, other_user_id]
        );

        if (existing.rows.length > 0) {
            return res.json({ conversation: existing.rows[0] });
        }

        // Get other user's info for title
        const otherUser = await req.app.locals.pool.query(
            'SELECT username FROM users WHERE id = $1',
            [other_user_id]
        );

        if (otherUser.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Create new conversation
        const conversation = await req.app.locals.pool.query(
            `INSERT INTO conversations (type, title, created_by)
             VALUES ('direct', $1, $2)
             RETURNING *`,
            [otherUser.rows[0].username, user_id]
        );

        const conv_id = conversation.rows[0].id;

        // Add participants
        await req.app.locals.pool.query(
            `INSERT INTO conversation_participants (conversation_id, user_id)
             VALUES ($1, $2), ($1, $3)`,
            [conv_id, user_id, other_user_id]
        );

        res.status(201).json({ conversation: conversation.rows[0] });
    } catch (error) {
        console.error('Create conversation error:', error);
        res.status(500).json({ error: 'Failed to create conversation' });
    }
});

// Get messages in conversation
router.get('/conversations/:id/messages', async (req, res) => {
    try {
        const conversation_id = req.params.id;
        const user_id = req.user.userId;
        const { limit = 50, before } = req.query;

        // Check user is participant
        const participant = await req.app.locals.pool.query(
            'SELECT * FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
            [conversation_id, user_id]
        );

        if (participant.rows.length === 0) {
            return res.status(403).json({ error: 'Not a participant in this conversation' });
        }

        let query = `
            SELECT m.*, u.username as sender_username, u.avatar as sender_avatar
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.conversation_id = $1 AND m.is_deleted = false
        `;
        const params = [conversation_id];

        if (before) {
            query += ` AND m.created_at < $${params.length + 1}`;
            params.push(before);
        }

        query += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const result = await req.app.locals.pool.query(query, params);

        // Mark messages as read
        await req.app.locals.pool.query(
            `UPDATE conversation_participants 
             SET last_read_at = NOW() 
             WHERE conversation_id = $1 AND user_id = $2`,
            [conversation_id, user_id]
        );

        res.json({ messages: result.rows.reverse() });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Failed to get messages' });
    }
});

// Send message
router.post('/conversations/:id/messages', async (req, res) => {
    try {
        const conversation_id = req.params.id;
        const { content, message_type = 'text', media_url, reply_to } = req.body;
        const sender_id = req.user.userId;

        // Check user is participant
        const participant = await req.app.locals.pool.query(
            'SELECT * FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
            [conversation_id, sender_id]
        );

        if (participant.rows.length === 0) {
            return res.status(403).json({ error: 'Not a participant in this conversation' });
        }

        const result = await req.app.locals.pool.query(
            `INSERT INTO messages (conversation_id, sender_id, content, message_type, media_url, reply_to)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [conversation_id, sender_id, content, message_type, media_url, reply_to]
        );

        // Update conversation last_message_at
        await req.app.locals.pool.query(
            'UPDATE conversations SET last_message_at = NOW() WHERE id = $1',
            [conversation_id]
        );

        // Create notifications for other participants
        const otherParticipants = await req.app.locals.pool.query(
            `SELECT user_id FROM conversation_participants 
             WHERE conversation_id = $1 AND user_id != $2`,
            [conversation_id, sender_id]
        );

        for (const p of otherParticipants.rows) {
            await req.app.locals.pool.query(
                `INSERT INTO notifications (user_id, type, title, message, data)
                 VALUES ($1, 'message', 'New Message', $2, $3)`,
                [p.user_id, `${req.user.username} sent you a message`,
                 JSON.stringify({ conversation_id, message_id: result.rows[0].id })]
            );
        }

        res.status(201).json({ message: result.rows[0] });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Edit message
router.patch('/messages/:id', async (req, res) => {
    try {
        const message_id = req.params.id;
        const { content } = req.body;
        const user_id = req.user.userId;

        const message = await req.app.locals.pool.query(
            'SELECT * FROM messages WHERE id = $1',
            [message_id]
        );

        if (message.rows.length === 0) {
            return res.status(404).json({ error: 'Message not found' });
        }

        if (message.rows[0].sender_id !== user_id) {
            return res.status(403).json({ error: 'Not authorized to edit this message' });
        }

        const result = await req.app.locals.pool.query(
            `UPDATE messages SET content = $1, is_edited = true, edited_at = NOW()
             WHERE id = $2 RETURNING *`,
            [content, message_id]
        );

        res.json({ message: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: 'Failed to edit message' });
    }
});

// Delete message (soft delete)
router.delete('/messages/:id', async (req, res) => {
    try {
        const message_id = req.params.id;
        const user_id = req.user.userId;

        const message = await req.app.locals.pool.query(
            'SELECT * FROM messages WHERE id = $1',
            [message_id]
        );

        if (message.rows.length === 0) {
            return res.status(404).json({ error: 'Message not found' });
        }

        if (message.rows[0].sender_id !== user_id) {
            return res.status(403).json({ error: 'Not authorized to delete this message' });
        }

        await req.app.locals.pool.query(
            'UPDATE messages SET is_deleted = true WHERE id = $1',
            [message_id]
        );

        res.json({ message: 'Message deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete message' });
    }
});

// Get unread message count
router.get('/unread-count', async (req, res) => {
    try {
        const user_id = req.user.userId;

        const result = await req.app.locals.pool.query(
            `SELECT COUNT(*) as count
             FROM conversation_participants cp
             JOIN messages m ON cp.conversation_id = m.conversation_id
             WHERE cp.user_id = $1
             AND m.sender_id != $1
             AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
             AND m.is_deleted = false`,
            [user_id]
        );

        res.json({ unread_count: parseInt(result.rows[0].count) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get unread count' });
    }
});

module.exports = router;
