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
