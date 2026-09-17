# Feature 05: Conversation API Foundation

## Goal

Build the protected REST API in `backend/` needed to create and list
1:1 conversations. This is deliberately **backend-only**. It gives
the future mobile conversation-list screen and Socket.io message
feature a secure, persisted source of truth without combining mobile,
Next.js, and socket-server changes in one unit.

By the end of this feature, an authenticated user can search for
other users, create or retrieve one direct conversation with a chosen
user, and list their conversations. There is no chat UI, no message
creation, and no Socket.io event in this feature.

## Why this is next

Feature 04 proved that an authenticated socket can connect. Before
we add real-time message events, we need a conversation identifier
that is created server-side and access-controlled. Building that
first means Feature 06 (mobile conversation list) and Feature 07
(socket message persistence/events) can both use the same contract.

## Scope

### In scope

- Protected user search endpoint for starting a conversation
- Protected endpoint to create or retrieve a 1:1 conversation
- Protected endpoint to list the current user's conversations
- A small schema migration that makes duplicate direct conversations
  impossible at the database level
- Input validation, participant checks, and focused endpoint tests

### Out of scope

- Mobile screens, navigation, or API-client changes
- Socket.io events or changes to `socket-server/`
- Creating or fetching messages
- Delivery/read receipts
- Group conversations, avatars, profile editing, media, pagination,
  or deployment changes

## Important schema decision — confirm before implementation

The current `Conversation` model has no way to enforce a single
conversation for a pair of users. Application-only lookup is not
safe: two concurrent requests could create duplicates.

Before an agent changes `backend/prisma/schema.prisma`, Ankur must
explicitly approve the migration below, as required by
`ai-workflow-rules.md`.

Add this nullable field to `Conversation`:

```prisma
directKey String? @unique
```

For a direct conversation between user IDs `a` and `b`, the backend
must build the key by sorting both IDs lexicographically and joining
them with `:`:

```ts
const directKey = [currentUserId, participantId].sort().join(':');
```

Only direct 1:1 conversations use this field. A future group
conversation keeps `directKey: null`, so the unique constraint does
not prevent multiple groups.

After approval, run the migration manually from `backend/`:

```powershell
npx prisma migrate dev --name add_direct_conversation_key
```

Then confirm the migration succeeds and commit both the schema and
new migration directory. Do not alter any existing model fields or
refresh-token logic.

## Existing auth contract

Every endpoint below uses the existing `requireAuth` helper. The
client sends:

```http
Authorization: Bearer <access-token>
```

On a missing, invalid, or expired access token, return:

```json
{ "error": "Unauthorized" }
```

with HTTP `401`. Never accept the current user ID from the request
body or query string; use the verified JWT subject only.

## Endpoints

### GET `/api/users?query=<text>`

Used only to find someone with whom to start a direct conversation.

Rules:

1. Require authentication.
2. Validate `query`: trim it; minimum 1 character; maximum 100.
3. Search `User.displayName` and `User.email` case-insensitively.
4. Exclude the current user from results.
5. Return at most 20 results, ordered by display name ascending.
6. Select and return only `id`, `displayName`, and `email` — never
   return `passwordHash`, refresh-token fields, or other internal
   data.

Successful response:

```json
{
  "users": [
    { "id": "clx...", "displayName": "Priya", "email": "priya@example.com" }
  ]
}
```

Invalid query returns `400` with a useful `{ "error": "..." }`
message. An empty result is successful and returns `{ "users": [] }`.

### POST `/api/conversations/direct`

Request body:

```json
{ "participantId": "string" }
```

Rules:

1. Require authentication.
2. Validate the body with Zod; `participantId` must be a non-empty
   string.
3. Reject an attempt to create a conversation with oneself with `400`.
4. Confirm the requested participant exists; otherwise return `404`
   with `{ "error": "User not found" }`.
5. Build the sorted `directKey` described above.
6. Create the conversation and its two `ConversationParticipant`
   records atomically in a Prisma transaction.
7. If the direct conversation already exists, return that existing
   conversation rather than making another one.
8. Handle the unique-constraint race safely: if simultaneous requests
   collide, re-fetch by `directKey` and return the existing record.
9. Never allow a client-supplied `conversationId`, `userId`, or
   participant list to decide ownership.

Return `200` whether the conversation was newly created or already
existed. Response shape:

```json
{
  "conversation": {
    "id": "clx...",
    "createdAt": "2026-09-17T00:00:00.000Z",
    "participant": {
      "id": "clx...",
      "displayName": "Priya",
      "email": "priya@example.com"
    }
  }
}
```

`participant` is always the *other* user, never the authenticated
user.

### GET `/api/conversations`

Rules:

1. Require authentication.
2. Return only conversations where the current user has a
   `ConversationParticipant` record.
3. Include the other participant's `id`, `displayName`, and `email`.
4. Include `createdAt` and `updatedAt`.
5. Order newest first by `updatedAt` descending.
6. Do not expose all participants or a conversation owned by another
   user.
7. Messages do not exist in this feature, so do not fabricate a
   `lastMessage` field. Feature 07 will extend this response once
   persistence exists.

Successful response:

```json
{
  "conversations": [
    {
      "id": "clx...",
      "createdAt": "2026-09-17T00:00:00.000Z",
      "updatedAt": "2026-09-17T00:00:00.000Z",
      "participant": {
        "id": "clx...",
        "displayName": "Priya",
        "email": "priya@example.com"
      }
    }
  ]
}
```

## File organization

Keep route handlers thin and add focused helpers rather than putting
all Prisma mapping logic into `route.ts`:

```text
backend/
  app/api/
    users/route.ts
    conversations/
      route.ts
      direct/route.ts
  lib/
    conversations.ts       — directKey creation and response mapping
```

`lib/conversations.ts` must contain no request parsing or HTTP
responses. Route handlers own request validation and status codes.

## Implementation guidance

- Use the existing Prisma singleton from `backend/lib/prisma.ts`.
- Use `zod` for the JSON body and query parameters before database
  work.
- Use explicit Prisma `select` objects. Never return whole `User`
  records.
- Use `prisma.$transaction` for creating the `Conversation` plus
  both participant rows.
- Catch only the known Prisma unique-constraint error required for
the direct-key race; do not turn every database failure into a fake
success.
- Keep TypeScript strict; do not use `any`.
- Do not modify `socket-server/`, `mobile/`, or existing auth routes.

## Manual setup required from Ankur

Before implementation:

1. Confirm the `directKey` schema migration described above.
2. Ensure `backend/.env` still has working Neon connection strings.
3. Start the backend from `backend/`:

```powershell
npm run dev
```

No new service account, secret, npm package, socket setting, or Expo
configuration is required for this feature.

## Testing checklist

Use two real test users, A and B, and an access token for each.

1. Unauthenticated `GET /api/users?query=a` returns `401`.
2. User A searches for B and sees B but not A; returned objects have
   no password-related fields.
3. User A creates a direct conversation with B; response is `200`
   and identifies B as the participant.
4. User A repeats the same request; the same conversation ID is
   returned.
5. User B creates/retrieves a direct conversation with A; the same
   conversation ID is returned.
6. User A cannot create a conversation with A (`400`).
7. User A cannot create a conversation with a non-existent ID (`404`).
8. Both A and B see the conversation in `GET /api/conversations`;
   a third user does not.
9. `npm run build` passes in `backend/`.
10. Run `npx prettier --write .` in `backend/` before considering
    the feature complete.

## Before marking Feature 05 complete

1. All ten tests above pass against the real database.
2. The schema migration is committed and no protected auth or
   refresh-token code changed.
3. `backend/` builds cleanly and is formatted with Prettier.
4. Update `progress-tracker.md` to mark Feature 05 complete.
5. Next feature: **Feature 06 — Mobile Conversation List**, which
   uses `GET /api/conversations` and `GET /api/users` to let a user
   choose a person and open/create a direct conversation. Socket.io
   remains out of that feature.