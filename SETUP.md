# TrustMyRecord - Complete Setup Guide

## Overview

TrustMyRecord is a social sports handicapping platform with:
- User accounts with email verification
- Sports picks and tracking
- Competitions and leaderboards
- Social features (follow, posts, notifications)

## Project Structure

```
trustmyrecord/
├── index.html              # Main app (frontend)
├── verify-email.html       # Email verification page
├── reset-password.html     # Password reset page
├── static/
│   ├── js/
│   │   ├── backend-api.js      # API client
│   │   ├── forms-fixed.js      # Login/signup handlers
│   │   ├── verification-banner.js  # Email verification banner
│   │   └── ...
│   └── css/
│       └── ...
└── backend/
    ├── server.js           # Express API server
    ├── migrations/
    │   └── migrate.js      # Database setup
    ├── package.json
    └── .env.example
```

## Quick Start

### 1. Database Setup (PostgreSQL)

```bash
# Install PostgreSQL if needed
# Then create database
createdb trustmyrecord
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your settings:
# - DATABASE_URL
# - JWT_SECRET (random string)
# - SMTP credentials for email
# - FRONTEND_URL

# Run database migrations
npm run migrate

# Start server
npm run dev
```

Backend runs on http://localhost:3000

### 3. Frontend Setup

The frontend is static HTML/JS. Just serve it:

```bash
# Using Python
python -m http.server 8000

# Or using Node
npx serve -l 8000

# Or using VS Code Live Server extension
```

Frontend runs on http://localhost:8000

## Email Setup (Gmail)

1. Enable 2-Factor Authentication on your Gmail
2. Go to https://myaccount.google.com/apppasswords
3. Generate an App Password
4. Use it in `SMTP_PASS` in your `.env`

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password
FROM_EMAIL=your-email@gmail.com
```

## Testing Email Verification

1. Register a new account at http://localhost:8000
2. Check your email for verification link
3. Click the link or go to `verify-email.html?token=xxx`
4. After verification, you can login and use all features

## Features Implemented

### Authentication
- ✅ Registration with email/password
- ✅ Email verification required before login
- ✅ Resend verification email
- ✅ Password reset via email
- ✅ JWT tokens with refresh
- ✅ Rate limiting on auth

### Frontend Integration
- ✅ Verification banner shows when logged in but not verified
- ✅ Login redirects with "verify email" prompt if not verified
- ✅ Signup shows "check email" message
- ✅ Auto-login after email verification
- ✅ Password reset flow

### API Routes
- Auth: `/api/auth/*`
- Picks: `/api/picks`
- Competitions: `/api/competitions`
- Social: `/api/users/*`, `/api/posts`, `/api/follows`
- Notifications: `/api/notifications`

## Deployment

### Backend (Railway)

1. Push to GitHub
2. Create new Railway project
3. Add PostgreSQL plugin
4. Set environment variables
5. Deploy

### Frontend (GitHub Pages / Netlify)

1. Update `config.js` with production API URL:
```javascript
api: {
    baseUrl: "https://your-api.railway.app/api"
}
```

2. Deploy to GitHub Pages or Netlify

## Environment Variables Reference

```env
# Required
DATABASE_URL=postgresql://...
JWT_SECRET=at-least-32-characters-secret-key
JWT_REFRESH_SECRET=another-32-char-secret

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=noreply@trustmyrecord.com

# URLs
FRONTEND_URL=https://trustmyrecord.com
PORT=3000
NODE_ENV=production
```

## Troubleshooting

### Email not sending
- Check SMTP credentials
- For Gmail, use App Password (not regular password)
- Check spam folders
- Use Mailtrap for testing

### Database connection failed
- Check DATABASE_URL format
- Ensure PostgreSQL is running
- Verify database exists

### CORS errors
- Update FRONTEND_URL in backend .env
- Ensure it matches your frontend URL exactly

### JWT errors
- Ensure JWT_SECRET is set
- Should be at least 32 characters

## Next Steps

1. Test the full flow locally
2. Set up staging environment
3. Configure production email service (SendGrid/Postmark)
4. Add admin dashboard
5. Implement real-time features with WebSockets
