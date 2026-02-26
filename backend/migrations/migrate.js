const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/trustmyrecord',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const migrations = [
    {
        name: 'create_users_table',
        sql: `
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(30) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                email_verified BOOLEAN DEFAULT false,
                email_verification_token VARCHAR(255),
                email_verification_expires TIMESTAMP,
                verified_at TIMESTAMP,
                password_reset_token VARCHAR(255),
                password_reset_expires TIMESTAMP,
                refresh_token VARCHAR(255),
                units DECIMAL(10,2) DEFAULT 0,
                record JSONB DEFAULT '{"wins": 0, "losses": 0, "pushes": 0}'::jsonb,
                streak INTEGER DEFAULT 0,
                avatar VARCHAR(255),
                bio TEXT,
                location VARCHAR(100),
                website VARCHAR(255),
                twitter VARCHAR(100),
                last_login TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
            CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(email_verification_token);
            CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(password_reset_token);
        `
    },
    {
        name: 'create_picks_table',
        sql: `
            CREATE TABLE IF NOT EXISTS picks (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                game_id VARCHAR(100) NOT NULL,
                sport VARCHAR(50) NOT NULL,
                selection VARCHAR(255) NOT NULL,
                odds INTEGER NOT NULL,
                stake DECIMAL(10,2) DEFAULT 1,
                confidence INTEGER DEFAULT 50,
                analysis TEXT,
                result VARCHAR(20) DEFAULT 'pending',
                result_units DECIMAL(10,2),
                graded_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_picks_user_id ON picks(user_id);
            CREATE INDEX IF NOT EXISTS idx_picks_game_id ON picks(game_id);
            CREATE INDEX IF NOT EXISTS idx_picks_created_at ON picks(created_at);
        `
    },
    {
        name: 'create_competitions_table',
        sql: `
            CREATE TABLE IF NOT EXISTS competitions (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                type VARCHAR(50) DEFAULT 'weekly',
                entry_fee DECIMAL(10,2) DEFAULT 0,
                prize_pool DECIMAL(10,2) DEFAULT 0,
                start_date TIMESTAMP NOT NULL,
                end_date TIMESTAMP NOT NULL,
                status VARCHAR(20) DEFAULT 'upcoming',
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_competitions_status ON competitions(status);
            CREATE INDEX IF NOT EXISTS idx_competitions_dates ON competitions(start_date, end_date);
        `
    },
    {
        name: 'create_competition_participants_table',
        sql: `
            CREATE TABLE IF NOT EXISTS competition_participants (
                id SERIAL PRIMARY KEY,
                competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                joined_at TIMESTAMP DEFAULT NOW(),
                final_rank INTEGER,
                prize_won DECIMAL(10,2),
                UNIQUE(competition_id, user_id)
            );

            CREATE INDEX IF NOT EXISTS idx_comp_participants_comp ON competition_participants(competition_id);
            CREATE INDEX IF NOT EXISTS idx_comp_participants_user ON competition_participants(user_id);
        `
    },
    {
        name: 'create_follows_table',
        sql: `
            CREATE TABLE IF NOT EXISTS follows (
                id SERIAL PRIMARY KEY,
                follower_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                following_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(follower_id, following_id)
            );

            CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
            CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
        `
    },
    {
        name: 'create_posts_table',
        sql: `
            CREATE TABLE IF NOT EXISTS posts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                image_url VARCHAR(500),
                likes_count INTEGER DEFAULT 0,
                comments_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
            CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);
        `
    },
    {
        name: 'create_notifications_table',
        sql: `
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                type VARCHAR(50) NOT NULL,
                title VARCHAR(255) NOT NULL,
                message TEXT,
                data JSONB,
                is_read BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
            CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);
        `
    }
];

async function runMigrations() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Create migrations table
        await client.query(`
            CREATE TABLE IF NOT EXISTS migrations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL,
                applied_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Run each migration
        for (const migration of migrations) {
            const checkResult = await client.query(
                'SELECT * FROM migrations WHERE name = $1',
                [migration.name]
            );

            if (checkResult.rows.length === 0) {
                console.log(`Running migration: ${migration.name}`);
                await client.query(migration.sql);
                await client.query(
                    'INSERT INTO migrations (name) VALUES ($1)',
                    [migration.name]
                );
                console.log(`Completed: ${migration.name}`);
            } else {
                console.log(`Skipping: ${migration.name} (already applied)`);
            }
        }

        await client.query('COMMIT');
        console.log('\nAll migrations completed successfully!');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigrations();
