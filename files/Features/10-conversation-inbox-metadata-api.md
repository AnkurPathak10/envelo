# Feature 10: Conversation Inbox Metadata API

## Goal

Extend the authenticated conversation-list API so every conversation includes
the information required for a real chat inbox:

- the newest persisted text message;
- that message's sender and timestamp; and
- the authenticated user's exact unread-message count.

The API must continue ordering conversations by `Conversation.updatedAt`
descending. Feature 08 already advances `updatedAt` after a message commits,
so the conversation with the newest durable message is returned first.

This feature creates the server-owned data contract needed for the user's
requested inbox behavior. It does **not** update the mobile UI yet.

## Why this must precede the UI

A client-only unread counter would be wrong after an app restart, sign-in on a
second device, or messages received while offline. The database already has one
`MessageStatus` row per recipient and message. The backend must calculate the
count from that durable state.

```text
Message committed by Feature 08
  ├── Conversation.updatedAt advances
  ├── recipient MessageStatus = SENT
  └── GET /api/conversations
        ├── newest conversation first
        ├── lastMessage = newest durable message
        └── unreadCount = recipient statuses not READ
```

Feature 11 will add the Socket.io delivered/read state transitions. Feature 12
will consume both foundations in the mobile conversation list, react to
`message:new`, show previews/timestamps/badges, and perform the pending inbox
header/New conversation UI cleanup.

## Scope boundary

This is a **backend-only** feature.

### In scope

- Extend `GET /api/conversations` response data.
- Query one newest message per conversation.
- Count the authenticated recipient's statuses that are `SENT` or `DELIVERED`
  (equivalently, statuses that are not `READ`).
- Preserve participant authorization and newest-first ordering.
- Refactor the existing reusable Prisma selection/mapping helpers where needed.
- Add focused automated or integration verification.
- Run backend type/build and formatting checks.
- Update `files/progress-tracker.md` after implementation.

### Out of scope

- Mobile UI or mobile API type changes.
- Socket.io event changes.
- Mutating a status to `DELIVERED` or `READ`.
- Notification permissions, push notifications, background tasks, or app-icon
  badges.
- A client-side unread cache.
- Changes to `schema.prisma`, migrations, generated Prisma clients, auth/token
  behavior, message persistence, or existing message-history behavior.
- Delivery/read ticks inside the chat screen.
- Image/media preview behavior.

## Existing data model: no migration required

Do not modify the protected Prisma schema. The existing model is sufficient:

```text
MessageStatus
  messageId  -> durable message
  userId     -> recipient whose state this row represents
  status     -> SENT | DELIVERED | READ
```

Feature 08 creates a `SENT` status for each recipient and intentionally creates
no status row for the sender. Therefore:

- the sender's own messages never increase the sender's unread count;
- a recipient's `SENT` and future `DELIVERED` rows count as unread; and
- a recipient's `READ` rows do not count as unread.

Do not add `unreadCount`, `lastMessageId`, or `lastReadAt` columns. These values
are derived from existing normalized records.

## Response contract

Keep the existing endpoint:

```http
GET /api/conversations
Authorization: Bearer <access-token>
```

Each item must become:

```ts
interface ConversationListItem {
  id: string;
  createdAt: string;
  updatedAt: string;
  participant: {
    id: string;
    displayName: string;
    email: string;
  };
  lastMessage: {
    id: string;
    senderId: string;
    content: string | null;
    createdAt: string;
  } | null;
  unreadCount: number;
}
```

The envelope remains:

```json
{
  "conversations": []
}
```

Contract rules:

- Serialize every date as an ISO string.
- Return `lastMessage: null` for a new conversation with no messages.
- Return `unreadCount: 0` when there are no unread recipient statuses.
- Return the exact database-backed count; the later UI may render values above
  99 as `99+`, but the API must not cap the value.
- `lastMessage` contains only the four fields above. Do not expose message
  statuses, relations, `mediaUrl`, participant IDs beyond the public contract,
  or full Prisma objects.
- Keep `content` nullable because that is the existing message schema contract.
  Feature 10 must not invent media-preview behavior.

## Query and mapper design

The existing `directConversationSelect` is shared by direct-conversation
creation and conversation listing. Unread filtering depends on the current
user, so do not force user-specific count logic into the shared creation
selection.

Refactor `backend/lib/conversations.ts` into two focused selections if needed:

1. A stable base/direct-conversation selection used by
   `POST /api/conversations/direct`.
2. A conversation-list selection factory that accepts `currentUserId` and adds:
   - newest message ordered by `createdAt DESC`, then `id DESC`, `take: 1`;
   - a filtered message count where a status exists for `currentUserId` and
     status is not `READ`.

Use Prisma's typed `select`/`satisfies` patterns and inferred payload types.
Avoid `any`, whole-model serialization, and one follow-up query per
conversation. The list should be produced by one bounded Prisma query, not an
N+1 loop.

Conceptually, unread filtering is:

```text
count messages where
  message.statuses has some row with
    userId = authenticated user
    status != READ
```

The route must derive `currentUserId` only from `requireAuth(request)`. Never
accept a user ID through query parameters or request bodies.

## Ordering behavior

Continue querying with:

```text
Conversation.updatedAt DESC
```

Do not sort by `createdAt`, participant name, unread count, or client-provided
data. Feature 08 updates the conversation timestamp in the same transaction as
message creation, so this ordering represents the newest committed activity.

Use a deterministic secondary order by conversation ID if Prisma/query support
makes it practical. The client may later reapply the same `updatedAt` ordering
after live events.

## Authorization and privacy

Preserve the existing rule that the authenticated user receives only
conversations where they have a `ConversationParticipant` row.

The unread count must be filtered to the authenticated user's own
`MessageStatus` rows. Never count or expose another participant's status rows.

Unauthorized and malformed access tokens continue returning the existing 401
shape. No new endpoint or request input is required.

## Files expected to change

```text
backend/
  app/api/conversations/route.ts  — use the user-aware list selection
  lib/conversations.ts            — typed list selection and safe mapper
```

A focused test/verification file may be added if it matches existing project
conventions. Do not touch `mobile/`, `socket-server/`, or Prisma files.

## Verification matrix

Use two conversation participants (A and B) and, where useful, a third
non-participant C. Isolate and clean up any temporary database records.

1. **Authentication** — no token or an invalid token returns 401.
2. **Empty conversation** — a new direct conversation returns
   `lastMessage: null` and `unreadCount: 0` to both participants.
3. **Recipient unread count** — after A sends five committed messages to B,
   B receives `unreadCount: 5` and A receives `unreadCount: 0`.
4. **Status semantics** — recipient statuses in `SENT` and `DELIVERED` count;
   recipient statuses changed to `READ` do not count.
5. **Latest preview** — `lastMessage` is exactly the newest message by
   `createdAt DESC, id DESC`, with only `id`, `senderId`, `content`, and
   serialized `createdAt`.
6. **Newest conversation first** — after a new message commits in an older
   conversation, that conversation becomes the first API item because its
   `updatedAt` advanced.
7. **Isolation** — B's unread count does not appear as A's count; C cannot see
   the conversation at all.
8. **Response safety** — no password hash, token, media URL, relation object,
   or full message/status row appears in the JSON.
9. **No regression** — direct-conversation create/reuse behavior from Feature
   05 and message history from Feature 07 still work.

## Required checks

From `backend/`:

```powershell
npx tsc --noEmit
npm run build
npx prettier --write .
```

Do not run `npm run build` while the same working directory has a running
`next dev` process; both use `.next` and can interfere. Stop the dev process,
run verification, then restart it.

Formatting is the final implementation step required by `code-standards.md`.
If formatting changes TypeScript, re-run the relevant checks.

## What the user will see after Feature 10

No visual change yet. This is intentional: Feature 10 makes the REST contract
correct and restart-safe before the UI relies on it. The endpoint will now
report the newest preview and exact unread count when inspected.

The visible requested behavior arrives after the remaining focused units:

- **Feature 11:** Socket Delivery and Read State Foundation.
- **Feature 12:** Mobile Live Inbox, unread badges, newest-chat movement, last
  message preview/timestamp, and the New conversation/header UX cleanup.

## Completion criteria

Feature 10 is complete only when:

1. The conversation list returns correct `lastMessage` and per-user
   `unreadCount` values from Neon.
2. Conversation ordering reflects newest committed activity.
3. Counts remain correct across process restarts because no client-only state
   is involved.
4. Existing authorization and response-minimization rules are preserved.
5. No mobile, socket-server, schema, migration, generated-client, or auth logic
   changed.
6. Backend TypeScript/build/formatting checks pass.
7. `files/progress-tracker.md` records implementation and verification results.
