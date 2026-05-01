# Approved Visual Design Source Files

These files are the **approved visual design targets** for the TrustMyRecord redesign. They are **static HTML mockups** with hardcoded sample data — they have no JS, no auth, no API calls, no real picks, no real users.

**Do not deploy these as live pages.** They are visual references only.

The real functional pages at `/sportsbook/`, `/profile/`, `/forum/`, etc. retain all working JS, API, auth, picks, modals, handlers, IDs, and class names. The design language from these references is ported into the working pages via CSS overrides at `static/css/tmr-redesign-overrides.css`.

## Files

| File | Source | Purpose |
|------|--------|---------|
| `sportsbook-preview-dk.html` | `origin/tmr-visual-previews:sportsbook-preview-dk.html` | DraftKings-style sportsbook visual target |
| `forum-preview-2p2.html` | `origin/tmr-visual-previews:forum-preview-2p2.html` | 2+2-style forum visual target |
| `profile-preview-pickmonitor.html` | `origin/tmr-visual-previews:index-preview-pickmonitor.html` | PickMonitor-style profile/dashboard visual target |
| `profile-preview-social.html` | `origin/tmr-visual-previews:index-preview-social.html` | Social-feed-style profile/home visual target |

## Also available on remote branches (not copied here)

- `origin/tmr-visual-previews:profile-preview.html` — 45 KB profile preview (separate from the homepage previews above)

## How to view locally

```bash
# Open any reference in your default browser
start _design-source/sportsbook-preview-dk.html      # Windows
open  _design-source/sportsbook-preview-dk.html      # Mac
xdg-open _design-source/sportsbook-preview-dk.html   # Linux
```

## How to recover from remote if these get deleted locally

```bash
git show origin/tmr-visual-previews:sportsbook-preview-dk.html  > _design-source/sportsbook-preview-dk.html
git show origin/tmr-visual-previews:forum-preview-2p2.html      > _design-source/forum-preview-2p2.html
git show origin/tmr-visual-previews:index-preview-pickmonitor.html > _design-source/profile-preview-pickmonitor.html
git show origin/tmr-visual-previews:index-preview-social.html   > _design-source/profile-preview-social.html
```
