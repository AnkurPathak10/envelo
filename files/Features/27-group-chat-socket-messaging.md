# Feature 27: Group Chat — Socket Messaging

## Goal

Extend the existing `message:send`/`message:new` pipeline (Feature
08 onward) so it works for group conversations too — broadcasting to
every active member instead of assuming exactly one other
participant, and skipping delivery/read-status creation for group
messages per Feature 26's design decision.

## Scope

### In scope

- `message:send` authorization: confirm the sender is an *active*
  member (`leftAt IS NULL`) of the conversation, whether direct or
  group.
- Broadcasting: fetch **all** active participants (not just "the
  other one") and emit `message:new` to each of their `user:<userId>`
  rooms — the existing room-per-user pattern already scales to this,
  no new room type needed.
- For `type: GROUP` messages: do **not** create `MessageStatus` rows
  at all (no `SENT`/`DELIVERED`/`READ` tracking) — the message is
  simply persisted and broadcast. Mobile renders a single sent tick
  for any group message with no further status.
- Respect `mutedAt`: this only affects Feature 25's *push*
  notification sending (skip pushing to a muted member), not the
  live in-app socket delivery — a muted conversation still updates
  live if the app is open, it just doesn't push a system notification.
- Extending the inbox `lastMessage` broadcast/update path (Feature
  16's live inbox subscription) to include the sender's display name
  prefix for group previews.
- Extending Feature 22's offline-queue/`clientMessageId` idempotency
  to work identically for group sends — no new logic needed here,
  just confirming the existing per-sender uniqueness check doesn't
  assume a 1:1 conversation anywhere.

### Out of scope

- Any mobile UI (Features 28/29)
- Typing indicators, presence in groups (not requested)
- Media/voice/GIF sending in groups — these should already work
  once the broadcast fan-out is corrected, since they all flow
  through the same `message:send` path; call this out in testing
  rather than re-implementing anything media-specific

## Implementation Notes

- The core change is almost certainly in one place: wherever the
  current handler decides who to broadcast to. Today it likely
  assumes "the sender plus the one other participant." Change this
  to "the sender plus every active participant queried fresh from
  `ConversationParticipant`," and it should generalize to groups of
  any size without touching validation, persistence, or the
  offline-queue reconciliation logic at all.
- Add a branch on `conversation.type` specifically around
  `MessageStatus` creation — skip it entirely for `GROUP`. Do not
  skip it for `DIRECT`; that path is unchanged.
- Kicked/left members (`leftAt` set) must never receive
  `message:new` for messages sent after they left, even if a stale
  client socket somehow still has a room subscription — always
  re-query active membership at send time, don't cache a member list.

## Testing Checklist

Use a group of at least 3 accounts (A admin, B, C members).

1. A sends a message — B and C both receive it live; only a single
   sent tick appears on A's own bubble, no delivered/read ticks ever
   appear regardless of B/C opening the chat.
2. Kick C, then have A send another message — C does not receive it
   (even if C's app is still open/connected).
3. C leaves voluntarily — same result as being kicked, from the
   messaging side.
4. Send an image and a voice note in the group — both work exactly
   as in a direct conversation, delivered to all active members.
5. Mute the group as B, then have A send a message — B still sees it
   live in the app if open (in-app socket delivery unaffected by
   mute); push-notification suppression is verified in Feature 25's
   own follow-up, not required to prove here beyond confirming
   `mutedAt` is being read correctly by whichever service checks it.
6. Offline-queue a group message (airplane mode, send, reconnect) —
   works identically to a direct conversation's existing offline
   queue behavior.
7. Socket-server and backend TypeScript/build checks pass.

## Before Marking This Feature Complete

1. All seven checks above pass against real accounts.
2. No REST endpoint from Feature 26 was changed — this feature only
   touches the socket layer.
3. Update `progress-tracker.md`: mark complete, set **Feature 28 —
   Mobile Group Creation Flow** as next.
