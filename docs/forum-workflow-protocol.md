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
