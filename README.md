# Trust My Record

> **The End of the Bullshit** - A transparent, verifiable sports betting platform.

🌐 **Live Site**: [trustmyrecord.com](https://trustmyrecord.com)
📊 **Status**: Fully Static | 100% Client-Side

---

## Overview

Trust My Record is a sports betting transparency platform where every pick is tracked and verified. Built as a fully static single-page application with no backend dependencies.

### Features

- ✅ **Pick Tracking** - Record and track all your bets
- ✅ **Real-Time Statistics** - Win rates, ROI, streaks
- ✅ **Social Feed** - Share picks and follow others
- ✅ **Leaderboards** - Global and sport-specific rankings
- ✅ **Challenges** - Compete head-to-head
- ✅ **Groups** - Join betting communities
- ✅ **Notifications** - Stay updated with filters
- ✅ **Premium Tiers** - Bronze, Silver, Gold, Platinum
- ✅ **Polls & Trivia** - Community engagement
- ✅ **100% Static** - No server required

---

## Technology Stack

### Frontend
- **HTML5/CSS3** - Modern, responsive design
- **Vanilla JavaScript** - Zero dependencies
- **localStorage** - All data stored client-side
- **Google Fonts** - Orbitron & Exo 2

### Hosting
- **GitHub Pages** - Free static hosting
- **Custom Domain** - trustmyrecord.com

---

## Quick Start

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
# Visit http://localhost:8000
```

### Deploy

Already configured for GitHub Pages! Just push:
```bash
git add .
git commit -m "Update site"
git push origin main
```

Site automatically deploys to: `https://trustmyrecord.com`

---

## Project Structure

```
trustmyrecord/
├── index.html          # Landing / Auth
├── profile.html        # User profile
├── challenges.html     # Head-to-head challenges
├── forum.html          # Community forum
├── friends.html        # Friends list
├── messages.html       # Private messaging
├── polls.html          # Community polls
├── trivia.html         # Sports trivia game
├── activity.html       # Activity feed
├── premium.html        # Premium tiers
├── 404.html            # SPA redirect
├── CNAME               # Domain config
├── README.md           # This file
├── SETUP.md            # Quick reference
└── static/
    ├── css/            # Stylesheets
    ├── js/             # JavaScript modules
    └── data/           # Sample data
```

---

## Data Storage

All user data is stored in browser localStorage:
- **Picks** - All submitted bets
- **Profile** - User information
- **Feed Posts** - Social posts
- **Following** - Who you follow
- **Poll Votes** - Poll participation
- **Trivia Scores** - Game results
- **Messages** - Conversation history
- **Notifications** - User alerts

Data persists in the user's browser. No backend database required.

---

## Core Pages

### index.html
Landing page with login/signup modal. Creates user session in localStorage.

### profile.html
User dashboard with:
- Pick history and stats
- Win rate, ROI, streaks
- Units tracking
- Achievement badges
- Followers/Following

### challenges.html
1v1 and tournament betting competitions.

### forum.html
Community discussion boards.

### friends.html
Manage friends list and discover users.

### messages.html
Private messaging between users.

### polls.html
Create and vote on sports polls.

### trivia.html
Daily sports trivia with points.

### activity.html
Feed of friends' activity and picks.

### premium.html
Premium tier features and upgrades.

---

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

---

## License

Copyright © 2025 Trust My Record. All rights reserved.

---

## Support

- **Website**: [trustmyrecord.com](https://trustmyrecord.com)
- **Email**: support@trustmyrecord.com

---

**The era of the guru is over. The era of the record has begun.**

*Last Updated: 2026-03-07*
