# TrustMyRecord - Static Site Usage Guide

## It's Already Static!

Your TrustMyRecord frontend is **100% static HTML/CSS/JavaScript**. No Python, Flask, or server-side code required.

---

## File Structure

```
trustmyrecord/
├── index.html          (Homepage)
├── dashboard.html      (User dashboard/lobby)
├── register.html       (Signup page)
├── login.html          (Login page)
├── submit_pick.html    (Pick submission)
├── picks.html          (The Record - picks feed)
├── leaderboard.html    (Rankings)
├── about.html          (About page)
├── contact.html        (Contact page)
└── static/
    ├── css/
    │   └── new_design.css
    ├── images/
    └── js/
        └── api.js      (API client - connects to backend)
```

---

## How to Use

### Option 1: Open Directly in Browser (Simple)
Just double-click any `.html` file to open it in your browser.

**Limitation:** JavaScript `fetch()` calls to the backend API won't work due to CORS when opening files directly (file:// protocol).

### Option 2: Use Live Server (Recommended for Development)

**A. VS Code Live Server Extension:**
1. Open folder in VS Code
2. Install "Live Server" extension
3. Right-click `index.html` → "Open with Live Server"
4. Opens at http://127.0.0.1:5500

**B. Node.js http-server:**
```bash
npm install -g http-server
cd C:\Users\Nima\Documents\trustmyrecord
http-server -p 8080
```

**C. Python (what we were using):**
```bash
cd C:\Users\Nima\Documents\trustmyrecord
python -m http.server 8080
```

### Option 3: Deploy to Static Hosting (Production)

**GitHub Pages (Free):**
1. Push to GitHub repo
2. Settings → Pages → Deploy from main branch
3. Your site is live at `https://yourusername.github.io/repo-name`

**Netlify (Free):**
1. Drag & drop folder to netlify.com
2. Site is live instantly
3. Custom domain support

**Vercel (Free):**
1. Connect GitHub repo
2. Auto-deploys on push
3. Custom domain support

---

## Connecting to Backend

Your static site connects to the backend API via JavaScript in `static/js/api.js`:

```javascript
const API_URL = 'http://localhost:3000/api';
```

### For Local Development:
Keep as: `http://localhost:3000/api`

### For Production:
Change to your deployed backend URL:
```javascript
const API_URL = 'https://api.trustmyrecord.com/api';
```

---

## No Server Required for Frontend

The frontend files are pure static HTML/CSS/JavaScript:
- ✓ No Python required
- ✓ No Flask required
- ✓ No Node.js required (for frontend)
- ✓ No build process needed
- ✓ Just HTML files calling an API

The backend API (Node.js/Express) runs separately on port 3000.

---

## Current Setup

**Frontend:**
- Location: `C:\Users\Nima\Documents\trustmyrecord`
- Type: Static HTML/CSS/JavaScript
- Connects to: Backend API

**Backend:**
- Location: `C:\Users\Nima\Desktop\trustmyrecord-backend`
- Type: Node.js/Express server
- Runs on: http://localhost:3000
- Status: Currently running

---

## Deployment Strategy

### Frontend (Static):
Deploy anywhere that hosts static files:
- GitHub Pages
- Netlify
- Vercel
- AWS S3 + CloudFront
- Cloudflare Pages
- Surge.sh

### Backend (API):
Deploy Node.js server:
- Railway (recommended)
- Render
- Heroku
- DigitalOcean
- AWS EC2

---

## Testing Locally Right Now

1. **Start Backend** (if not already running):
```bash
cd C:\Users\Nima\Desktop\trustmyrecord-backend
npm start
```

2. **Open Frontend** (choose one):

**A. Double-click:**
- Double-click `index.html` in Windows Explorer
- Note: API calls won't work

**B. Simple Python server:**
```bash
cd C:\Users\Nima\Documents\trustmyrecord
python -m http.server 8080
```
Then open: http://localhost:8080

**C. VS Code Live Server:**
- Open folder in VS Code
- Right-click `index.html` → Open with Live Server

---

## Why You Need a Local Server for Testing

When you open `file:///C:/Users/Nima/Documents/trustmyrecord/index.html` directly, browsers block JavaScript from making requests to `http://localhost:3000` (CORS policy).

A local server (Python, Node, or VS Code) serves files via `http://localhost:8080`, which allows API calls to work.

**In production**, this isn't an issue because both frontend and backend have proper domains.

---

## Making it Work Without a Server

If you want to test without any server at all, you'd need to:
1. Mock the API calls in JavaScript, or
2. Disable browser CORS (not recommended), or
3. Just deploy both frontend and backend to production

---

## Summary

Your site **IS static** - no Python/Flask needed!

The Python command I ran (`python -m http.server 8080`) was just a simple way to serve static files for local testing. It's not Flask, not a framework, just a basic file server.

For production, you'll deploy:
- **Frontend** → GitHub Pages/Netlify (free, static hosting)
- **Backend** → Railway/Render (Node.js hosting)

Both are completely separate and communicate via API calls.
