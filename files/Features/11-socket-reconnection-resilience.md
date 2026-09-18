# Feature 11: Socket Reconnection & Connection Resilience

## Note on sequencing

This feature is inserted ahead of the previously planned "Feature
11: Socket Delivery and Read State Foundation" and "Feature 12:
Mobile Live Inbox," which are renumbered to **Feature 12** and
**Feature 13** respectively. Reconnection is a foundational fix to
the connection layer built in Feature 09 and should land before
more UI/state is layered on top of it. Update
`progress-tracker.md`'s "Next Up" section to reflect this
renumbering as part of completing this feature.

## Goal

Fix the real gap found during Feature 09 device testing: once a
socket disconnects (app backgrounded, brief network loss, phone
sleep), the app never reconnects on its own — the user currently
has to force-reload the app to get a live connection back. A real
chat app must recover from this automatically and silently,
without the user noticing or needing to do anything.

## Scope

### In scope

- Re-enable Socket.IO's built-in reconnection logic (previously
  explicitly disabled in Feature 09) with sensible backoff limits
- Listen for the app returning to the foreground (React Native's
  `AppState`) and proactively reconnect if the socket is currently
  disconnected — don't just wait passively for the library's own
  timer
- Handle the case where the access token expired while the app was
  backgrounded: refresh it before attempting to reconnect, rather
  than reconnecting with a stale token and immediately failing auth
- After a successful reconnect, re-fetch the currently open
  conversation's message history (if a chat screen is open) to
  catch anything sent while disconnected — relying on the existing
  Feature 07 history endpoint and Feature 09's existing
  de-duplication-by-ID merge logic, not a new sync mechanism
- Update the existing connection-state indicator/composer-disable
  logic (from Feature 09) to reflect "reconnecting" as a distinct,
  visible state — not indistinguishable from "disconnected forever"
- Basic reconnection backoff limits (do not let it retry forever at
  full speed — Socket.IO's defaults are reasonable here, just
  confirm they're actually configured, not left at "disabled")

### Out of scope

- Offline message queueing (sending messages while fully offline
  and auto-sending once reconnected) — still deferred, as in
  Feature 09
- Delivery/read receipts — Feature 12
- Typing indicators, presence — not yet planned
- Any backend/socket-server code changes — the server already
  handles a reconnecting client identically to a new one via the
  existing auth middleware; no server-side change is expected, but
  confirm this assumption during implementation and flag it if
  false

## Why this is safe to build now

Nothing about reconnection requires new persisted state. Messages
sent while a recipient is disconnected are already durably saved by
Feature 08 before broadcasting, and Feature 07's history endpoint
already exists to retrieve them. This feature is entirely about the
mobile client behaving correctly around a connection it already
knows how to create — not inventing new sync logic.

## Implementation Details

### Re-enable Socket.IO reconnection

In `mobile/lib/socket/` (wherever `SocketProvider` currently
creates the client), find where reconnection was disabled and
change it to sensible, explicit values rather than defaults left
unexamined:

```ts
io(url, {
  auth: { token: accessToken },
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
});
```

(Exact numbers can be adjusted, but the intent is: start retrying
after 1 second, back off up to 10 seconds between attempts, give up
after 10 attempts rather than forever — at which point the existing
Feature 09 "disconnected" UI state applies and the user can still
manually trigger a retry, e.g. by reopening the conversation
screen.)

### Handle app foreground/background via `AppState`

```ts
import { AppState } from 'react-native';
```

Listen for the app transitioning to `active`. When that happens, if
the socket is not currently connected, proactively call
`.connect()` rather than waiting for Socket.IO's own timers — this
makes reconnection feel instant when the user reopens the app,
instead of waiting out a backoff delay that started while the app
was backgrounded and the user wasn't watching anyway.

### Handle token expiry across a long background period

The access token is short-lived (15 minutes, per Feature 02/09).
Before reconnecting after a foreground transition, check whether
the current in-memory access token is still valid (or simply always
attempt a refresh if enough time has passed — use the existing
`AuthContext`/`apiRequest` refresh logic already built in Feature
03, do not duplicate token-refresh logic here). Only attempt the
socket reconnect with a confirmed-valid token, so a stale-token
reconnect attempt doesn't immediately fail and confuse the
retry/backoff state.

### Re-sync message history after reconnect

If a conversation screen (Feature 09's `[conversationId]` route) is
currently mounted when a reconnect succeeds, trigger the same
history-fetch path already used on initial screen load (no cursor —
fetch the newest page) and merge it through the existing
de-duplication-by-durable-ID logic. This catches any message that
was sent and persisted while the socket was down. Do not build a
separate "missed messages" endpoint or mechanism — the existing
history API and merge function are sufficient.

### Connection state indicator

Feature 09 already disables the composer's Send button when
disconnected. Extend the state this is based on to distinguish:

- `connected` — normal operation
- `reconnecting` — socket is actively retrying (show a subtle
  indicator, e.g. a small "Reconnecting…" label near the composer —
  keep this understated, not a modal or blocking UI)
- `disconnected` — retries exhausted (existing Feature 09 state)

Keep this minimal — this is a state label change, not a new design
system or component library addition.

## File organization

Changes should be concentrated in the existing files from Feature
09 rather than creating new architecture:

```text
mobile/
  lib/
    socket/
      SocketProvider.tsx   — reconnection config, AppState listener,
                             token-refresh-before-reconnect logic,
                             expanded connection state
    api/
      conversations.ts     — no changes expected; reused as-is for
                             the post-reconnect history re-fetch
  app/
    (app)/
      conversation/
        [conversationId].tsx  — consumes the expanded connection
                                 state; triggers history re-fetch on
                                 reconnect if this screen is focused
```

## Security Notes

- Do not log tokens during any reconnect/refresh attempt, consistent
  with all prior features.
- Do not weaken the existing JWT verification on the socket-server
  side to "help" reconnection — reconnecting clients must
  re-authenticate exactly like a first-time connection.

## Testing Checklist

1. Open the app, open a conversation, background the app for ~10
   seconds, foreground it again — the socket reconnects
   automatically with no visible disruption, no reload needed.
2. With the app foregrounded and connected, toggle airplane mode
   on, wait a few seconds, then toggle it off — connection state
   shows `reconnecting` while airplane mode is on, then returns to
   `connected` once network is restored, without a manual reload.
3. Background the app for longer than the 15-minute access token
   lifetime, then foreground it — the app refreshes its token
   before reconnecting, and the socket connects successfully (not
   stuck retrying with a stale token).
4. While Device A is disconnected (airplane mode), have Device B
   send it a message. Reconnect Device A (airplane mode off) with
   the conversation screen open — the message appears without
   duplication once the post-reconnect history re-fetch runs.
5. Exhaust reconnection attempts deliberately (e.g. leave airplane
   mode on long enough to exceed the configured attempt count) —
   the UI settles into the existing Feature 09 "disconnected" state
   rather than retrying forever or crashing.
6. Sign out while in a `reconnecting` state — confirm the existing
   Feature 09 sign-out socket cleanup still runs correctly and
   doesn't leave a dangling reconnect loop running after logout.

## Before Marking This Feature Complete

Per `ai-workflow-rules.md`:

1. All six test scenarios above pass on two real devices.
2. No backend or socket-server code changed (confirm and note in
   `progress-tracker.md` if this assumption turned out to be false
   and something server-side did need to change).
3. `npx tsc --noEmit`, `npm run lint`, and `npx prettier --write .`
   all pass in `mobile/`.
4. Update `progress-tracker.md`: mark this feature complete, apply
   the renumbering noted above (old Feature 11 → 12, old Feature 12
   → 13), and set **Feature 12 — Socket Delivery and Read State
   Foundation** as next.
