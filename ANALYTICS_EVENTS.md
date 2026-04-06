# TrustMyRecord.com - Analytics Event Map

## Setup Instructions

### 1. GA4 Property (DONE)
- Property: TrustMyRecord
- Measurement ID: `G-V5MCVXS2HE`
- Configured in `static/js/config.js` under `CONFIG.analytics.measurementId`

### 2. (Optional) Create GTM Container
1. Go to https://tagmanager.google.com
2. Create Account > Create Container (Web)
3. Copy the **Container ID** (format: `GTM-XXXXXXX`)
4. Paste it into `static/js/config.js` under `CONFIG.analytics.gtmId`
5. GTM is optional - GA4 direct works fine for all events below

### 3. Enable Debug Mode
Set `CONFIG.analytics.debug = true` in config.js to see all events in:
- Browser console (prefixed `[TMR Analytics]`)
- GA4 Realtime report
- GA4 DebugView (Admin > DebugView)

### 4. Register Custom Dimensions in GA4
Go to GA4 Admin > Custom definitions > Create custom dimensions:

| Dimension Name | Scope | Event Parameter |
|---------------|-------|-----------------|
| Sport | Event | `sport` |
| Pick Type | Event | `pick_type` |
| Button Location | Event | `button_location` |
| Thread ID | Event | `thread_id` |
| Poll ID | Event | `poll_id` |
| Subscription Plan | Event | `subscription_plan` |

### 5. Mark Conversions in GA4
Go to GA4 Admin > Events > toggle "Mark as conversion" for:

| Event | Why It Matters |
|-------|---------------|
| `sign_up_completed` | Primary acquisition metric |
| `pick_submitted` | Core product engagement |
| `forum_thread_created` | Community engagement |
| `poll_voted` | Community engagement |
| `purchase` | Revenue (when payments exist) |

---

## Complete Event Reference

### Auth Funnel Events

| Event Name | Fires From | Parameters | Source File |
|-----------|-----------|------------|-------------|
| `sign_up_started` | Signup button click (nav bar or modal open) | `button_location` | `forms-fixed.js`, `app.js` |
| `sign_up_completed` | After successful registration | `username`, `favorite_sport`, `method` | `forms-fixed.js` |
| `sign_up` | Same as above (GA4 recommended event) | `method` | `forms-fixed.js` (via analytics.js) |
| `login_started` | Login button click (nav bar or modal open) | `button_location` | `forms-fixed.js`, `app.js` |
| `login_completed` | After successful login | `username`, `method` | `forms-fixed.js` |
| `login` | Same as above (GA4 recommended event) | `method` | `forms-fixed.js` (via analytics.js) |

### Pick Events

| Event Name | Fires From | Parameters | Source File |
|-----------|-----------|------------|-------------|
| `make_pick_started` | Sport card click or pick form open | `button_location`, `sport` | `picks-complete-fix.js`, `app.js` |
| `pick_submitted` | After pick is successfully saved (backend or localStorage) | `sport`, `pick_type`, `odds`, `units`, `league` | `picks-complete-fix.js`, `app.js` |
| `pick_edited` | When a pick is modified | `sport`, `pick_id` | (manual call via `TMRAnalytics.pickEdited()`) |
| `pick_history_viewed` | Click on picks/history tab on profile page | `view_type`, `username` | `analytics.js` (auto-bound) |

### Forum Events

| Event Name | Fires From | Parameters | Source File |
|-----------|-----------|------------|-------------|
| `forum_thread_started` | Click "New Thread" button | `button_location` | (manual call via `TMRAnalytics.forumThreadStarted()`) |
| `forum_thread_created` | After thread is saved to storage | `thread_id`, `thread_title`, `sport` | `forum-engine.js` |
| `forum_reply_submitted` | After reply is saved to storage | `thread_id` | `forum-engine.js` |

### Social Feed Events

| Event Name | Fires From | Parameters | Source File |
|-----------|-----------|------------|-------------|
| `post_created` | After social post is saved | `post_type`, `sport`, `has_tags` | `social-feed.js` |
| `post_liked` | When user likes a post | `post_id` | `social-feed.js` |
| `comment_added` | After comment is saved | `post_id` | `social-feed.js` |

### Poll Events

| Event Name | Fires From | Parameters | Source File |
|-----------|-----------|------------|-------------|
| `poll_voted` | After poll vote is recorded | `poll_id`, `sport` | `social-feed.js` |

### Profile Events

| Event Name | Fires From | Parameters | Source File |
|-----------|-----------|------------|-------------|
| `profile_edit_opened` | Click edit profile button | (none) | `analytics.js` (auto-bound) |
| `profile_updated` | After profile changes are saved | `fields_updated` | `auth.js` |

### CTA & Navigation Events

| Event Name | Fires From | Parameters | Source File |
|-----------|-----------|------------|-------------|
| `cta_clicked` | Any element with `data-cta` attribute | `cta_text`, `cta_location`, `cta_destination` | `analytics.js` (auto-bound) |
| `page_view` | Every SPA navigation, hash change, and initial page load | `page_path`, `page_title`, `page_location` | `analytics.js` (auto-bound) |
| `scroll_depth` | Scroll reaches 25%, 50%, 75%, 90% | `percent_scrolled` | `analytics.js` (auto-bound) |
| `click` (outbound) | Click on any external link | `link_url`, `link_domain`, `outbound` | `analytics.js` (auto-bound) |

### Challenge Events

| Event Name | Fires From | Parameters | Source File |
|-----------|-----------|------------|-------------|
| `challenge_created` | After challenge is saved | `challenge_type`, `sport` | `challenges-engine.js` |
| `challenge_accepted` | After challenge is accepted | `challenge_id` | `challenges-engine.js` |

### Premium / Ecommerce Events

| Event Name | Fires From | Parameters | Source File |
|-----------|-----------|------------|-------------|
| `view_item_list` | Premium page load | `item_list_name` | `analytics.js` (auto-bound on premium.html) |
| `select_item` | Click on premium plan button | `item_list_name`, `items[]` | `analytics.js` (auto-bound) |
| `purchase` | After payment completes | `transaction_id`, `value`, `currency`, `items[]` | (manual call via `TMRAnalytics.purchaseCompleted()`) |

### Engagement Events (Available for Manual Use)

| Event Name | Parameters | How to Fire |
|-----------|------------|------------|
| `trivia_played` | `score`, `sport` | `TMRAnalytics.triviaPlayed({score: 8, sport: 'NFL'})` |
| `message_sent` | (none) | `TMRAnalytics.messageSent()` |
| `friend_added` | (none) | `TMRAnalytics.friendAdded()` |

---

## Auto-Tracked vs Manual Events

### Auto-Tracked (no code needed)
These fire automatically from `analytics.js` bindings:
- `page_view` (SPA navigation)
- `scroll_depth` (25/50/75/90%)
- `click` (outbound links)
- `cta_clicked` (elements with `data-cta` attribute)
- `view_item_list` (premium page)
- `select_item` (premium plan buttons)
- `profile_edit_opened` (edit profile button)
- `pick_history_viewed` (picks/history tab)

### Wired Into Existing Code
These fire from instrumented JS modules:
- `sign_up_started`, `sign_up_completed` (forms-fixed.js)
- `login_started`, `login_completed` (forms-fixed.js, app.js)
- `make_pick_started`, `pick_submitted` (picks-complete-fix.js, app.js)
- `post_created`, `post_liked`, `comment_added`, `poll_voted` (social-feed.js)
- `forum_thread_created`, `forum_reply_submitted` (forum-engine.js)
- `challenge_created`, `challenge_accepted` (challenges-engine.js)
- `profile_updated` (auth.js)

### Manual (call when you build the feature)
These have methods ready but need to be called from future code:
- `pick_edited` - call `TMRAnalytics.pickEdited({...})`
- `forum_thread_started` - call `TMRAnalytics.forumThreadStarted({...})`
- `purchase` - call `TMRAnalytics.purchaseCompleted({...})`
- `trivia_played` - call `TMRAnalytics.triviaPlayed({...})`
- `message_sent` - call `TMRAnalytics.messageSent()`
- `friend_added` - call `TMRAnalytics.friendAdded()`

---

## Adding data-cta Attributes for CTA Tracking

Add `data-cta="location_name"` to any button/link you want auto-tracked:

```html
<button data-cta="hero_section">Start Tracking Your Picks</button>
<a href="/premium" data-cta="sidebar_upgrade">Upgrade to Premium</a>
<button data-cta="footer_signup">Join Free</button>
```

These will automatically fire `cta_clicked` with the text, location, and destination.

---

## Verification Checklist

After deploying with a real Measurement ID:

1. Open https://trustmyrecord.com in Chrome
2. Open DevTools > Console - look for `[TMR Analytics] GA4 initialized: G-V5MCVXS2HE`
3. Open GA4 > Realtime - confirm page_view events appear
4. Click around the site - confirm events in Realtime
5. Enable debug mode (`CONFIG.analytics.debug = true`) for detailed console output
6. Open GA4 > Admin > DebugView - connect your device and verify all events
7. Check that no console errors appear from analytics.js
8. Test on mobile viewport (resize browser) - confirm no layout issues

## Known Gaps

| Gap | Reason | Resolution |
|-----|--------|------------|
| `pick_edited` not auto-wired | No edit-pick UI found in current code | Wire when edit feature is built |
| `forum_thread_started` not auto-wired | New thread button varies by page | Add `data-cta="new_thread"` or call manually |
| `purchase` not auto-wired | No payment system exists yet | Wire when payment flow is built |
| `trivia_played` not auto-wired | Trivia scoring logic not audited | Call `TMRAnalytics.triviaPlayed()` from trivia score handler |
| `message_sent` not auto-wired | Messages system not audited | Call `TMRAnalytics.messageSent()` from message send handler |
| User ID hashing | Currently sends username directly | Consider hashing for privacy if needed |
