# Feature 07: Message History API Foundation

## Goal

Add the first protected message endpoint in `backend/`: an
authenticated participant can load persisted text-message history for
one direct conversation.

This is intentionally a **backend-only** feature. It creates the
secure read contract that the future conversation screen needs, but
does not create messages yet. Feature 08 will add Socket.io persistence
and broadcasting; Feature 09 will add the mobile chat screen and use
this history API.

## Why Feature 07 is split this way

The original roadmap label “Conversation Screen and Real-Time Text
Messages” describes the product milestone, but it crosses all three
system boundaries:

```text
mobile UI  →  Socket.io server  →  Postgres
```

`ai-workflow-rules.md` requires those boundaries to be implemented in
small, independently verifiable units. The safer sequence is:

```text
Feature 07  Backend: protected message-history API
Feature 08  Socket server: persist + broadcast text messages
Feature 09  Mobile: conversation screen, history, and live messages
Feature 10  Delivery/read receipts
```

This order matters: by the time the mobile chat screen exists, it can
load correct history after an app restart and then receive new messages
live. It will never depend on messages that exist only in socket
memory.

## Architecture for the messaging milestone

The final data flow after Features 07–09 will be:

```text
1. User opens a conversation
   Mobile → GET /api/conversations/:id/messages → Next.js → Neon

2. User sends a text message
   Mobile → Socket.io `message:send` → socket-server → Neon
                                      → broadcast `message:new`

3. Recipient is not currently connected
   Message still exists in Neon, so their history request retrieves it
   when they next open the conversation.
```

Feature 07 implements only step 1. It must not start Socket.io work,
message creation, or mobile UI work.

## Scope

### In scope

- `GET /api/conversations/[conversationId]/messages`
- JWT authentication using the existing `requireAuth` helper
- Conversation-participant authorization
- Cursor-based pagination for message history
- Explicit safe response mapping for `Message` data
- Backend build, endpoint tests, and Prettier formatting

### Out of scope

- Creating messages (`POST`, Socket.io events, or any other write)
- Changes to `mobile/` or `socket-server/`
- Prisma schema changes or migrations
- Message status writes, delivery/read receipts, typing, presence,
  media, edits, deletes, reactions, group chats, or notifications
- Reworking Feature 05 conversation endpoints

## Existing data model — do not change it

Use the existing Prisma models exactly as they are:

```prisma
model Message {
  id             String
  conversationId String
  senderId       String
  content        String?
  mediaUrl       String?
  createdAt      DateTime
  statuses       MessageStatus[]
}
```

Feature 07 reads text-history records only. The future Socket.io write
feature will create text messages with a non-empty `content` and
`mediaUrl: null`.

Do not modify `backend/prisma/schema.prisma`. No migration is needed.

## Endpoint

### `GET /api/conversations/[conversationId]/messages`

Example:

```text
GET /api/conversations/clxConversation123/messages?cursor=clxMessage456
Authorization: Bearer <access-token>
```

### Path parameter

- `conversationId` is required.
- Trim it and reject an empty value with `400`:

```json
{ "error": "conversationId is required" }
```

Do not assume a valid-looking CUID means a conversation exists; use
participant authorization against the database.

### Query parameters

| Parameter | Required | Meaning |
| --- | --- | --- |
| `cursor` | No | Message ID from the preceding response's `nextCursor`. Omit for the newest page. |

Do not add a client-controlled `limit` yet. The server uses a fixed,
intentional page size of **50** messages. This keeps the first API
contract simple and prevents unbounded data reads.

If `cursor` is provided, it must be a non-empty string. Otherwise
return `400` with `{ "error": "cursor cannot be empty" }`.

### Authorization and ownership rules

1. Verify the access token with the existing `requireAuth` helper.
2. If authentication fails, return `401`:

```json
{ "error": "Unauthorized" }
```

3. Check that a `ConversationParticipant` row exists for both the
   requested `conversationId` and the authenticated `userId`.
4. If it does not exist—whether the conversation is absent or belongs
   to someone else—return the same response:

```json
{ "error": "Conversation not found" }
```

with `404`.

Do not reveal that a conversation exists to a non-participant.

### Pagination algorithm

Use a fixed `PAGE_SIZE = 50` and fetch **51** records so the backend
can determine whether another page exists:

1. Query messages belonging to the authorized conversation.
2. Order by `createdAt: 'desc'`, then `id: 'desc'` as a deterministic
   tie-breaker.
3. If a cursor exists, use Prisma cursor pagination, skip the cursor
   record itself, and take 51 records.
4. If 51 messages were returned, remove the 51st record and set
   `nextCursor` to the ID of the last returned message.
5. Reverse the returned page before serializing it so the API sends
   messages in chronological order (oldest → newest), which is the
   natural order for the future chat UI.
6. When there is no additional page, return `nextCursor: null`.

The cursor must belong to the same authorized conversation. If it does
not, return `400` with:

```json
{ "error": "Invalid message cursor" }
```

Never use a cursor from another conversation to skip into or infer
that conversation's history.

### Success response

```json
{
  "messages": [
    {
      "id": "clxMessage123",
      "conversationId": "clxConversation123",
      "senderId": "clxUserA",
      "content": "Hello!",
      "createdAt": "2026-09-17T12:00:00.000Z"
    }
  ],
  "nextCursor": "clxOlderMessage456"
}
```

Rules for response mapping:

- Return only `id`, `conversationId`, `senderId`, `content`, and
  `createdAt`.
- `content` is nullable in the schema, so type it as `string | null`.
- Do not return `mediaUrl` yet, because media is out of scope.
- Do not return statuses yet, because receipt logic is Feature 10.
- Do not return sender email, password hashes, refresh-token data, or
  whole Prisma records.

## File organization

```text
backend/
  app/api/conversations/
    [conversationId]/
      messages/
        route.ts             — HTTP parsing, auth, status codes
  lib/
    messages.ts              — page constants, Prisma select object,
                                cursor validation and response mapping
```

Keep `route.ts` thin. Place reusable Prisma selection/mapping logic in
`lib/messages.ts`. Do not mix it into `lib/conversations.ts`, which
continues to own only direct-conversation helpers.

## Implementation guidance

### `backend/lib/messages.ts`

Export focused helpers, for example:

- `MESSAGE_PAGE_SIZE`
- `messageHistorySelect` using Prisma `select` and `satisfies`
- a `MessageHistoryItem` type inferred from Prisma payloads
- `toMessageHistoryItem(message)`

Use type-safe Prisma payload inference; do not use `any` or duplicate
untrusted response shapes in multiple files.

### `route.ts`

Implement only this flow:

```text
parse/validate path + query
→ requireAuth
→ confirm participation
→ validate cursor belongs to this conversation
→ query one page
→ map response
→ return JSON
```

Do not catch all database exceptions and turn them into `404` or
`400`. Only map expected validation/authorization cases; unexpected
errors should use the project’s normal Next.js error behavior so they
can be diagnosed.

### Date serialization

`NextResponse.json` serializes `Date` objects to ISO strings. The
response contract treats `createdAt` as an ISO string. Do not manually
format display dates in the backend; Feature 09 owns mobile display
formatting.

## Security checklist

All statements must be true before Feature 07 is complete:

1. Missing, expired, malformed, or invalid bearer tokens return 401.
2. A user can retrieve only conversations in which they are a
   `ConversationParticipant`.
3. A non-participant gets the same 404 whether a conversation ID is
   valid or invented.
4. A cursor cannot be used across conversations.
5. No password, token, email, media URL, or message-status data leaks
   from this endpoint.
6. The endpoint validates all external path/query input before using
   it in application logic.
7. The endpoint never writes a message or changes a conversation.

## Manual setup required from Ankur

No new package, environment variable, database migration, or service
is needed.

Start the existing backend:

```powershell
cd backend
npm run dev
```

Use the three Feature 05 test users and their access tokens. You may
create messages directly in the Neon database **only for temporary
history-test data**, then remove them afterward; Feature 07 itself
must not add a production message-creation endpoint or socket event.

Recommended temporary test data:

- One authorized direct conversation between User A and User B.
- At least 52 simple text messages in that conversation to verify the
  second page/cursor behavior.
- One separate conversation involving User B and User C to verify
  cross-conversation cursor rejection and access control.

Do not put test SQL or raw production credentials in source files.

## Testing checklist

Use REST client requests against the real backend and Neon database.

1. No Authorization header returns 401.
2. Invalid token returns 401.
3. User A retrieves the newest history page for A↔B successfully.
4. The returned messages are chronological (oldest → newest).
5. With at least 51 messages, the first response contains exactly 50
   messages and a non-null `nextCursor`.
6. Requesting the next page with that cursor returns older messages
   without duplicating the boundary message.
7. The final page has `nextCursor: null`.
8. User C cannot retrieve A↔B history and receives 404.
9. A cursor from B↔C used on A↔B returns 400.
10. An empty/malformed cursor returns 400.
11. The response never includes `mediaUrl`, statuses, password fields,
    or token-related fields.
12. `npm run build` passes in `backend/`.
13. Run `npx prettier --write .` in `backend/` as the final step.

## Before marking Feature 07 complete

1. All tests pass against the real Neon database.
2. `backend/` builds with no errors and has been formatted with
   Prettier.
3. No files outside `backend/` changed.
4. Update `progress-tracker.md` with the endpoint and its pagination
   contract.
5. Set **Feature 08 — Socket Text Message Persistence and Broadcast**
   as next.

## What Feature 08 will do (not part of this feature)

Feature 08 will replace the temporary socket test hook with a real
socket lifecycle. It will authenticate as it already does, validate a
`message:send` payload, verify the sender is a participant, persist a
text message before broadcasting it, update the conversation's
`updatedAt`, and emit a typed `message:new` event only after the
transaction succeeds. It will also decide and document the socket
server’s Prisma-client setup without ever running migrations there.

## What Feature 09 will do (not part of this feature)

Feature 09 will add the mobile `[conversationId]` screen, load history
from this endpoint, subscribe to `message:new`, render incoming and
outgoing bubbles, and submit text through Feature 08’s socket event.