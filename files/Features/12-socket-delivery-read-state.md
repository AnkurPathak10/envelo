# Feature 12: Socket Delivery and Read State Foundation

## Note on sequencing

This feature is backend + socket-server only, matching the pattern
already used for Features 04/07/08 (infrastructure first, mobile
UI as its own follow-up unit). Renumbering as a result:

- **Feature 13** (new): Mobile Message Status Ticks — chat-screen
  UI consuming this feature's data, using the clock/single-tick/
  double-tick scheme (Telegram-style, not WhatsApp's blue-tick
  variant).
- **Feature 14**: Optimistic Sending & Offline Queue (previously
  discussed as "Feature 13") — builds on top of Feature 13's tick
  UI by adding a fourth, local-only "pending" state before a
  message is even persisted.
- **Feature 15**: Mobile Live Inbox & UX polish (previously
  "Feature 13" in the original roadmap) — unread badges, live row
  reordering, last-message preview, header cleanup.

Update `progress-tracker.md`'s "Next Up" section to reflect this
renumbering as part of completing this feature.

## Goal

Track and expose, per message, whether it has reached the
recipient's device (`DELIVERED`) and whether the recipient has
actually opened that conversation and seen it (`READ`) — using the
existing `SENT → DELIVERED → READ` states already defined on
`MessageStatus`. No schema changes. This feature makes the state
transitions actually happen and exposes them over the API; the
mobile chat screen's tick icons are Feature 13.

## Tick semantics (for the eventual mobile UI — confirm understanding here)

This is Telegram-style, not WhatsApp-style, and simpler:

- **Clock** — message is `SENT` only (persisted, recipient has not
  received it yet — e.g. they're offline or app is closed)
- **Single tick** — message is `DELIVERED` (reached the recipient's
  device — their app is running with an active connection, whether
  or not they've opened that specific conversation)
- **Double tick** — message is `READ` (the recipient has opened
  that specific conversation and seen the message)

There is no separate "blue" visual state — `READ` is simply
represented by the double tick, full stop. Confirm this is
understood correctly before building Feature 13's UI on top of it.

## Scope

### In scope

- A `message:delivered` socket event: client tells the server it
  has received one or more messages (fired automatically by the
  mobile app whenever it receives a live `message:new` broadcast,
  regardless of which screen is open — matching "delivered = reached
  the device," not "delivered = this chat is open")
- A `message:read` socket event: client tells the server the user
  has seen messages up to a point in a specific conversation (fired
  by the mobile app only when that conversation's chat screen is
  focused)
- Server-side authorization, idempotent/no-downgrade status
  transitions, and a Prisma transaction per status update batch
- A `message:status` broadcast event: notifies the sender's
  connected device(s) live when a message's status changes, so an
  open chat screen can update its own tick without re-fetching
- Extending Feature 07's message-history response and Feature 10's
  conversation-list `lastMessage` to include a `status` field
- Extending the recovery path from Feature 11: when a reconnecting
  client re-fetches history and finds messages addressed to itself
  that are not yet `DELIVERED`, it should also emit
  `message:delivered` for those — delivery isn't only a live-socket
  concept, it also applies to catch-up-via-REST

### Out of scope

- Any mobile UI/tick rendering — Feature 13
- Offline/local "pending" state before a message is even sent —
  Feature 14
- Conversation-list unread badges, live reordering — Feature 15
  (Feature 10 already computes `unreadCount`; this feature's `READ`
  transitions feed that existing calculation correctly, no new work
  needed there)
- Group conversations (still out of scope project-wide)
- Push notifications

## Data model — no migration needed

`MessageStatus.status` already supports `SENT | DELIVERED | READ`
(defined during Feature 05's schema work). This feature only adds
logic that transitions it, and only ever forward — never write a
status that would downgrade an existing `READ` back to `DELIVERED`,
or `DELIVERED` back to `SENT`.

## Socket Events

### `message:delivered` (client → server)

Payload:
```ts
{ messageIds: string[] }
```

Rules:
1. Require the existing authenticated `socket.data.userId`.
2. Validate with Zod: non-empty array, each ID a non-empty string,
   cap the array length (e.g. 100) to prevent abuse.
3. For each message ID, verify: the message exists, the
   authenticated user is a `ConversationParticipant` of its
   conversation, AND the authenticated user is **not** the sender
   of that message (a sender cannot mark their own message
   delivered to themselves — silently skip such IDs rather than
   erroring the whole batch).
4. For each valid message, update that user's `MessageStatus` row
   from `SENT` to `DELIVERED` — only if it is currently `SENT`; if
   it's already `DELIVERED` or `READ`, leave it unchanged (no
   downgrade, and no wasted write).
5. Do all updates in one Prisma transaction per batch.
6. After commit, emit `message:status` (see below) to the sender's
   `user:<senderId>` room for each message that actually changed.
7. Acknowledge the call with `{ success: true, updated: number }` —
   `updated` reflects how many rows actually changed state (some
   may have been no-ops per rule 4).

### `message:read` (client → server)

Payload:
```ts
{ conversationId: string; upToMessageId: string }
```

Rules:
1. Require authentication.
2. Validate with Zod: both fields non-empty strings.
3. Verify the authenticated user is a `ConversationParticipant` of
   `conversationId`. If not, reject with an error acknowledgement —
   do not silently no-op, since this is a clearer misuse case than
   an individual bad message ID in the batch above.
4. Verify `upToMessageId` belongs to `conversationId`. If not,
   reject similarly.
5. Update every `MessageStatus` row for the authenticated user, in
   this conversation, where the message's `createdAt` is on or
   before the `upToMessageId` message's `createdAt` (and the
   authenticated user is not the sender), from `SENT` or
   `DELIVERED` to `READ`. Use the timestamp-based comparison, not a
   simple ID range, since IDs are not guaranteed sequential by time
   the same way `createdAt` is (mirrors the ordering already used
   in `lib/messages.ts`).
6. Do this in one Prisma transaction (a single `updateMany` with
   the appropriate `where` clause is preferable to looping).
7. After commit, emit one `message:status` event per affected
   message (or a single batched event — implementer's choice,
   document whichever is chosen) to the sender's room(s). Multiple
   messages in one conversation typically share the same sender in
   a 1:1 conversation, so batching by sender is natural here.
8. Acknowledge with `{ success: true, updated: number }`.

### `message:status` (server → client, broadcast only)

Payload:
```ts
{ messageId: string; status: 'DELIVERED' | 'READ' }
```

Emitted only to the sender's `user:<senderId>` room(s) — the
recipient who triggered the status change does not need to receive
their own action echoed back (their local UI can optimistically
reflect it, or Feature 13 can decide to just rely on this event for
everyone symmetrically — implementer's choice, but sending to the
sender is the minimum required behavior).

## REST API Extensions

### `GET /api/conversations/[conversationId]/messages` (Feature 07)

Add a `status` field to each returned message:

```ts
interface MessageHistoryItem {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  createdAt: string;
  status: 'SENT' | 'DELIVERED' | 'READ' | null;
}
```

`status` represents the *other* participant's `MessageStatus` row
for that message — i.e., from the sender's perspective, "has the
recipient received/read this." For a 1:1 conversation there is
exactly one such row per message. Return `null` only in the
genuinely unexpected case that no status row exists (it always
should, since Feature 08 creates one `SENT` row per recipient at
message-creation time) — do not treat `null` as a normal case to
design around.

### `GET /api/conversations` (Feature 10)

Add the same `status` field to the existing `lastMessage` object:

```ts
lastMessage: {
  id: string;
  senderId: string;
  content: string | null;
  createdAt: string;
  status: 'SENT' | 'DELIVERED' | 'READ' | null;
} | null;
```

Do not change `unreadCount`'s existing calculation — it already
correctly counts non-`READ` recipient statuses, and this feature's
`READ` transitions feed it correctly with no changes needed there.

## File organization

```text
backend/
  lib/
    messages.ts          — extend existing select/mapper to
                            include status
    conversations.ts     — extend existing lastMessage select/
                            mapper to include status
socket-server/
  src/
    events/
      messageDelivered.ts  — message:delivered handler
      messageRead.ts        — message:read handler
    lib/
      messageStatus.ts      — shared Zod schemas, Prisma
                               transaction helpers, status-broadcast
                               helper used by both handlers
```

Keep the two event handlers thin; put the shared transaction/
broadcast logic in `lib/messageStatus.ts` so `message:delivered` and
`message:read` don't duplicate authorization/broadcast code.

## Security Notes

- Never allow a client to set another user's message status — every
  update is scoped to `socket.data.userId` from the verified JWT,
  never a client-supplied user ID.
- Never allow a sender to mark their own sent message as delivered/
  read to themselves.
- Never allow status transitions across a conversation the
  authenticated user isn't a participant of.
- Never downgrade a status — a race between a slightly-stale
  `message:delivered` call arriving after `message:read` already
  landed must not revert `READ` back to `DELIVERED`.

## Manual setup required from Ankur

None — no new package, environment variable, or migration.

## Testing checklist

Use two real test accounts (A sends, B receives), both with valid
tokens and an existing direct conversation.

1. A sends a message while B is disconnected — status stays `SENT`.
2. B connects (socket) — the client should fire `message:delivered`
   for the pending message automatically (this is a client-side
   behavior Feature 13 wires up, but verify server-side that a
   manually-sent `message:delivered` call correctly transitions
   `SENT → DELIVERED` and broadcasts `message:status` to A).
3. B opens the conversation and the client fires `message:read` —
   status transitions to `READ`, A receives the `message:status`
   broadcast.
4. A attempts `message:delivered` on their own sent message (as the
   sender) — the message ID is silently skipped, no status change.
5. C (not a participant) attempts `message:delivered` or
   `message:read` on A↔B's conversation — rejected.
6. Send `message:read` with an `upToMessageId` from a different
   conversation — rejected.
7. Call `message:delivered` on an already-`READ` message — no
   change (no downgrade), acknowledgement reports `updated: 0` for
   that ID.
8. `GET /api/conversations/[id]/messages` and `GET /api/conversations`
   both return the correct `status` value reflecting the above
   transitions.
9. `npm run build` passes in `backend/`.
10. `socket-server` build/type-check passes.
11. Run `npx prettier --write .` in both `backend/` and
    `socket-server/` as the final step.

## Before marking Feature 12 complete

1. All eleven checks above pass against the real Neon database.
2. No mobile, Prisma schema, or migration changes were made.
3. Both backend and socket-server build cleanly and are formatted.
4. Update `progress-tracker.md`: mark this feature complete, apply
   the renumbering noted above, and set **Feature 13 — Mobile
   Message Status Ticks** as next.
