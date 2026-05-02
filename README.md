# Trust My Record

> **The End of the Bullshit** - A transparent, verifiable sports betting platform.

🌐 **Live Site**: [trustmyrecord.com](https://trustmyrecord.com)
📊 **Status**: GitHub Pages frontend backed by the TrustMyRecord API

---

## Overview

Trust My Record is a sports social and accountability platform where picks are locked, timestamped, graded by the backend, and attached to public profiles.

### Features

- ✅ **Locked Pick Tracking** - Submit picks into a permanent public record
- ✅ **Backend Statistics** - Win rates, units, ROI, streaks, and graded pick history
- ✅ **Social Feed** - Share picks and follow others
- ✅ **Leaderboards** - Global and sport-specific rankings
- ✅ **Challenges** - Compete head-to-head
- ✅ **Groups** - Join betting communities
- ✅ **Notifications** - Stay updated with filters
- ✅ **Premium Tiers** - Bronze, Silver, Gold, Platinum
- ✅ **Polls & Trivia** - Community engagement
- ✅ **Public Profiles** - Shareable verified records backed by API data

---

## Technology Stack

### Frontend
- **HTML5/CSS3** - Modern, responsive design
- **Vanilla JavaScript** - Static frontend pages
- **TrustMyRecord API** - Auth, picks, grading, forums, polls, trivia, challenges, and profile data
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

Production data lives in the backend. The frontend may use browser storage for session persistence, UI preferences, cached state, or graceful fallbacks, but the canonical records, pick grading, profile stats, forum posts, polls, trivia scores, and challenge data are API-backed.

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
