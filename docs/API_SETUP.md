# API Setup Guide - Get Real Sports Data

## Step 1: Get Your FREE API Key from The Odds API

### Sign Up (FREE)
1. Go to: **https://the-odds-api.com/**
2. Click "Get API Key" or "Sign Up"
3. Create account with email
4. Verify email
5. Get your API key from dashboard

### Free Tier Limits:
- ✅ **500 requests/month** FREE
- ✅ All sports data
- ✅ Live odds
- ✅ Multiple markets (spreads, totals, moneyline)

**Note**: Each API call uses 1 request. With smart caching, 500 requests = plenty for testing!

---

## Step 2: Configure Your API Key

### Option A: Direct Edit (Quick & Easy)

1. Open `static/js/config.js`
2. Find this line:
```javascript
key: "YOUR_ODDS_API_KEY",
```

3. Replace with your actual key:
```javascript
key: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
```

4. Save file
5. Refresh browser - LIVE DATA! 🔥

### Option B: Environment Variable (Production)

For production, keep keys secret:

1. Create `.env` file in root:
```env
ODDS_API_KEY=your_actual_api_key_here
```

2. Add `.env` to `.gitignore`:
```
.env
```

3. Update config to read from env (requires build step)

---

## Step 3: Test Your Integration

### Verify It Works:

1. Open browser console (F12)
2. Go to: https://trustmyrecord.com
3. Click "Make Your Picks"
4. Select a sport (NFL, NBA, etc.)
5. Check console for:
   - ✅ "Loaded X sports"
   - ✅ "Loading games for americanfootball_nfl..."
   - ✅ "Loaded X games"

### What You Should See:

**REAL matchups like:**
- "Kansas City Chiefs @ Buffalo Bills - Jan 26, 7:30 PM"
- "Los Angeles Lakers @ Golden State Warriors - Jan 25, 10:00 PM"
- Actual odds: -150, +130, etc.

**NOT mock data like:**
- Generic team names
- Same odds every time
- "Mock" in console

---

## Step 4: Understanding API Usage

### How Requests Are Used:

1. **Sport Selection**: 1 request (cached 1 minute)
   - Fetches all available sports

2. **Game Selection**: 1 request per sport (cached 1 minute)
   - Fetches upcoming games + odds

3. **Caching Saves Requests**:
   - Same sport within 60s = FREE (from cache)
   - Switching sports = 1 request per new sport

### Example Usage:
```
User visits picks page:
- Selects NFL = 1 request
- Views 5 NFL games = 0 additional requests (cached)
- Switches to NBA = 1 request
- Back to NFL within 1 min = 0 requests (still cached)

Total: 2 requests used
```

### Monthly Estimate:
- 10 daily users
- Each checks 2 sports
- 20 requests/day
- **600 requests/month** (over free tier by 100)

**Solution**: Upgrade to $10/month for 10,000 requests or implement server-side caching

---

## Step 5: Supported Sports

### Currently Configured:

| Sport Key | Name | Status |
|-----------|------|--------|
| `americanfootball_nfl` | NFL | ✅ Active |
| `basketball_nba` | NBA | ✅ Active |
| `baseball_mlb` | MLB | ✅ Active |
| `icehockey_nhl` | NHL | ✅ Active |
| `soccer_epl` | English Premier League | ✅ Active |
| `basketball_ncaab` | NCAA Basketball | ✅ Active |
| `americanfootball_ncaaf` | NCAA Football | ✅ Active |

### Add More Sports:

Edit `static/js/config.js`:

```javascript
supportedSports: [
    { id: "soccer_spain_la_liga", name: "La Liga", category: "Soccer" },
    { id: "soccer_uefa_champs_league", name: "Champions League", category: "Soccer" },
    { id: "mma_mixed_martial_arts", name: "UFC/MMA", category: "MMA" },
    { id: "boxing_boxing", name: "Boxing", category: "Boxing" }
]
```

Full list: https://the-odds-api.com/sports-odds-data/sports-apis.html

---

## Step 6: Advanced Features

### Enable Historical Scores (for auto-grading):

```javascript
const scores = await sportsAPI.getScores('americanfootball_nfl', 3);
// Gets scores from last 3 days
```

### Custom Bookmakers:

By default, uses first bookmaker. To specify:

```javascript
// In api.js, modify getUpcomingGames:
const url = `${this.baseUrl}/sports/${sportKey}/odds?` +
            `apiKey=${this.apiKey}&` +
            `regions=us&` +
            `bookmakers=fanduel,draftkings&` +  // Specific books
            `markets=h2h,spreads,totals&` +
            `oddsFormat=american`;
```

### Available Bookmakers:
- `fanduel`
- `draftkings`
- `betmgm`
- `caesars`
- `pointsbet`
- `wynnbet`

---

## Troubleshooting

### "No upcoming games available"

**Causes:**
1. Sport is out of season (e.g., MLB in January)
2. No games scheduled in next 3 days
3. API key invalid
4. Rate limit exceeded

**Solutions:**
- Check console for errors
- Try different sport
- Verify API key is correct
- Check usage on The Odds API dashboard

### "Error loading games"

**Check:**
1. Internet connection
2. API key validity
3. Browser console for detailed error
4. The Odds API status page

### Mock Data Still Showing

**Verify:**
1. `config.js` has real key (not "YOUR_ODDS_API_KEY")
2. Hard refresh browser (Ctrl+Shift+R)
3. Clear browser cache
4. Check console for "Using Mock Sports API" warning

---

## Cost Optimization Tips

### 1. Increase Cache Time
Edit `api.js`:
```javascript
this.cacheExpiry = 300000; // 5 minutes instead of 1
```

### 2. Server-Side Caching
Store API responses in Firebase/Supabase:
- Fetch from API every 5-10 minutes
- All users read from database
- 1 API call serves 1000s of users

### 3. Selective Sports
Only enable sports currently in season:
```javascript
// Winter: NBA, NHL, NCAA Basketball
// Summer: MLB
// Fall: NFL, NCAA Football
// Spring: MLB starting
```

### 4. Upgrade Plan
- **$10/month**: 10,000 requests
- **$25/month**: 25,000 requests
- **$50/month**: 50,000 requests

---

## Next Steps

Once API is working:

1. ✅ **Real-time odds** - Working!
2. 📊 **Auto-grade picks** - Compare pick vs final score
3. 🏆 **Leaderboards** - Rank users by accuracy
4. 💾 **Save to database** - Store picks permanently
5. 👥 **User accounts** - Track individual records

---

## Support

**The Odds API:**
- Docs: https://the-odds-api.com/liveapi/guides/v4/
- Support: support@the-odds-api.com

**Trust My Record:**
- Issues: https://github.com/Nimadamus/trustmyrecord/issues

---

*Last Updated: 2025-10-27*
