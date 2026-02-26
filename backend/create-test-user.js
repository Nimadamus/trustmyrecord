const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/trustmyrecord'
});

async function createTestUser() {
    const hashedPassword = await bcrypt.hash('password123', 10);
    try {
        const result = await pool.query(
            `INSERT INTO users (username, email, password_hash, email_verified, units, record, streak)
             VALUES ($1, $2, $3, true, 1000, $4, 3)
             RETURNING id, username, email`,
            ['testuser', 'test@example.com', hashedPassword, JSON.stringify({ wins: 10, losses: 5, pushes: 1 })]
        );
        console.log('Test user created:', result.rows[0]);
    } catch (e) {
        if (e.message.includes('unique constraint') || e.message.includes('already exists')) {
            console.log('Test user already exists, updating password and verifying...');
            await pool.query(
                'UPDATE users SET password_hash = $1, email_verified = true WHERE email = $2',
                [hashedPassword, 'test@example.com']
            );
            const result = await pool.query('SELECT id, username, email FROM users WHERE email = $1', ['test@example.com']);
            console.log('Test user updated:', result.rows[0]);
        } else {
            console.error('Error:', e.message);
        }
    }
    await pool.end();
}

createTestUser();
