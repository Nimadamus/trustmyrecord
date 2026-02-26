# TrustMyRecord Backend API

Node.js/Express backend with PostgreSQL database and email verification.

## Features

- ✅ User registration with email verification
- ✅ JWT authentication with refresh tokens
- ✅ Password reset via email
- ✅ Rate limiting on auth endpoints
- ✅ PostgreSQL database
- ✅ Nodemailer for transactional emails

## Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your settings
```

### 3. Setup PostgreSQL

Create a PostgreSQL database:

```bash
createdb trustmyrecord
```

Or use your cloud provider (Railway, Supabase, etc.)

### 4. Run Migrations

```bash
npm run migrate
```

### 5. Configure Email (Gmail Example)

1. Enable 2-factor authentication on your Gmail
2. Generate an App Password at https://myaccount.google.com/apppasswords
3. Use that password in SMTP_PASS

### 6. Start Server

Development:
```bash
npm run dev
```

Production:
```bash
npm start
```

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Create account |
| POST | /api/auth/login | Login |
| GET | /api/auth/verify-email?token=xxx | Verify email |
| POST | /api/auth/resend-verification | Resend verification email |
| POST | /api/auth/forgot-password | Request password reset |
| POST | /api/auth/reset-password | Reset password with token |
| POST | /api/auth/refresh | Refresh access token |
| POST | /api/auth/logout | Logout |
| GET | /api/auth/me | Get current user |

## Email Verification Flow

1. User registers → Account created with `email_verified = false`
2. Verification email sent with unique token
3. User clicks link → `verify-email.html?token=xxx`
4. Backend verifies token, sets `email_verified = true`
5. User can now login and use all features

## Frontend Integration

The frontend is already set up to:
- Show verification banner when logged in but not verified
- Handle EMAIL_NOT_VERIFIED error on login
- Provide resend verification option
- Auto-login after email verification

## Deployment

### Railway (Recommended)

1. Push code to GitHub
2. Connect Railway to your repo
3. Add PostgreSQL plugin
4. Set environment variables
5. Deploy!

### Environment Variables for Production

```
DATABASE_URL=postgresql://...
JWT_SECRET=your-256-bit-secret
JWT_REFRESH_SECRET=your-256-bit-refresh-secret
SMTP_HOST=smtp.gmail.com
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your-app-password
FROM_EMAIL=noreply@yourdomain.com
FRONTEND_URL=https://trustmyrecord.com
NODE_ENV=production
```

## Testing

Test the email flow with Mailtrap for development:
- Sign up at https://mailtrap.io
- Use their SMTP credentials in .env
- Emails will be captured in Mailtrap inbox
