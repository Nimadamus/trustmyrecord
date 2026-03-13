# Trust My Record - Setup Guide

## Quick Start

### 1. Clone & Run

```bash
git clone https://github.com/Nimadamus/trustmyrecord.git
cd trustmyrecord
python -m http.server 8000
```

Visit: `http://localhost:8000`

That's it. No database, no dependencies, no build step.

---

## Development

### Local Server (Recommended)

Using Python:
```bash
python -m http.server 8000
```

Using Node (if you prefer):
```bash
npx serve .
```

Using PHP:
```bash
php -S localhost:8000
```

### File Structure

```
trustmyrecord/
├── index.html              # Landing / Auth page
├── profile.html            # User profile dashboard
├── challenges.html         # Betting challenges
├── forum.html              # Community forum
├── friends.html            # Friends management
├── messages.html           # Private messaging
├── polls.html              # Community polls
├── trivia.html             # Sports trivia
├── activity.html           # Activity feed
├── premium.html            # Premium features
├── 404.html                # SPA redirect for GitHub Pages
├── CNAME                   # Domain configuration
├── static/
│   ├── css/
│   │   └── main.css        # Main stylesheet
│   ├── js/
│   │   ├── auth.js         # Authentication logic
│   │   ├── picks.js        # Pick tracking
│   │   ├── profile.js      # Profile management
│   │   ├── challenges.js   # Challenge system
│   │   ├── forum.js        # Forum functionality
│   │   ├── friends.js      # Friends system
│   │   ├── messages.js     # Messaging
│   │   ├── polls.js        # Polls system
│   │   ├── trivia.js       # Trivia game
│   │   ├── activity.js     # Activity feed
│   │   ├── utils.js        # Helper functions
│   │   └── data.js         # Sample/demo data
│   └── data/
│       ├── sample-picks.json
│       ├── sample-users.json
│       └── sample-forum.json
```

---

## Data Storage

All data lives in browser localStorage:

```javascript
// Key structure
'tmr_user'              // Current logged in user
'tmr_users'             // All registered users array
'tmr_picks'             // User's picks
'tmr_feed'              // Social feed posts
'tmr_following'         // Who user follows
'tmr_polls'             // Available polls
'tmr_poll_votes'        // User's poll votes
'tmr_trivia_scores'     // Trivia results
'tmr_messages'          // Conversation history
'tmr_notifications'     // User notifications
'tmr_challenges'        // Active challenges
```

### Clear Data

To reset all data in development:
```javascript
// Open browser console and run:
localStorage.clear();
location.reload();
```

---

## Authentication

Simple client-side auth:
- Username/password stored in localStorage
- No email verification (static site)
- Session stored in `tmr_user`
- Logout clears session

### Demo Account

Login with any username - if it doesn't exist, a new account is created.
Or use the pre-seeded demo accounts:
- `sharpshooter` / `password`
- `vegasinsider` / `password`
- `underdog` / `password`

---

## Customization

### Colors

Edit `static/css/main.css`:

```css
:root {
  --primary: #FF6B35;      /* Orange */
  --secondary: #004E89;    /* Navy */
  --accent: #1A659E;       /* Blue */
  --success: #4CAF50;      /* Green */
  --danger: #F44336;       /* Red */
  --warning: #FFC107;      /* Yellow */
  --gold: #FFD700;         /* Premium gold */
}
```

### Sports/Leagues

Edit `static/js/data.js` to add/remove sports:

```javascript
const SPORTS = [
  { id: 'nfl', name: 'NFL', icon: '🏈' },
  { id: 'nba', name: 'NBA', icon: '🏀' },
  // Add your own...
];
```

---

## Deployment

### GitHub Pages

1. Push to GitHub repository
2. Go to Settings > Pages
3. Select "Deploy from a branch"
4. Choose `main` branch, `/ (root)` folder
5. Save

Site deploys to: `https://yourusername.github.io/trustmyrecord`

### Custom Domain

1. Add your domain to `CNAME` file:
   ```
   trustmyrecord.com
   ```

2. Configure DNS with your registrar:
   - A record: `185.199.108.153`
   - A record: `185.199.109.153`
   - A record: `185.199.110.153`
   - A record: `185.199.111.153`
   - Or CNAME: `yourusername.github.io`

3. Enable HTTPS in GitHub Pages settings

### Netlify / Vercel

Drag and drop the project folder. Done.

---

## Troubleshooting

### localStorage Not Working

- Check if browser is in private/incognito mode
- Check if localStorage is disabled
- Check for storage quota exceeded (5-10MB limit)

### Changes Not Showing

- Hard refresh: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)
- Clear browser cache
- Check file paths are correct

### GitHub Pages 404

- Ensure `404.html` is present
- Check CNAME is correct
- Wait 5-10 minutes for DNS propagation

---

## Browser Support

| Browser | Version |
|---------|---------|
| Chrome  | 90+     |
| Firefox | 88+     |
| Safari  | 14+     |
| Edge    | 90+     |
| Mobile Safari | 14+ |
| Chrome Android | 90+ |

---

## License

Copyright © 2025 Trust My Record. All rights reserved.
