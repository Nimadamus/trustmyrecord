# Trust My Record - Architecture Documentation

## Overview
Trust My Record is a **transparent sports betting platform** with social and competitive features. This document outlines the complete architecture needed to build a fully functional sports/social media competition site.

## Current Status
🟡 **Static Frontend** - Fully designed and functional
🔴 **Backend** - Needs implementation
🔴 **Database** - Needs setup
🔴 **API** - Needs implementation

---

## Technology Stack (Recommended)

### Frontend (Current - ✅ Complete)
- **HTML5/CSS3** - Modern, responsive design
- **Vanilla JavaScript** - Modular architecture
- **No framework dependencies** - Fast, lightweight

### Backend (Needs Implementation)
- **Option 1: Node.js + Express**
  - Fast, JavaScript everywhere
  - Great for real-time features (Socket.io)
  - Large ecosystem

- **Option 2: Python + Flask/FastAPI**
  - Great for data processing
  - ML/AI capabilities for predictions
  - Rich sports data libraries

- **Option 3: Serverless (Firebase/Supabase)**
  - No server management
  - Built-in auth
  - Real-time database
  - Generous free tier

### Database (Needs Implementation)
- **Primary Database**: PostgreSQL or MongoDB
  - PostgreSQL: Structured data, complex queries
  - MongoDB: Flexible schema, fast reads

- **Cache**: Redis
  - Live odds caching
  - Session management
  - Rate limiting

- **Real-time**: Firebase Realtime DB or Socket.io
  - Live updates
  - Chat/forums
  - Notifications

### APIs & Services Needed
1. **Sports Data APIs**
   - The Odds API (odds, scores, games)
   - SportsData.io (stats, player data)
   - ESPN API (news, analysis)

2. **Authentication**
   - Firebase Auth / Auth0 / Supabase Auth
   - OAuth (Google, Twitter, Facebook)
   - JWT for sessions

3. **Email Service**
   - SendGrid / Mailgun / AWS SES
   - Transactional emails
   - Newsletters

4. **Storage**
   - AWS S3 / Cloudinary
   - Profile pictures
   - Media uploads

---

## Data Models

### 1. User Model
```javascript
{
  id: UUID,
  username: String (unique),
  email: String (unique),
  passwordHash: String,
  displayName: String,
  avatar: URL,
  bio: String,
  joinedDate: Timestamp,
  verified: Boolean,

  // Stats
  totalPicks: Number,
  wins: Number,
  losses: Number,
  pushes: Number,
  winRate: Number,
  roi: Number,
  streak: Number,

  // Social
  followers: [UserID],
  following: [UserID],
  reputation: Number,
  badges: [BadgeID],

  // Subscription
  isPremium: Boolean,
  subscriptionTier: String,
  subscriptionExpiry: Timestamp,

  // Settings
  isPrivate: Boolean,
  notifications: {
    email: Boolean,
    push: Boolean,
    frequency: String
  }
}
```

### 2. Pick Model
```javascript
{
  id: UUID,
  userId: UserID,
  timestamp: Timestamp,

  // Game Info
  sport: String,
  league: String,
  gameId: String,
  gameDate: Timestamp,
  team1: String,
  team2: String,

  // Bet Details
  betType: String, // moneyline, spread, total, prop
  pick: String,
  odds: Number,
  line: Number, // spread/total line

  // Metadata
  units: Number,
  confidence: Number (1-5),
  reasoning: Text,
  tags: [String],

  // Result
  status: String, // pending, win, loss, push, void
  result: String,
  profit: Number,
  gradedAt: Timestamp,
  gradedBy: String, // auto, manual, admin

  // Social
  likes: Number,
  comments: [CommentID],
  shares: Number,
  views: Number,

  // Visibility
  isPublic: Boolean,
  isPremium: Boolean // premium subscribers only
}
```

### 3. Challenge Model
```javascript
{
  id: UUID,
  title: String,
  description: Text,
  creator: UserID,
  createdAt: Timestamp,

  // Challenge Rules
  type: String, // 1v1, tournament, leaderboard
  sport: String,
  timeframe: {
    start: Timestamp,
    end: Timestamp
  },
  rules: {
    minPicks: Number,
    maxPicks: Number,
    allowedBetTypes: [String],
    unitCap: Number
  },

  // Participants
  participants: [{
    userId: UserID,
    joinedAt: Timestamp,
    picks: [PickID],
    stats: {
      wins: Number,
      losses: Number,
      roi: Number
    }
  }],
  maxParticipants: Number,
  entryFee: Number,

  // Prize
  prize: {
    type: String, // cash, badge, premium
    amount: Number,
    description: String
  },

  // Status
  status: String, // open, active, completed, cancelled
  winner: UserID,
  leaderboard: [{
    userId: UserID,
    rank: Number,
    score: Number
  }]
}
```

### 4. Forum Post Model
```javascript
{
  id: UUID,
  authorId: UserID,
  timestamp: Timestamp,

  // Content
  title: String,
  content: Text,
  type: String, // discussion, analysis, question
  category: String, // NFL, NBA, MLB, etc.

  // Media
  images: [URL],
  attachments: [URL],

  // Engagement
  upvotes: Number,
  downvotes: Number,
  comments: [CommentID],
  views: Number,
  shares: Number,

  // Moderation
  isPinned: Boolean,
  isLocked: Boolean,
  reports: Number,
  moderationStatus: String,

  // Tags
  tags: [String],
  relatedPicks: [PickID],
  relatedGames: [GameID]
}
```

### 5. Comment Model
```javascript
{
  id: UUID,
  authorId: UserID,
  timestamp: Timestamp,

  // Parent
  parentType: String, // pick, post, challenge
  parentId: UUID,

  // Content
  content: Text,

  // Engagement
  likes: Number,
  replies: [CommentID],

  // Moderation
  isDeleted: Boolean,
  reports: Number
}
```

### 6. Game Model (Sports Data)
```javascript
{
  id: String, // from API
  sport: String,
  league: String,

  // Teams
  homeTeam: {
    id: String,
    name: String,
    abbreviation: String,
    logo: URL
  },
  awayTeam: {
    id: String,
    name: String,
    abbreviation: String,
    logo: URL
  },

  // Schedule
  scheduledTime: Timestamp,
  status: String, // scheduled, live, final, postponed

  // Score
  homeScore: Number,
  awayScore: Number,
  period: String,

  // Odds (if applicable)
  odds: {
    moneyline: {
      home: Number,
      away: Number
    },
    spread: {
      line: Number,
      home: Number,
      away: Number
    },
    total: {
      line: Number,
      over: Number,
      under: Number
    }
  },

  // Metadata
  venue: String,
  weather: Object,
  lastUpdated: Timestamp
}
```

### 7. Notification Model
```javascript
{
  id: UUID,
  userId: UserID,
  timestamp: Timestamp,

  // Content
  type: String, // pick_graded, new_follower, challenge_invite, etc.
  title: String,
  message: Text,
  icon: String,

  // Action
  actionUrl: String,
  actionLabel: String,

  // State
  isRead: Boolean,
  readAt: Timestamp
}
```

### 8. Subscription Model
```javascript
{
  id: UUID,
  sellerId: UserID, // handicapper
  buyerId: UserID, // subscriber

  // Subscription
  tier: String,
  price: Number,
  billingCycle: String, // monthly, weekly
  startDate: Timestamp,
  nextBillingDate: Timestamp,

  // Status
  status: String, // active, cancelled, expired
  autoRenew: Boolean,

  // Payment
  paymentMethod: String,
  lastPayment: Timestamp,
  totalPaid: Number
}
```

---

## API Endpoints (Need to Build)

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `POST /api/auth/reset-password` - Password reset
- `GET /api/auth/verify/:token` - Email verification

### Users
- `GET /api/users/:id` - Get user profile
- `PUT /api/users/:id` - Update profile
- `GET /api/users/:id/picks` - Get user's picks
- `GET /api/users/:id/stats` - Get user stats
- `GET /api/users/:id/followers` - Get followers
- `POST /api/users/:id/follow` - Follow user
- `DELETE /api/users/:id/follow` - Unfollow user

### Picks
- `POST /api/picks` - Create pick
- `GET /api/picks/:id` - Get pick details
- `PUT /api/picks/:id` - Update pick (before game starts)
- `DELETE /api/picks/:id` - Delete pick
- `GET /api/picks/feed` - Get picks feed
- `POST /api/picks/:id/like` - Like a pick
- `POST /api/picks/:id/comment` - Comment on pick

### Challenges
- `POST /api/challenges` - Create challenge
- `GET /api/challenges` - List challenges
- `GET /api/challenges/:id` - Get challenge details
- `POST /api/challenges/:id/join` - Join challenge
- `GET /api/challenges/:id/leaderboard` - Get leaderboard

### Forums
- `POST /api/forum/posts` - Create post
- `GET /api/forum/posts` - List posts
- `GET /api/forum/posts/:id` - Get post
- `PUT /api/forum/posts/:id` - Update post
- `DELETE /api/forum/posts/:id` - Delete post
- `POST /api/forum/posts/:id/comment` - Comment on post

### Sports Data
- `GET /api/games` - Get upcoming games
- `GET /api/games/:id` - Get game details
- `GET /api/odds/:gameId` - Get live odds
- `GET /api/standings/:league` - Get standings

### Leaderboard
- `GET /api/leaderboard/global` - Global leaderboard
- `GET /api/leaderboard/:sport` - Sport-specific leaderboard
- `GET /api/leaderboard/weekly` - Weekly leaders

---

## Features Roadmap

### Phase 1: Core Features (MVP)
- [x] Static frontend design
- [ ] User authentication
- [ ] Pick submission & tracking
- [ ] Basic profile pages
- [ ] Sports data integration
- [ ] Pick grading automation

### Phase 2: Social Features
- [ ] Follow system
- [ ] Comments & likes
- [ ] User feeds
- [ ] Leaderboards
- [ ] Badges & achievements

### Phase 3: Competitive Features
- [ ] 1v1 challenges
- [ ] Tournaments
- [ ] Head-to-head stats
- [ ] Challenge history

### Phase 4: Premium Features
- [ ] Subscription system
- [ ] Sell picks
- [ ] Premium analytics
- [ ] Private picks
- [ ] Detailed stats export

### Phase 5: Community
- [ ] Forums
- [ ] Groups/Communities
- [ ] Direct messaging
- [ ] Live chat
- [ ] Video content

### Phase 6: Advanced
- [ ] Mobile app (React Native)
- [ ] Push notifications
- [ ] AI pick suggestions
- [ ] Advanced analytics dashboard
- [ ] API for developers

---

## Deployment Options

### Option 1: Traditional Hosting
- **Frontend**: Netlify, Vercel, GitHub Pages (current)
- **Backend**: DigitalOcean, AWS EC2, Heroku
- **Database**: AWS RDS, MongoDB Atlas
- **Cost**: $20-100/month

### Option 2: Serverless
- **Everything**: Firebase, Supabase, AWS Amplify
- **Cost**: $0-50/month (scales with usage)
- **Pros**: No server management, auto-scaling
- **Cons**: Vendor lock-in, cold starts

### Option 3: Full Cloud
- **AWS/GCP/Azure**: Full control
- **Cost**: $50-500+/month
- **Pros**: Maximum flexibility, enterprise-grade
- **Cons**: Complex setup, requires DevOps knowledge

---

## Security Considerations

1. **Authentication**
   - Bcrypt password hashing
   - JWT with short expiration
   - Refresh token rotation
   - Rate limiting on login

2. **Data Protection**
   - Input validation & sanitization
   - SQL injection prevention
   - XSS protection
   - CSRF tokens
   - HTTPS everywhere

3. **API Security**
   - API key authentication
   - Rate limiting (Redis)
   - CORS configuration
   - Request size limits

4. **Privacy**
   - GDPR compliance
   - Data encryption at rest
   - Secure file uploads
   - Audit logs

---

## Next Steps

1. **Choose Backend Stack**
   - Recommendation: Firebase/Supabase for rapid development
   - Alternative: Node.js + PostgreSQL for full control

2. **Set Up Authentication**
   - Implement user registration/login
   - Email verification
   - Password reset

3. **Integrate Sports Data**
   - Sign up for The Odds API
   - Create data sync jobs
   - Cache odds data

4. **Build Core Features**
   - Pick submission
   - Automatic grading
   - User profiles
   - Basic stats

5. **Add Social Layer**
   - Follow system
   - Comments
   - Leaderboards

---

## Questions to Answer

1. **Monetization Strategy?**
   - Freemium model?
   - Commission on premium pick sales?
   - Advertising?
   - Tournament entry fees?

2. **Target Scale?**
   - 100s, 1000s, or 100,000s of users?
   - This affects infrastructure choices

3. **Geographic Focus?**
   - US sports only?
   - International sports?
   - This affects API selection

4. **Development Timeline?**
   - MVP in 1 month?
   - Full platform in 6 months?

5. **Technical Expertise?**
   - Will you code the backend?
   - Hire developers?
   - Use no-code tools?

---

*Last Updated: 2025-10-27*
