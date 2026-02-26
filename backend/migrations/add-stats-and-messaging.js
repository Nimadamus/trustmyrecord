const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/trustmyrecord',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const migrations = [
    {
        name: 'add_user_stats_columns',
        sql: `
            -- Add poll and trivia stats to users
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS poll_points INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS trivia_points INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS total_polls_answered INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS total_trivia_played INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS competitions_won INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS competitions_lost INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS challenges_won INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS challenges_lost INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS total_picks INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS win_percentage DECIMAL(5,2) DEFAULT 0;

            -- Update record column default if not exists
            ALTER TABLE users 
            ALTER COLUMN record SET DEFAULT '{"wins": 0, "losses": 0, "pushes": 0}'::jsonb;
        `
    },
    {
        name: 'create_challenges_table',
        sql: `
            CREATE TABLE IF NOT EXISTS challenges (
                id SERIAL PRIMARY KEY,
                challenger_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                challenged_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                type VARCHAR(50) DEFAULT '1v1', -- 1v1, team, etc.
                sport VARCHAR(50),
                description TEXT,
                stake_amount DECIMAL(10,2) DEFAULT 0,
                status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, declined, completed, cancelled
                winner_id INTEGER REFERENCES users(id),
                start_date TIMESTAMP,
                end_date TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                accepted_at TIMESTAMP,
                completed_at TIMESTAMP
            );

            -- Partial unique index to prevent duplicate pending challenges
            CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_challenge 
            ON challenges(challenger_id, challenged_id) 
            WHERE status = 'pending';

            CREATE INDEX IF NOT EXISTS idx_challenges_challenger ON challenges(challenger_id);
            CREATE INDEX IF NOT EXISTS idx_challenges_challenged ON challenges(challenged_id);
            CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status);
        `
    },
    {
        name: 'create_challenge_picks_table',
        sql: `
            CREATE TABLE IF NOT EXISTS challenge_picks (
                id SERIAL PRIMARY KEY,
                challenge_id INTEGER REFERENCES challenges(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                pick_id INTEGER REFERENCES picks(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(challenge_id, user_id, pick_id)
            );

            CREATE INDEX IF NOT EXISTS idx_challenge_picks_challenge ON challenge_picks(challenge_id);
            CREATE INDEX IF NOT EXISTS idx_challenge_picks_user ON challenge_picks(user_id);
        `
    },
    {
        name: 'create_polls_table',
        sql: `
            CREATE TABLE IF NOT EXISTS polls (
                id SERIAL PRIMARY KEY,
                question TEXT NOT NULL,
                options JSONB NOT NULL,
                correct_option INTEGER,
                sport VARCHAR(50),
                category VARCHAR(50),
                points INTEGER DEFAULT 10,
                start_date TIMESTAMP DEFAULT NOW(),
                end_date TIMESTAMP,
                status VARCHAR(20) DEFAULT 'active',
                total_votes INTEGER DEFAULT 0,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_polls_status ON polls(status);
            CREATE INDEX IF NOT EXISTS idx_polls_end_date ON polls(end_date);
        `
    },
    {
        name: 'create_poll_votes_table',
        sql: `
            CREATE TABLE IF NOT EXISTS poll_votes (
                id SERIAL PRIMARY KEY,
                poll_id INTEGER REFERENCES polls(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                selected_option INTEGER NOT NULL,
                is_correct BOOLEAN,
                points_earned INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(poll_id, user_id)
            );

            CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id);
            CREATE INDEX IF NOT EXISTS idx_poll_votes_user ON poll_votes(user_id);
        `
    },
    {
        name: 'create_trivia_games_table',
        sql: `
            CREATE TABLE IF NOT EXISTS trivia_games (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                category VARCHAR(50),
                difficulty VARCHAR(20) DEFAULT 'medium',
                time_limit INTEGER DEFAULT 30, -- seconds per question
                points_per_question INTEGER DEFAULT 10,
                total_questions INTEGER DEFAULT 10,
                status VARCHAR(20) DEFAULT 'active',
                start_date TIMESTAMP,
                end_date TIMESTAMP,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW()
            );
        `
    },
    {
        name: 'create_trivia_questions_table',
        sql: `
            CREATE TABLE IF NOT EXISTS trivia_questions (
                id SERIAL PRIMARY KEY,
                game_id INTEGER REFERENCES trivia_games(id) ON DELETE CASCADE,
                question TEXT NOT NULL,
                options JSONB NOT NULL,
                correct_answer INTEGER NOT NULL,
                explanation TEXT,
                points INTEGER DEFAULT 10,
                order_index INTEGER
            );

            CREATE INDEX IF NOT EXISTS idx_trivia_questions_game ON trivia_questions(game_id);
        `
    },
    {
        name: 'create_trivia_results_table',
        sql: `
            CREATE TABLE IF NOT EXISTS trivia_results (
                id SERIAL PRIMARY KEY,
                game_id INTEGER REFERENCES trivia_games(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                score INTEGER DEFAULT 0,
                correct_answers INTEGER DEFAULT 0,
                total_questions INTEGER DEFAULT 0,
                time_taken INTEGER, -- seconds
                rank INTEGER,
                completed_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(game_id, user_id)
            );

            CREATE INDEX IF NOT EXISTS idx_trivia_results_game ON trivia_results(game_id);
            CREATE INDEX IF NOT EXISTS idx_trivia_results_user ON trivia_results(user_id);
        `
    },
    {
        name: 'create_conversations_table',
        sql: `
            CREATE TABLE IF NOT EXISTS conversations (
                id SERIAL PRIMARY KEY,
                type VARCHAR(20) DEFAULT 'direct', -- direct, group
                title VARCHAR(255),
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                last_message_at TIMESTAMP DEFAULT NOW()
            );
        `
    },
    {
        name: 'create_conversation_participants_table',
        sql: `
            CREATE TABLE IF NOT EXISTS conversation_participants (
                id SERIAL PRIMARY KEY,
                conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                is_admin BOOLEAN DEFAULT false,
                joined_at TIMESTAMP DEFAULT NOW(),
                last_read_at TIMESTAMP,
                UNIQUE(conversation_id, user_id)
            );

            CREATE INDEX IF NOT EXISTS idx_conv_participants_conv ON conversation_participants(conversation_id);
            CREATE INDEX IF NOT EXISTS idx_conv_participants_user ON conversation_participants(user_id);
        `
    },
    {
        name: 'create_messages_table',
        sql: `
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
                sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                message_type VARCHAR(20) DEFAULT 'text', -- text, image, system
                media_url VARCHAR(500),
                reply_to INTEGER REFERENCES messages(id),
                is_edited BOOLEAN DEFAULT false,
                edited_at TIMESTAMP,
                is_deleted BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT NOW(),
                read_by JSONB DEFAULT '[]'::jsonb
            );

            CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
            CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
            CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
        `
    },
    {
        name: 'create_competition_results_table',
        sql: `
            CREATE TABLE IF NOT EXISTS competition_results (
                id SERIAL PRIMARY KEY,
                competition_id INTEGER REFERENCES competitions(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                final_rank INTEGER,
                final_score DECIMAL(10,2) DEFAULT 0,
                picks_count INTEGER DEFAULT 0,
                wins INTEGER DEFAULT 0,
                losses INTEGER DEFAULT 0,
                pushes INTEGER DEFAULT 0,
                units_won DECIMAL(10,2) DEFAULT 0,
                units_lost DECIMAL(10,2) DEFAULT 0,
                prize_amount DECIMAL(10,2) DEFAULT 0,
                completed_at TIMESTAMP,
                UNIQUE(competition_id, user_id)
            );

            CREATE INDEX IF NOT EXISTS idx_comp_results_comp ON competition_results(competition_id);
            CREATE INDEX IF NOT EXISTS idx_comp_results_user ON competition_results(user_id);
            CREATE INDEX IF NOT EXISTS idx_comp_results_rank ON competition_results(final_rank);
        `
    },
    {
        name: 'add_message_notifications',
        sql: `
            -- Add message notification type
            -- This is handled by the existing notifications table with type = 'message'
        `
    }
];

async function runMigrations() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Ensure migrations table exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS migrations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL,
                applied_at TIMESTAMP DEFAULT NOW()
            )
        `);

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
                console.log(`✓ Completed: ${migration.name}`);
            } else {
                console.log(`Skipping: ${migration.name} (already applied)`);
            }
        }

        await client.query('COMMIT');
        console.log('\n✅ All migrations completed successfully!');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigrations();
