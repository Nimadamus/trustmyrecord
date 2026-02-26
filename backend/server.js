const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-change-in-production';

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/trustmyrecord',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Make pool available to routes
app.locals.pool = pool;

// Email transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || ''
    }
});

// Middleware
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || ['http://localhost:8000', 'http://127.0.0.1:8000'],
    credentials: true
}));
app.use(express.json());

// Rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: { error: 'Too many attempts, please try again later' }
});

// Helper functions
function generateTokens(user) {
    const accessToken = jwt.sign(
        { userId: user.id, email: user.email, username: user.username },
        JWT_SECRET,
        { expiresIn: '15m' }
    );
    const refreshToken = jwt.sign(
        { userId: user.id },
        JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
    );
    return { accessToken, refreshToken };
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

async function sendVerificationEmail(email, token, username) {
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:8000'}/verify-email.html?token=${token}`;
    
    const mailOptions = {
        from: process.env.FROM_EMAIL || 'noreply@trustmyrecord.com',
        to: email,
        subject: 'Verify Your Email - TrustMyRecord',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #ffd700;">Welcome to TrustMyRecord!</h2>
                <p>Hi ${username},</p>
                <p>Thank you for signing up. Please verify your email address to start making picks and joining competitions.</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${verificationUrl}" 
                       style="background: linear-gradient(135deg, #ffd700, #ffb700); 
                              color: #000; padding: 14px 32px; text-decoration: none; 
                              border-radius: 8px; font-weight: bold; display: inline-block;">
                        Verify Email Address
                    </a>
                </div>
                <p>Or copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
                <p style="color: #999; font-size: 12px;">This link expires in 24 hours.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="color: #666; font-size: 12px;">
                    If you didn't create an account, you can safely ignore this email.
                </p>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
}

// ============================================
// AUTH ROUTES
// ============================================

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Validation
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        if (username.length < 3 || username.length > 30) {
            return res.status(400).json({ error: 'Username must be 3-30 characters' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'Invalid email address' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        // Check if user exists
        const existingUser = await pool.query(
            'SELECT * FROM users WHERE email = $1 OR username = $2',
            [email.toLowerCase(), username.toLowerCase()]
        );

        if (existingUser.rows.length > 0) {
            const existing = existingUser.rows[0];
            if (existing.email === email.toLowerCase()) {
                return res.status(400).json({ error: 'Email already registered' });
            }
            return res.status(400).json({ error: 'Username already taken' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        const verificationToken = uuidv4();
        const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        // Create user
        const result = await pool.query(
            `INSERT INTO users (username, email, password_hash, email_verified, 
                               email_verification_token, email_verification_expires)
             VALUES ($1, $2, $3, false, $4, $5)
             RETURNING id, username, email, email_verified, created_at`,
            [username, email.toLowerCase(), hashedPassword, verificationToken, verificationExpires]
        );

        const user = result.rows[0];

        // Send verification email
        try {
            await sendVerificationEmail(email, verificationToken, username);
        } catch (emailError) {
            console.error('Failed to send verification email:', emailError);
            // Continue anyway - user can request resend
        }

        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(user);

        // Store refresh token
        await pool.query(
            'UPDATE users SET refresh_token = $1 WHERE id = $2',
            [refreshToken, user.id]
        );

        res.status(201).json({
            message: 'Registration successful. Please check your email to verify your account.',
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                email_verified: user.email_verified,
                created_at: user.created_at
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

// Login
app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Get user
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email.toLowerCase()]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = result.rows[0];

        // Check password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Check if email is verified (bypass in DEV_MODE)
        if (!user.email_verified && !DEV_MODE) {
            return res.status(403).json({ 
                error: 'Please verify your email before logging in',
                code: 'EMAIL_NOT_VERIFIED',
                email: user.email
            });
        }

        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(user);

        // Store refresh token
        await pool.query(
            'UPDATE users SET refresh_token = $1, last_login = NOW() WHERE id = $2',
            [refreshToken, user.id]
        );

        res.json({
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                email_verified: user.email_verified,
                units: user.units || 0,
                record: user.record || { wins: 0, losses: 0, pushes: 0 },
                streak: user.streak || 0,
                avatar: user.avatar
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
});

// Verify Email
app.get('/api/auth/verify-email', async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.status(400).json({ error: 'Verification token required' });
        }

        // Find user with this token
        const result = await pool.query(
            `SELECT * FROM users 
             WHERE email_verification_token = $1 
             AND email_verification_expires > NOW()`,
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ 
                error: 'Invalid or expired verification link. Please request a new one.' 
            });
        }

        const user = result.rows[0];

        // Verify email and clear token
        await pool.query(
            `UPDATE users 
             SET email_verified = true, 
                 email_verification_token = null,
                 email_verification_expires = null,
                 verified_at = NOW()
             WHERE id = $1`,
            [user.id]
        );

        // Generate new tokens for auto-login
        const { accessToken, refreshToken } = generateTokens({
            ...user,
            email_verified: true
        });

        await pool.query(
            'UPDATE users SET refresh_token = $1 WHERE id = $2',
            [refreshToken, user.id]
        );

        res.json({
            message: 'Email verified successfully!',
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                email_verified: true
            }
        });

    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ error: 'Verification failed. Please try again.' });
    }
});

// Resend Verification Email
app.post('/api/auth/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email required' });
        }

        // Find user
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email.toLowerCase()]
        );

        if (result.rows.length === 0) {
            // Don't reveal if email exists
            return res.json({ message: 'If an account exists, a verification email has been sent.' });
        }

        const user = result.rows[0];

        if (user.email_verified) {
            return res.json({ message: 'Email is already verified. Please log in.' });
        }

        // Generate new token
        const verificationToken = uuidv4();
        const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await pool.query(
            `UPDATE users 
             SET email_verification_token = $1,
                 email_verification_expires = $2
             WHERE id = $3`,
            [verificationToken, verificationExpires, user.id]
        );

        // Send email
        await sendVerificationEmail(email, verificationToken, user.username);

        res.json({ message: 'Verification email sent. Please check your inbox.' });

    } catch (error) {
        console.error('Resend error:', error);
        res.status(500).json({ error: 'Failed to send verification email.' });
    }
});

// Forgot Password
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email required' });
        }

        // Find user
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email.toLowerCase()]
        );

        if (result.rows.length === 0) {
            // Don't reveal if email exists
            return res.json({ message: 'If an account exists, a password reset email has been sent.' });
        }

        const user = result.rows[0];

        // Generate reset token
        const resetToken = uuidv4();
        const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await pool.query(
            `UPDATE users 
             SET password_reset_token = $1,
                 password_reset_expires = $2
             WHERE id = $3`,
            [resetToken, resetExpires, user.id]
        );

        // Send reset email
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:8000'}/reset-password.html?token=${resetToken}`;
        
        await transporter.sendMail({
            from: process.env.FROM_EMAIL || 'noreply@trustmyrecord.com',
            to: email,
            subject: 'Reset Your Password - TrustMyRecord',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #ffd700;">Password Reset Request</h2>
                    <p>Hi ${user.username},</p>
                    <p>We received a request to reset your password. Click the button below to create a new password:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetUrl}" 
                           style="background: linear-gradient(135deg, #ffd700, #ffb700); 
                                  color: #000; padding: 14px 32px; text-decoration: none; 
                                  border-radius: 8px; font-weight: bold; display: inline-block;">
                            Reset Password
                        </a>
                    </div>
                    <p>Or copy and paste this link:</p>
                    <p style="word-break: break-all; color: #666;">${resetUrl}</p>
                    <p style="color: #999; font-size: 12px;">This link expires in 1 hour.</p>
                    <p style="color: #666; font-size: 12px;">
                        If you didn't request this, you can safely ignore this email.
                    </p>
                </div>
            `
        });

        res.json({ message: 'If an account exists, a password reset email has been sent.' });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Failed to process request.' });
    }
});

// Reset Password
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Token and new password required' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        // Find user with valid token
        const result = await pool.query(
            `SELECT * FROM users 
             WHERE password_reset_token = $1 
             AND password_reset_expires > NOW()`,
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired reset link.' });
        }

        const user = result.rows[0];
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password and clear reset token
        await pool.query(
            `UPDATE users 
             SET password_hash = $1,
                 password_reset_token = null,
                 password_reset_expires = null,
                 updated_at = NOW()
             WHERE id = $2`,
            [hashedPassword, user.id]
        );

        res.json({ message: 'Password reset successful. Please log in with your new password.' });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Failed to reset password.' });
    }
});

// Refresh Token
app.post('/api/auth/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(401).json({ error: 'Refresh token required' });
        }

        // Verify refresh token
        const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);

        // Check if token matches stored token
        const result = await pool.query(
            'SELECT * FROM users WHERE id = $1 AND refresh_token = $2',
            [decoded.userId, refreshToken]
        );

        if (result.rows.length === 0) {
            return res.status(403).json({ error: 'Invalid refresh token' });
        }

        const user = result.rows[0];

        // Generate new tokens
        const tokens = generateTokens(user);

        // Store new refresh token
        await pool.query(
            'UPDATE users SET refresh_token = $1 WHERE id = $2',
            [tokens.refreshToken, user.id]
        );

        res.json({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
        });

    } catch (error) {
        res.status(403).json({ error: 'Invalid refresh token' });
    }
});

// Logout
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
    try {
        await pool.query(
            'UPDATE users SET refresh_token = null WHERE id = $1',
            [req.user.userId]
        );
        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Logout failed' });
    }
});

// Get Current User
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, username, email, email_verified, units, 
                    record, streak, avatar, created_at
             FROM users WHERE id = $1`,
            [req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user: result.rows[0] });

    } catch (error) {
        res.status(500).json({ error: 'Failed to get user' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// PICKS ROUTES
// ============================================

// Submit a pick
app.post('/api/picks', authenticateToken, async (req, res) => {
    try {
        const { game_id, sport, selection, odds, stake, confidence, analysis } = req.body;
        const user_id = req.user.userId;

        if (!game_id || !sport || !selection || !odds) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const result = await pool.query(
            `INSERT INTO picks (user_id, game_id, sport, selection, odds, stake, confidence, analysis)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [user_id, game_id, sport, selection, odds, stake || 1, confidence || 50, analysis]
        );

        res.status(201).json({ pick: result.rows[0] });
    } catch (error) {
        console.error('Submit pick error:', error);
        res.status(500).json({ error: 'Failed to submit pick' });
    }
});

// Get user's picks
app.get('/api/picks', authenticateToken, async (req, res) => {
    try {
        const user_id = req.user.userId;
        const { status, limit = 50, offset = 0 } = req.query;

        let query = 'SELECT * FROM picks WHERE user_id = $1';
        const params = [user_id];

        if (status && status !== 'all') {
            query += ` AND result = $${params.length + 1}`;
            params.push(status);
        }

        query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
        params.push(limit, offset);

        const result = await pool.query(query, params);

        res.json({ picks: result.rows });
    } catch (error) {
        console.error('Get picks error:', error);
        res.status(500).json({ error: 'Failed to get picks' });
    }
});

// ============================================
// COMPETITIONS ROUTES
// ============================================

// Get all competitions
app.get('/api/competitions', async (req, res) => {
    try {
        const { status } = req.query;
        
        let query = 'SELECT * FROM competitions';
        const params = [];

        if (status) {
            query += ' WHERE status = $1';
            params.push(status);
        }

        query += ' ORDER BY start_date DESC';

        const result = await pool.query(query, params);
        res.json({ competitions: result.rows });
    } catch (error) {
        console.error('Get competitions error:', error);
        res.status(500).json({ error: 'Failed to get competitions' });
    }
});

// Join competition
app.post('/api/competitions/:id/join', authenticateToken, async (req, res) => {
    try {
        const competition_id = req.params.id;
        const user_id = req.user.userId;

        // Check if already joined
        const existing = await pool.query(
            'SELECT * FROM competition_participants WHERE competition_id = $1 AND user_id = $2',
            [competition_id, user_id]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Already joined this competition' });
        }

        await pool.query(
            'INSERT INTO competition_participants (competition_id, user_id) VALUES ($1, $2)',
            [competition_id, user_id]
        );

        res.json({ message: 'Joined competition successfully' });
    } catch (error) {
        console.error('Join competition error:', error);
        res.status(500).json({ error: 'Failed to join competition' });
    }
});

// ============================================
// SOCIAL ROUTES
// ============================================

// Get user profile
app.get('/api/users/:username', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, username, avatar, bio, location, website, twitter,
                    units, record, streak, created_at
             FROM users WHERE username = $1`,
            [req.params.username]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user: result.rows[0] });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
});

// Follow user
app.post('/api/users/:id/follow', authenticateToken, async (req, res) => {
    try {
        const following_id = req.params.id;
        const follower_id = req.user.userId;

        if (follower_id === following_id) {
            return res.status(400).json({ error: 'Cannot follow yourself' });
        }

        await pool.query(
            'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [follower_id, following_id]
        );

        res.json({ message: 'Followed successfully' });
    } catch (error) {
        console.error('Follow error:', error);
        res.status(500).json({ error: 'Failed to follow user' });
    }
});

// Unfollow user
app.delete('/api/users/:id/follow', authenticateToken, async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2',
            [req.user.userId, req.params.id]
        );

        res.json({ message: 'Unfollowed successfully' });
    } catch (error) {
        console.error('Unfollow error:', error);
        res.status(500).json({ error: 'Failed to unfollow user' });
    }
});

// Get followers
app.get('/api/users/:id/followers', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT u.id, u.username, u.avatar 
             FROM follows f
             JOIN users u ON f.follower_id = u.id
             WHERE f.following_id = $1`,
            [req.params.id]
        );

        res.json({ followers: result.rows });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get followers' });
    }
});

// Get following
app.get('/api/users/:id/following', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT u.id, u.username, u.avatar 
             FROM follows f
             JOIN users u ON f.following_id = u.id
             WHERE f.follower_id = $1`,
            [req.params.id]
        );

        res.json({ following: result.rows });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get following' });
    }
});

// Create post
app.post('/api/posts', authenticateToken, async (req, res) => {
    try {
        const { content, image_url } = req.body;
        const user_id = req.user.userId;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({ error: 'Content required' });
        }

        const result = await pool.query(
            'INSERT INTO posts (user_id, content, image_url) VALUES ($1, $2, $3) RETURNING *',
            [user_id, content, image_url]
        );

        res.status(201).json({ post: result.rows[0] });
    } catch (error) {
        console.error('Create post error:', error);
        res.status(500).json({ error: 'Failed to create post' });
    }
});

// Get feed posts
app.get('/api/posts', authenticateToken, async (req, res) => {
    try {
        const user_id = req.user.userId;
        const { limit = 20, offset = 0 } = req.query;

        const result = await pool.query(
            `SELECT p.*, u.username, u.avatar,
                    (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count
             FROM posts p
             JOIN users u ON p.user_id = u.id
             WHERE p.user_id = $1 
                OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id = $1)
             ORDER BY p.created_at DESC
             LIMIT $2 OFFSET $3`,
            [user_id, limit, offset]
        );

        res.json({ posts: result.rows });
    } catch (error) {
        console.error('Get posts error:', error);
        res.status(500).json({ error: 'Failed to get posts' });
    }
});

// Get notifications
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM notifications 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT 50`,
            [req.user.userId]
        );

        res.json({ notifications: result.rows });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get notifications' });
    }
});

// Mark notification as read
app.patch('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        await pool.query(
            'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.userId]
        );

        res.json({ message: 'Marked as read' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark as read' });
    }
});

// Import routes
const challengesRoutes = require('./routes/challenges');
const pollsRoutes = require('./routes/polls');
const triviaRoutes = require('./routes/trivia');
const messagesRoutes = require('./routes/messages');
const profileRoutes = require('./routes/profile');

// Mount routes
app.use('/api/challenges', authenticateToken, challengesRoutes);
app.use('/api/polls', pollsRoutes);  // Some public, some protected
app.use('/api/polls/:id/vote', authenticateToken);  // Override for auth
app.use('/api/trivia', triviaRoutes);
app.use('/api/messages', authenticateToken, messagesRoutes);
app.use('/api/profile', profileRoutes);

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
    console.log(`TrustMyRecord API running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
