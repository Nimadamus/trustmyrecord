# Private Messaging Protocol

TrustMyRecord private messaging is an authenticated user-to-user feature tied to real profile identity.

## Frontend Standard

- The canonical inbox route is `/messages/`.
- Profile-based message access must link to `/messages/?to=<username>` for the viewed user.
- Profile message actions must use absolute message routes. Do not use relative `messages/?to=<username>` from `/profile/`.
- The profile `user` query parameter is reserved only for profile lookup. Messaging links must never generate `/profile/?user=messages&to=<username>` or otherwise replace the viewed profile username.
- The messages page opens an existing thread when one exists and otherwise opens a new empty thread addressed to that user.
- The frontend may keep localStorage fallback data for legacy/offline display only. The production source of truth is always the TrustMyRecord API.
- Do not add public feed, profile, forum, or leaderboard surfaces that expose private message content.
- Do not seed production with demo private messages.

## Required User Flows

- A logged-in user can open the inbox at `/messages/`.
- A logged-in user can start a new conversation by username.
- A logged-in user can send a message to another active user.
- A logged-in user can read messages from conversations where they are a participant.
- A logged-in user viewing another profile should have an appropriate Message entry point.

## Regression Guard

When changing messaging, inspect current frontend and backend state first. Preserve recent auth/session fixes, existing profile rendering, existing inbox UI, and existing API method names: `getConversations`, `getMessages`, `sendMessage`, and `markAsRead`.