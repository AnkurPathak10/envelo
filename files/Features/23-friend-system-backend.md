# Feature 22: Friend System (Backend)

## Goal

Add a friend request/accept/reject system with a 5-day
resend-cooldown for the rejected party, and make friendship a
prerequisite for starting a *new* direct conversation. This is
backend-only — mobile UI is Feature 23.

## Important schema decision — confirm before implementation

```prisma
enum FriendshipStatus {
  PENDING
  ACCEPTED
  REJECTED
}

model Friendship {
  id           String            @id @default(cuid())
  requesterId  String
  requester    User              @relation("FriendRequestsSent", fields: [requesterId], references: [id], onDelete: Cascade)
  addresseeId  String
  addressee    User              @relation("FriendRequestsReceived", fields: [addresseeId], references: [id], onDelete: Cascade)
  status       FriendshipStatus
  respondedAt  DateTime?
  createdAt    DateTime          @default(now())

  @@unique([requesterId, addresseeId])
}
```

Notes on this design:
- One row per **direction** (requester → addressee). If A requests
  B and B rejects, that row's `status` becomes `REJECTED` with
  `respondedAt` set — this is what drives the 5-day cooldown, scoped
  to *this specific direction only*. B remains free to request A at
  any time (a separate row, opposite direction, per Ankur's
  confirmed answer).
- `ACCEPTED` status is meaningful regardless of which direction
  originally sent the request — once accepted, the pair is mutually
  friends.

Before the agent changes `schema.prisma`, Ankur must explicitly
approve this migration, per `ai-workflow-rules.md`. Run manually
from `backend/` after approval, as with every prior schema change.

## One-time data migration (run once, after schema migration)

For every existing `Conversation` (all direct 1:1, since group chat
doesn't exist):
- If it has at least one `Message`: create an `ACCEPTED`
  `Friendship` row between its two participants (pick either as
  `requesterId`/`addresseeId` — direction is irrelevant once
  `ACCEPTED`).
- If it has zero messages: delete the `Conversation` and its
  `ConversationParticipant` rows entirely.

Write this as a one-off script (`backend/scripts/backfill-friendships.ts`
or similar, matching the project's existing `verify:*` script
conventions) that Ankur runs manually once against the real
database — do not run this automatically on deploy.

## Scope

### In scope

- `POST /api/friends/request` — send/re-send a friend request
- `POST /api/friends/requests/:id/accept`
- `POST /api/friends/requests/:id/reject`
- `GET /api/friends` — list accepted friends
- `GET /api/friends/requests` — list incoming pending requests
- Extending `GET /api/users` search results with each user's
  `friendStatus` relative to the current user
- Requiring an `ACCEPTED` friendship before `POST
  /api/conversations/direct` can create a **new** conversation
  (existing conversations remain accessible regardless — this only
  gates creation of new ones)
- A socket event notifying the addressee's connected devices live
  when a request arrives (in-app badge update only — real OS push
  notifications are Feature 24, not this one)
- The one-time backfill script above

### Out of scope

- Any mobile UI (Feature 23)
- OS-level push notifications (Feature 24)
- Unfriending (not requested — can be added later if wanted)
- Group chat (still project-wide out of scope, though this feature
  is explicitly designed as its prerequisite)

## Endpoints

### `POST /api/friends/request`

Body: `{ addresseeId: string }`

Logic:
1. Require auth. Reject self-requests (400).
2. Confirm `addresseeId` exists (404 otherwise).
3. **If an opposite-direction `PENDING` row already exists**
   (addressee already requested the current user): treat this call
   as an **accept** of that existing request instead of creating a
   new one — this avoids two crossing pending requests between the
   same pair. Return the resulting `ACCEPTED` friendship.
4. Otherwise, look up the row for `(requesterId, addresseeId)`:
   - No row: create one with `status: PENDING`.
   - `PENDING`: reject as a duplicate (400, "Request already sent").
   - `ACCEPTED`: reject as already-friends (400).
   - `REJECTED` with `respondedAt` within the last 5 days: reject
     with a clear cooldown message, including when it expires (400).
   - `REJECTED` with `respondedAt` older than 5 days: update the
     same row back to `PENDING`, clear `respondedAt`, refresh
     `createdAt` (a fresh request, not a duplicate).
5. Emit the socket notification (see below) to the addressee.

### `POST /api/friends/requests/:id/accept`

- Require auth; the authenticated user must be the `addresseeId` on
  that row, and its status must be `PENDING` (404/403 otherwise —
  don't leak which reason).
- Set `status: ACCEPTED`, `respondedAt: now()`.

### `POST /api/friends/requests/:id/reject`

- Same authorization as accept.
- Set `status: REJECTED`, `respondedAt: now()` — this is what starts
  the 5-day cooldown for the original requester.

### `GET /api/friends`

- Require auth. Return all users with an `ACCEPTED` friendship in
  either direction with the current user — `{ id, displayName,
  email, avatarUrl }` per friend, no internal friendship-row fields.

### `GET /api/friends/requests`

- Require auth. Return incoming (`addresseeId = me`, `status:
  PENDING`) requests only, with the requester's public info and the
  `Friendship` row's `id` (needed for the accept/reject calls) and
  `createdAt`.

### Extending `GET /api/users` search

Add a `friendStatus` field per result:
`'NONE' | 'PENDING_OUTGOING' | 'PENDING_INCOMING' | 'FRIENDS' |
'COOLDOWN'` — plus `cooldownEndsAt` (ISO string, only present when
`COOLDOWN`). This is what lets the mobile search screen show the
right control per person (chat vs. add-friend vs. pending vs.
disabled-with-countdown) without a second round-trip.

### `POST /api/conversations/direct` — add the friendship gate

Before creating a genuinely new conversation (the existing
idempotent-reuse path for an already-existing conversation is
unaffected): require an `ACCEPTED` friendship between the two users,
otherwise 403 with a clear message ("You must be friends to start a
conversation").

## Socket Notification

Emit a new event (e.g. `friend:request`) to the addressee's existing
`user:<userId>` room (Feature 08's room pattern) whenever a request
is created or accepted, carrying enough for the mobile app to
refresh its pending-request badge live. This reuses the existing
socket infrastructure entirely — no new connection/auth logic
needed.

## Security Notes

- Every mutation derives the acting user from the verified JWT —
  never from a request body field.
- Accept/reject must verify the authenticated user is genuinely the
  `addresseeId` on that specific row — never allow acting on someone
  else's request.
- The cooldown and duplicate/already-friends checks all happen
  server-side; never trust a client's belief about friendship state.

## Testing Checklist

1. A requests B — B sees it in `GET /api/friends/requests`.
2. B accepts — both now see each other in `GET /api/friends`; a new
   direct conversation between them can now be created.
3. A requests C, C rejects — A retrying immediately gets the
   cooldown error; C requesting A instead succeeds immediately (not
   blocked by A's rejected-and-cooling-down direction).
4. A requests B while B has already (independently) requested A —
   confirm this resolves as an immediate accept, not two pending rows.
5. Attempting `POST /api/conversations/direct` between two
   non-friends is rejected with 403; between friends, succeeds as
   before.
6. Search results correctly reflect `NONE`/`PENDING_OUTGOING`/
   `PENDING_INCOMING`/`FRIENDS`/`COOLDOWN` for various relationship
   states with the current user.
7. Run the backfill script against isolated test data: a
   conversation with messages produces an `ACCEPTED` friendship; an
   empty conversation is deleted.
8. `npx tsc --noEmit` and `npm run build` pass in `backend/`.

## Before Marking This Feature Complete

1. All eight checks above pass against the real database.
2. Migration committed; backfill script run once against production
   data (by Ankur, not automatically).
3. Update `progress-tracker.md`: mark complete, set **Feature 23 —
   Friend System (Mobile UI)** as next.
