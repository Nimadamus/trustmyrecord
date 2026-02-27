# Trust My Record - Setup Guide

## 1. Environment Setup

### Install Python Dependencies
```bash
pip install -r requirements.txt
```

### Database Setup (PostgreSQL)
```bash
# Create database
psql -U postgres -c "CREATE DATABASE trustmyrecord;"

# Or using createdb
createdb -U postgres trustmyrecord
```

### Redis Setup
```bash
# macOS
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis

# Windows (WSL or Docker)
docker run -d -p 6379:6379 redis:alpine
```

## 2. Configuration

### Create .env file
```bash
cp .env.example .env
```

### Required Environment Variables
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/trustmyrecord

# Security
SECRET_KEY=your-super-secret-key-here
JWT_SECRET_KEY=your-jwt-secret-key-here

# Redis
REDIS_URL=redis://localhost:6379/0

# Optional: Email (for notifications)
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USE_TLS=true
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD=your-app-password

# Optional: The Odds API (for live lines)
ODDS_API_KEY=your-odds-api-key

# Optional: AWS S3 (for file uploads)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET=your-bucket-name
```

## 3. Database Migrations

### Initialize (if needed)
```bash
flask db init
```

### Create migration
```bash
flask db migrate -m "Initial migration"
```

### Apply migrations
```bash
flask db upgrade
```

## 4. Seed Data (Development)

```bash
flask seed-db
```

This creates:
- 4 test users
- Sample games (NFL)
- Sample picks
- Forum threads and posts
- Competition

## 5. Run Development Server

```bash
python run.py
```

Server runs at `http://127.0.0.1:5000`

## 6. Start Celery (Background Tasks)

In a separate terminal:

```bash
# Worker
celery -A tasks worker --loglevel=info

# Scheduler (for periodic tasks)
celery -A tasks beat --loglevel=info
```

## 7. Verify Installation

### Health Check
```bash
curl http://localhost:5000/health
```

### API Documentation
```bash
curl http://localhost:5000/api/v1/docs
```

### Test Login
```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"sharpshooter","password":"Password123!"}'
```

## 8. Production Deployment

### Environment
```bash
export FLASK_ENV=production
export DATABASE_URL=postgresql://... # Production DB
export SECRET_KEY=... # Strong random key
```

### Gunicorn
```bash
gunicorn -w 4 -b 0.0.0.0:5000 wsgi:application
```

### Docker
```bash
docker-compose up -d
```

## Troubleshooting

### Database Connection Issues
- Verify PostgreSQL is running
- Check DATABASE_URL format
- Ensure user has database permissions

### Redis Connection Issues
- Verify Redis is running: `redis-cli ping`
- Check REDIS_URL format

### Import Errors
- Ensure virtual environment is activated
- Reinstall requirements: `pip install -r requirements.txt`

### Migration Issues
- Reset migrations: `flask db downgrade base && flask db upgrade`
- Or recreate: `dropdb trustmyrecord && createdb trustmyrecord`

## CLI Commands

```bash
# Create admin user
flask create-admin admin admin@example.com

# Reset database
flask drop-db  # WARNING: Deletes all data
flask create-db

# Database shell
flask shell
```
