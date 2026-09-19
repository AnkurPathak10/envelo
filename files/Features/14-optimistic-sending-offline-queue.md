# Feature 14: Optimistic Sending & Offline Queue

## Complexity note

This feature is larger than Features 11–13. It touches three
layers (schema, socket-server, mobile) rather than one or two, and
introduces a genuinely trickier correctness problem (safe retries
without duplicate messages) than anything built so far. Expect more
back-and-forth with the agent and a longer real-device testing pass
than recent features.

## Goal

Make sending feel instant and offline-safe, matching Telegram/
WhatsApp: a message appears in the chat the moment you tap Send —
before the server has even seen it — with a clock icon (now
correctly scoped to mean "not yet sent to the server," per the
Feature 13 follow-up fix). If the device is offline, the message
stays queued locally, persists across an app restart, and
auto-sends the moment connectivity returns — without the user doing
anything or losing their place.

## Important schema decision — confirm before implementation

To make retries safe (see the complexity note above), `Message`
needs one new nullable field:

```prisma
clientMessageId String?

@@unique([senderId, clientMessageId])
```

The mobile app generates this ID locally (e.g. a UUID) before
sending. The server uses it together with the sender ID to detect
"this exact message was already persisted" on a retry, rather than
creating a duplicate. Scoping uniqueness to the sender matches the
idempotency lookup and prevents one account's client-generated ID
from blocking another account that happens to generate the same ID.
It is `null` for any message that predates this feature (existing
historical messages) — the column is additive and optional, so no
backfill is needed.

Before an agent changes `backend/prisma/schema.prisma`, Ankur must
explicitly approve this migration, as required by
`ai-workflow-rules.md`. After approval, run it manually from
`backend/`:

```powershell
npx prisma migrate dev --name add_client_message_id
```

Confirm the migration succeeds and commit both the schema and the
new migration directory before implementation continues.

## Scope

### In scope

- The schema addition above
- Extending `socket-server`'s `message:send` handler to accept an
  optional `clientMessageId`, and to be idempotent: if a message
  with the same `(senderId, clientMessageId)` already exists,
  return that existing message's data instead of creating a new one
- Mobile: generating a local ID and an optimistic local message the
  instant Send is tapped, before any network round-trip
- Mobile: persisting not-yet-confirmed messages to durable local
  storage (surviving an app restart/kill, not just in-memory state)
- Mobile: automatically flushing the queue in order when the socket
  transitions to `connected` (including after Feature 11's
  reconnection)
- Mobile: reconciling a queued local message with its real
  server-issued message once confirmed (replacing the local ID/
  timestamp with the real ones, without creating a duplicate row in
  the chat UI)
- Updating the tick display: clock now means genuinely
  "local-only, not yet sent" (this feature); single tick means
  `SENT`/`DELIVERED` (unchanged from the Feature 13 follow-up);
  double tick means `READ` (unchanged)

### Out of scope

- Media/image messages (still not implemented at all — Feature 16+)
- Editing or deleting a queued/sent message
- Reordering the queue, priority sending, or per-message manual
  cancel (a manual retry affordance for a stuck message is optional
  and welcome if it fits naturally, but not required)
- Any REST API changes — `clientMessageId` does not need to be
  exposed to other participants and does not appear in
  `GET /api/conversations` or the message-history endpoint's
  response
- Group chat behavior (still project-wide out of scope)

## Socket-Server Changes

### `message:send` payload

Add an optional field:

```ts
{ conversationId: string; content: string; clientMessageId?: string }
```

Validate with Zod: if present, `clientMessageId` must be a
non-empty string with a reasonable max length (e.g. 100 chars) —
do not assume a specific format (UUID or otherwise), just bound its
length.

### Idempotent handling

1. If `clientMessageId` is provided, first check for an existing
   `Message` with the same `senderId` and `clientMessageId`.
2. If found: skip creation entirely. Acknowledge the **sender**
   with that existing message's data (so their client can reconcile
   its local optimistic entry). Do **not** re-broadcast `message:new`
   to recipient rooms — if the original send actually reached
   recipients, re-broadcasting is redundant; if it didn't (e.g. the
   whole transaction never completed the first time), the message
   wouldn't exist yet and this branch wouldn't trigger at all.
3. If not found: proceed with the existing Feature 08 transaction
   exactly as before, additionally storing `clientMessageId` on the
   created row.
4. Handle the same race pattern as Feature 05's `directKey`: if a
   concurrent duplicate request hits the unique constraint, catch
   it and re-fetch/return the existing record rather than erroring.
5. Include `clientMessageId` (nullable) in the ack and in the
   `message:new` broadcast payload's type, even though only the
   sender's own other devices would ever meaningfully use it —
   recipients can ignore the field.

## Mobile Changes

### Sending — the optimistic path

1. On Send: generate a `clientMessageId` (a UUID is fine — check
   whether a UUID-generation utility already exists in the project
   before adding a new dependency for this alone).
2. Immediately construct a local message object: the generated ID,
   the typed content, `senderId: currentUserId`, a local timestamp
   (`Date.now()`), and a local-only status marker distinct from the
   server's `SENT`/`DELIVERED`/`READ` values (e.g. `'PENDING'`).
3. Add it to the currently-displayed message list right away — this
   is what makes sending feel instant.
4. Persist it to durable local storage (see below) immediately,
   before attempting to send — so it survives an app kill even if
   the send hasn't been attempted yet.
5. If the socket is currently `connected` (per Feature 11's
   connection state), attempt `message:send` immediately, including
   `clientMessageId`.
   - On success: replace the local `'PENDING'` entry with the
     server's real message (real ID, real `createdAt`, real
     `status`) — matched by `clientMessageId`, not by content or
     local ID. Remove it from the durable queue.
   - On failure/timeout, or if the socket was not connected at all:
     leave the message as `'PENDING'` in both the UI and the durable
     queue. Do not retry immediately in a loop — the reconnect-flush
     below handles retrying.

### Durable local storage

Use a straightforward persisted key-value store for the queue (e.g.
`@react-native-async-storage/async-storage` if nothing suitable is
already installed — check first). Message content is not
credential/token data, so this does not need SecureStore's
encryption; keep encrypted storage reserved for auth tokens as
already established.

Store enough per queued message to both display it and resend it:
`clientMessageId`, `conversationId`, `content`, local timestamp.
Key the queue in a way that lets the app reload all pending messages
across all conversations at startup (e.g. one array under a single
key, or one key per conversation — implementer's choice, document
whichever is chosen).

### Flushing the queue on reconnect

Whenever the socket transitions to `connected` (initial connect, or
any later reconnection per Feature 11), read the durable queue and
attempt to send each pending message **in original order**, per
conversation. If one fails, stop flushing further messages for that
conversation on this attempt (preserving order) — the next
`connected` transition will retry from where it left off. A failure
in one conversation's queue must not block flushing a different
conversation's queue.

### Loading pending messages at app startup

On cold start, before or alongside the existing auth/session
restoration, load the durable queue into memory so that if the user
opens a conversation with pending messages, they appear immediately
(as `'PENDING'`) rather than only appearing after a successful send.

### Tick rendering update

Update Feature 13's rendering logic:

| Local status                             | Icon        |
| ---------------------------------------- | ----------- |
| `'PENDING'` (this feature, local-only)   | clock       |
| `SENT` or `DELIVERED` (server-confirmed) | single tick |
| `READ`                                   | double tick |

This is the change that makes the clock icon meaningful again — it
now only ever appears for a message that has not yet reached the
server at all.

### Ordering

Sort using each message's best-available timestamp: the local
timestamp for a still-`'PENDING'` message, the real `createdAt` once
confirmed. A message's position in the list may shift slightly the
moment it's confirmed (from its optimistic local time to the
server's authoritative time) — this is expected and matches how
real messaging apps behave, not a bug to prevent.

## File organization

```text
mobile/
  lib/
    offline/
      pendingMessagesStore.ts   — durable queue read/write/remove
      useQueueFlush.ts          — reconnect-triggered flush logic,
                                   or integrated into SocketContext
  app/
    (app)/
      conversation/
        [conversationId].tsx    — optimistic add-on-send, merge
                                   pending messages into the
                                   displayed list
  components/
    conversation/
      message-bubble.tsx        — updated tick logic (PENDING/
                                   SENT-DELIVERED/READ)
```

Adjust to match whatever the actual current file names/locations
are from Features 09/11/13 — do not create parallel duplicates.

## Security Notes

- `clientMessageId` is not sensitive — it's a client-generated
  correlation ID, not a credential. No special handling needed
  beyond the length validation already specified.
- Continue not logging message content in `socket-server`, per all
  prior features' conventions.
- The durable local queue holds message content in plain (not
  SecureStore-encrypted) storage — acceptable, since message content
  itself is not a credential and is already visible on-screen
  regardless.

## Testing Checklist

Use two real devices/accounts (A and B).

1. With A online, send a message — it appears instantly with a
   clock icon, then flips to a single tick within a moment (fast
   enough that the clock is barely visible on a good connection —
   this is expected, not a bug).
2. Put A in airplane mode. Send a message — it appears with a clock
   icon and stays that way (no error, no crash).
3. Force-close A's app entirely while that message is still pending
   (still in airplane mode). Reopen the app — the pending message is
   still visible with a clock icon (proves durable persistence, not
   just in-memory state).
4. Turn off airplane mode. The queued message auto-sends without any
   user action, and its icon updates to a single tick once confirmed
   — B receives it.
5. Queue two messages while offline, in a specific order. Reconnect
   — confirm both send in the same order they were typed, not
   reversed or interleaved oddly.
6. Deliberately simulate the "ack lost" race if feasible (or at
   minimum, reason through it with the agent): confirm that if a
   `clientMessageId` retry is sent for a message the server actually
   already has, no duplicate appears in B's chat.
7. Queue messages in two different conversations while offline.
   Reconnect — both conversations' queues flush independently.
8. Toggle light/dark mode — the clock icon remains visually
   consistent with the single/double tick icons from Feature 13
   (same size/positioning, following through on the earlier fix).
9. `npx tsc --noEmit`, `npm run lint`, and `npx prettier --write .`
   pass in `mobile/`; equivalent checks pass in `socket-server/`.

## Before Marking This Feature Complete

Per `ai-workflow-rules.md`:

1. All nine checks above pass on two real devices.
2. The schema migration is committed and no unrelated model/field
   changed.
3. No REST endpoint (`backend/app/api/`) changed.
4. Mobile and socket-server TypeScript/lint/Prettier checks pass.
5. Update `progress-tracker.md`: mark this feature complete, and set
   **Feature 15 — Mobile Live Inbox and UX Polish** as next.
