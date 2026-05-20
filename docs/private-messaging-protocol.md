# Private Messaging Protocol

TrustMyRecord private messaging is an authenticated user-to-user feature tied to real profile identity.

## Frontend Standard

- The canonical inbox route is `/messages/`.
- Logged-in users must always have a directly visible Messages/Inbox entry point from the site navigation. The navigation entry must route to `/messages/`, must not be hidden behind profile lookup state, and may show the unread badge when `/messages/unread-count` is available.
- When a shared header or global navigation component is available, the Messages/Inbox entry must be owned by that component or inserted into the component's primary visible links in a way the header cleanup logic preserves. Do not rely on fragile post-render injection into areas that the header later removes.
- Messaging/nav work must never break homepage, header, Login, Join Free, logout, or auth route controls. After any nav change, verify the live homepage Login control still opens `/login/` or the current login flow before considering the change complete.
- Messaging/nav work must never break homepage login, signup, or header controls. Any nav/header change requires live browser click verification for Log in and Sign up/Join Free on the public homepage. HTML anchor presence, source checks, merge status, or HTTP fetches are not valid verification for click behavior.
- Auth navigation must remain reliable even when header overlays, injected nav layers, badges, dropdowns, or post-render messaging code are present. If an overlay is introduced, it must not block Login or Sign up pointer interaction.
- Profile-based message access must link to `/messages/?to=<username>` for the viewed user.
- Profile message actions must use absolute message routes. Do not use relative `messages/?to=<username>` from `/profile/`.
- The profile `user` query parameter is reserved only for profile lookup. Messaging links must never generate `/profile/?user=messages&to=<username>` or otherwise replace the viewed profile username.
- The messages page opens an existing thread when one exists and otherwise opens a new empty thread addressed to that user.
- The frontend may keep localStorage fallback data for legacy/offline display only. The production source of truth is always the TrustMyRecord API.
- Do not add public feed, profile, forum, or leaderboard surfaces that expose private message content.
- Do not seed production with demo private messages.

## Required User Flows

- A logged-in user can open the inbox at `/messages/` from the site navigation.
- A logged-in user can start a new conversation by username.
- A logged-in user can send a message to another active user.
- A logged-in user can read messages from conversations where they are a participant.
- A logged-in user viewing another profile should have an appropriate Message entry point.

## Regression Guard

When changing messaging, inspect current frontend and backend state first. Preserve recent auth/session fixes, existing profile rendering, existing inbox UI, and existing API method names: `getConversations`, `getMessages`, `sendMessage`, and `markAsRead`.