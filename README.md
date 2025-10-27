# Trust My Record

> **The End of the Bullshit** - A transparent, verifiable sports betting platform with social and competitive features.

🌐 **Live Site**: [trustmyrecord.com](https://trustmyrecord.com)
📊 **Status**: Frontend Complete | Backend In Development

---

## Overview

Trust My Record is a revolutionary sports betting transparency platform where every pick is permanently recorded, tracked, and verified. Built on principles of accountability and community competition.

### Core Features

- ✅ **Immutable Pick Records** - Every bet tracked permanently
- ✅ **Real-Time Statistics** - Win rates, ROI, streaks
- ✅ **Head-to-Head Challenges** - Compete against other handicappers
- ✅ **Social Features** - Follow, comment, share picks
- ✅ **Leaderboards** - Global and sport-specific rankings
- ✅ **Sell Your Picks** - Monetize your expertise
- ✅ **Forums** - Community discussion and analysis

---

## Project Structure

```
trustmyrecord/
├── index.html              # Main application (SPA)
├── CNAME                   # Domain configuration
├── static/
│   ├── css/
│   │   └── style.css       # Supplementary styles
│   ├── js/
│   │   ├── forms.js        # Form handling & data submission
│   │   ├── navigation.js   # Page navigation
│   │   └── effects.js      # Visual effects
│   └── data/               # Local data storage (JSON)
├── docs/
│   ├── ARCHITECTURE.md     # Complete technical architecture
│   ├── API.md              # API documentation
│   └── SETUP.md            # Detailed setup guide
└── README.md               # This file
```

---

## Technology Stack

### Frontend (Current)
- **HTML5/CSS3** - Modern, responsive design
- **Vanilla JavaScript** - No framework dependencies
- **CSS Grid & Flexbox** - Responsive layouts
- **LocalStorage** - Temporary data persistence

### Backend (Coming Soon)
**Option 1: Firebase (Recommended for MVP)**
- Authentication: Firebase Auth
- Database: Firestore
- Hosting: Firebase Hosting
- Functions: Cloud Functions

**Option 2: Traditional Stack**
- Backend: Node.js + Express
- Database: PostgreSQL + Redis
- Auth: JWT + bcrypt
- Hosting: DigitalOcean/AWS

### Third-Party APIs Needed
- **Sports Data**: The Odds API, ESPN API
- **Payments**: Stripe (for premium features)
- **Email**: SendGrid
- **Storage**: Cloudinary (images/media)

---

## Current Features

### ✅ Implemented
- [x] Responsive homepage with hero section
- [x] Navigation system (9+ sections)
- [x] Pick submission form
- [x] Sign-up form
- [x] Pick history display
- [x] Interactive UI effects
- [x] Mobile-responsive design

### 🚧 In Progress
- [ ] Backend API
- [ ] Database setup
- [ ] User authentication
- [ ] Sports data integration
- [ ] Pick grading automation

### 📋 Planned
- [ ] User profiles
- [ ] Follow system
- [ ] Challenge system
- [ ] Forums
- [ ] Leaderboards
- [ ] Premium subscriptions

---

## Quick Start (Frontend Only)

### View Locally

1. Clone the repository:
```bash
git clone https://github.com/Nimadamus/trustmyrecord.git
cd trustmyrecord
```

2. Open in browser:
```bash
# Simply open index.html in your browser
# Or use a local server:
python -m http.server 8000
# Then visit http://localhost:8000
```

### Deploy to GitHub Pages

Already configured! Just push to main branch:
```bash
git add .
git commit -m "Update site"
git push origin main
```

Site automatically deploys to: `https://trustmyrecord.com`

---

## Setup Guide (Full Stack)

### Prerequisites
- Node.js 16+ (if building backend)
- Git
- Text editor (VS Code recommended)
- Firebase/Supabase account (for database)

### Step 1: Form Submissions

Currently, forms store data locally. To enable real form submissions:

**Option A: Use Formspree (Easiest)**
1. Sign up at [formspree.io](https://formspree.io)
2. Create two forms: "Signups" and "Picks"
3. Update `static/js/forms.js`:
```javascript
const FORMSPREE_SIGNUP_ENDPOINT = 'https://formspree.io/f/YOUR_ID';
const FORMSPREE_PICKS_ENDPOINT = 'https://formspree.io/f/YOUR_ID';
```

**Option B: Build Custom Backend**
See `docs/ARCHITECTURE.md` for complete backend setup.

### Step 2: Sports Data Integration

1. Sign up for [The Odds API](https://the-odds-api.com)
2. Get your API key
3. Create a serverless function or backend endpoint to fetch:
   - Upcoming games
   - Live odds
   - Scores for grading

### Step 3: Authentication

**Option A: Firebase Auth**
```bash
npm install firebase
```

**Option B: Supabase Auth**
```bash
npm install @supabase/supabase-js
```

See `docs/SETUP.md` for detailed instructions.

---

## Data Models

### User
- ID, username, email, stats (wins/losses/ROI)
- Followers, following, reputation
- Premium status

### Pick
- User ID, sport, teams, bet type
- Odds, units, confidence, reasoning
- Status (pending/win/loss), timestamp
- Social (likes, comments, shares)

### Challenge
- Creator, participants, rules
- Type (1v1, tournament)
- Prizes, status, leaderboard

See `docs/ARCHITECTURE.md` for complete data models.

---

## API Endpoints (To Build)

### Authentication
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`

### Picks
- `POST /api/picks` - Submit pick
- `GET /api/picks` - Get picks feed
- `GET /api/picks/:id` - Get pick details
- `PUT /api/picks/:id` - Update pick

### Users
- `GET /api/users/:id` - Get profile
- `GET /api/users/:id/picks` - Get user picks
- `GET /api/users/:id/stats` - Get statistics
- `POST /api/users/:id/follow` - Follow user

### Challenges
- `POST /api/challenges` - Create challenge
- `GET /api/challenges` - List challenges
- `POST /api/challenges/:id/join` - Join challenge

See `docs/API.md` for complete API documentation.

---

## Environment Variables

Create a `.env` file:

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/trustmyrecord
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=your-super-secret-key-here
JWT_EXPIRY=7d

# APIs
ODDS_API_KEY=your-odds-api-key
SPORTS_DATA_API_KEY=your-sports-data-key

# Email
SENDGRID_API_KEY=your-sendgrid-key
FROM_EMAIL=noreply@trustmyrecord.com

# Storage
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
S3_BUCKET=trustmyrecord-uploads

# Payments
STRIPE_PUBLIC_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_WS_URL=ws://localhost:3000
```

---

## Development Roadmap

### Q4 2025 - MVP Launch
- ✅ Frontend design
- 🚧 User authentication
- 🚧 Pick submission & tracking
- 🚧 Basic profiles
- 🚧 Sports data integration

### Q1 2026 - Social Features
- Follow system
- Comments & reactions
- User feeds
- Leaderboards
- Badges

### Q2 2026 - Competition
- 1v1 challenges
- Tournaments
- Challenge history
- Prize system

### Q3 2026 - Monetization
- Premium subscriptions
- Sell picks
- Commission system
- Advanced analytics

### Q4 2026 - Mobile
- React Native app
- Push notifications
- Offline mode
- Enhanced UX

---

## Contributing

Contributions welcome! Please read our contributing guidelines first.

### Development Workflow
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

Copyright © 2025 Trust My Record. All rights reserved.

---

## Support

- **Website**: [trustmyrecord.com](https://trustmyrecord.com)
- **Email**: support@trustmyrecord.com
- **Twitter**: [@trustmyrecord](https://twitter.com/trustmyrecord)
- **Discord**: [Join our community](https://discord.gg/trustmyrecord)

---

## Acknowledgments

Built with:
- [The Odds API](https://the-odds-api.com) - Sports odds data
- [Formspree](https://formspree.io) - Form submissions
- [Google Fonts](https://fonts.google.com) - Orbitron & Exo 2 fonts
- [GitHub Pages](https://pages.github.com) - Hosting

---

**The era of the guru is over. The era of the record has begun.**

*Last Updated: 2025-10-27*
