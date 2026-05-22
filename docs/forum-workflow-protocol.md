# Forum Workflow Protocol

## Thread Detail Rendering

Thread detail pages must render the original thread starter content as Post #1. The canonical order is:

- thread starter content from the `forum_threads` record
- reply posts from `forum_posts`, sorted oldest to newest

A thread with zero replies is not empty. It must still show the starter post and keep Quick Reply available underneath the post list.

Only show `Thread has no posts` when the thread record is invalid or the thread has no usable starter content and no reply content.

Each rendered post should use real user/profile/forum data where available:

- avatar
- username or display name
- user title, role, headline, or verified handicapper state
- join date
- real forum post count and thread count when available from API/profile/forum data
- favorite team, or `Not set` when no favorite team is stored
- verified record or handicapper badge only when the user/profile data supports it

Do not invent forum users, starter posts, replies, join dates, post totals, thread totals, badges, or favorite teams.

## Thread List Rendering

The forum thread list (rendered by `renderThreads()` in `forum/index.html`) must show a small circular avatar for the thread creator next to each thread row, in addition to the existing folder icon, thread title, and `Started by <user>` line.

Avatar sourcing rules:

- Use the real user avatar from the thread record when available (`thread.avatar_url`, falling back to `thread.user.avatar_url` / `thread.user.avatar`).
- When no avatar URL is present, render a single-letter initials placeholder (uppercase first character of the starter username) inside the same circular slot.
- If the avatar image fails to load (`onerror`), collapse to the initials placeholder.
- Markup hook: `<span class="fthread-row-avatar">`, sized ~28×28px on desktop and ~24×24px on mobile. Keep the row compact so the thread list does not grow oversized.

Any future change to the thread list row layout (new badges, sport icons, last-post column tweaks, classic vs. modern skin) must preserve the creator avatar element. Do not remove the avatar to "simplify" the row.

## Thread List Polish Standard

The thread list row must also preserve these polish elements:

- **Last Post column avatar.** Render a small (22px) avatar next to the Last Post title/meta when last-poster avatar data is available. Sourcing order: `thread.last_post_avatar_url` → `thread.last_avatar_url` → `thread.last_user_avatar` → starter avatar when `last_post_username === starter`. Otherwise render the initials placeholder using `<span class="fthread-row-avatar">`. Last-post avatar must not appear when there are no replies — keep the "No replies yet" placeholder unchanged.
- **Row affordance.** Thread rows must have a hover/focus background change (`#e1ecf8`), a 120ms color transition, and a visible focus outline (`outline:2px solid #1f5f9f` on `:focus-visible`). Do not remove or weaken these states to "match" other tables.
- **Keyboard + screen-reader access.** Each `<tr class="frow">` must have `role="link"`, `tabindex="0"`, `aria-label="Open thread: <title>"`, and a keyboard handler that opens the thread on Enter or Space (calls the same `showThreadDetail(id)` route as the click handler — never a different route).
- **Breadcrumb.** Keep `.fcrumb` at `padding:9px 12px; line-height:1.5; .sep padding:0 8px` so the breadcrumb has comfortable vertical rhythm without feeling oversized. Do not collapse it back to 7px/6px spacing.
- **Mobile.** The Last Post column is hidden under `@media (max-width:760px)`. Do not re-show it on mobile, and keep the thread starter avatar at 24px on mobile so the row stays compact.

Future work (not yet implemented):

- Profile hover popover (mini-card on hover over the starter avatar/username). Requires new logic and a profile-fetch endpoint; intentionally deferred.
