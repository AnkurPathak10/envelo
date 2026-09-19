# Feature 13: Mobile Message Status Ticks

## Goal

Wire the mobile app up to Feature 12's delivery/read events and
render the Telegram-style tick icons on the chat screen: **clock**
(`SENT`), **single tick** (`DELIVERED`), **double tick** (`READ`).
This is also the first real, hands-on verification of Feature 12 —
there was nothing to visually check before this feature existed.

## Scope

### In scope

- Emit `message:delivered` whenever the app receives an incoming
  message — both live (via the existing `message:new` subscription)
  and via REST history (initial load, reconnect catch-up, "Load
  earlier messages")
- Emit `message:read` whenever the chat screen is focused and there
  are incoming messages to acknowledge, and again whenever a new
  incoming live message arrives while the screen stays focused
- Subscribe to `message:status` and update the matching message's
  local status live, without a re-fetch
- Render the three tick icons on **outgoing messages only** (a
  user's own sent bubbles) — never on incoming bubbles
- Use `@expo/vector-icons`, matching the existing Feature 03/06
  icon convention

### Out of scope

- A fourth "pending" (not-yet-sent, offline-local) state — Feature 14
- Any color-coded/"blue tick" treatment — per Ankur's explicit
  preference, all three icons use the same neutral muted color;
  only the icon shape changes
- Group chat status fan-out (still N/A — project remains 1:1 only)
- Conversation-list preview ticks — Feature 15

## Why over-acking is fine

Feature 12's `message:delivered` handler only ever transitions a
row that is currently `SENT`; anything already `DELIVERED` or
`READ` is a safe no-op. This means the mobile client does not need
to track "have I already acked this" locally — it can simply ack
every incoming message it becomes aware of, every time, and let the
server's idempotent logic absorb the redundancy. Do not build local
ack-tracking state to avoid "duplicate" acks; that complexity is
unnecessary.

## Implementation Details

### Emitting `message:delivered`

In the same place `message:new` is currently subscribed to
(`SocketProvider` or the chat screen, per however Feature 09/11
structured it): whenever one or more incoming messages arrive
(`senderId !== currentUserId`), collect their IDs and emit:

```ts
socket.emit('message:delivered', { messageIds: [...] });
```

Also call this after any REST history fetch that returns messages
(initial chat-screen load, Feature 11's reconnect catch-up re-fetch,
and the existing "Load earlier messages" pagination) — filter to
only messages where `senderId !== currentUserId` before sending.

Debounce/batch lightly (e.g. collect over ~300ms) if multiple
messages arrive close together, so a burst of messages doesn't fire
one socket call per message.

### Emitting `message:read`

Only from the chat screen itself, only while it is focused:

1. On focus/mount, if there is at least one incoming message in the
   currently loaded history, emit:
   ```ts
   socket.emit('message:read', { conversationId, upToMessageId: <latest message id> });
   ```
2. Whenever a new incoming live message arrives while the screen
   remains focused, emit the same event again with the new latest
   message ID.
3. Do not emit this from the conversation list or any other screen
   — reading only happens by actually having the specific chat open,
   per Feature 12's semantics.

### Consuming `message:status`

Subscribe to `message:status` (`{ messageId, status }`) at the same
level `message:new` is handled. On receipt, update the matching
message's `status` field in local state directly — this is what
makes a sender's own tick flip live, in real time, without any
re-fetch, while their chat screen is open.

### Rendering ticks

For each message where `senderId === currentUserId`, render a small
icon after the timestamp based on `message.status`:

| Status | Icon | Meaning |
| --- | --- | --- |
| `SENT` (or `null`, defensively) | a clock/time icon | persisted, not yet delivered |
| `DELIVERED` | a single checkmark | reached the recipient's device |
| `READ` | a double checkmark | recipient opened the conversation |

Use one consistent muted color (`c.textMuted`, from the existing
theme tokens) for all three — no color change between them. Keep
the icon small (roughly matching the timestamp text's size) and
positioned inline after the timestamp, not as a separate row.

Never render a tick on an incoming bubble (`senderId !==
currentUserId`) — incoming messages have no tick, matching
Telegram's own behavior.

## File organization

Changes concentrate in Feature 09/11's existing files:

```text
mobile/
  lib/
    socket/
      SocketContext.tsx (or equivalent)  — message:delivered
                                            emission on incoming
                                            messages, message:status
                                            subscription
  app/
    (app)/
      conversation/
        [conversationId].tsx  — message:read emission on focus/new
                                 message, tick rendering in the
                                 message bubble component
  components/
    conversation/
      message-bubble.tsx (or equivalent existing component) —
        add the tick icon for outgoing messages
```

Adjust to whatever the actual current file names are from Features
09/11 — do not create parallel/duplicate files if equivalents
already exist.

## Security Notes

- No new security surface — this feature only emits already-defined,
  already-validated Feature 12 events and renders already-returned
  API/socket data. No raw tokens are logged, consistent with all
  prior features.

## Testing Checklist

Use two real devices/accounts (A and B), matching Feature 12's test
setup.

1. A sends a message while B's app is fully closed. A's bubble
   shows the clock icon.
2. B opens the app (but not that specific conversation). A's bubble
   live-updates to a single tick, with no manual refresh on A's
   side.
3. B opens the conversation. A's bubble live-updates to a double
   tick.
4. A sends a second message while B has the conversation open and
   focused. It should go clock → single tick → double tick in quick
   succession (delivered near-instantly since B is already
   connected, then read near-instantly since B's screen is open).
5. B backgrounds the app, A sends a message, B foregrounds the app
   (Feature 11's reconnect catch-up runs) — the message is acked as
   delivered without B needing to open the specific conversation.
6. Confirm incoming bubbles on B's side never show any tick icon,
   regardless of status.
7. Toggle light/dark mode — the tick icon color remains legible and
   consistent (no hardcoded colors, uses `c.textMuted`).
8. `npx tsc --noEmit`, `npm run lint`, and `npx prettier --write .`
   pass in `mobile/`.

## Before Marking This Feature Complete

Per `ai-workflow-rules.md`:

1. All eight checks above pass on two real devices.
2. No backend, socket-server, Prisma schema, or migration changes
   were made.
3. Mobile TypeScript, lint, and Prettier checks pass.
4. Update `progress-tracker.md`: mark this feature complete, and
   set **Feature 14 — Optimistic Sending & Offline Queue** as next.
