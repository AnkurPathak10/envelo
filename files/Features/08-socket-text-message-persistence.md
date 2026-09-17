# Feature 08: Socket Text Message Persistence and Broadcast

## Goal

Extend `socket-server/` so an authenticated socket can send a single
plain-text message to a direct conversation. The server must:

1. Validate the event payload.
2. Confirm the authenticated sender belongs to the conversation.
3. Persist the message and its initial recipient status in Neon.
4. Update conversation recency.
5. Only then acknowledge the sender and broadcast the durable message
to both users’ active sockets.

This feature is **socket-server-only**, plus the one necessary shared
Prisma generator configuration. It does not add mobile UI or a chat
screen. Feature 09 will consume the event from the mobile app.

## Critical invariant

```text
No successful `message:new` broadcast may exist without a matching
committed Message row in Neon.
```

The transaction must complete before any `io.emit` / room emit. If
persistence fails, emit nothing and return a failure acknowledgement.
This prevents “ghost” messages that disappear after an app restart.

## Scope

### In scope

- A generated Prisma client used only by `socket-server/`
- A Socket.io `message:send` event with typed acknowledgement
- Runtime Zod validation of untrusted event payloads
- Conversation-participant authorization from the database
- Atomic `Message` creation, recipient `MessageStatus(SENT)` creation,
  and `Conversation.updatedAt` update
- User-scoped Socket.io rooms and a `message:new` broadcast
- A safe local integration-verification method
- Socket-server build, Prettier, and manual tests

### Out of scope

- Mobile screens, mobile socket lifecycle, chat UI, or input fields
- Changes to the existing backend REST routes
- New Prisma data-model fields or database migrations
- Running migrations from `socket-server/`
- Delivery/read updates, typing, presence, media, offline queues,
  retries, edits, deletes, reactions, groups, Redis, or deployment
- Replacing the temporary mobile Feature 04 socket hook (Feature 09
  replaces it with the real mobile lifecycle)

## Architecture

### Single source of truth for the schema

`backend/prisma/schema.prisma` remains the only Prisma schema and the
only location of migrations. Do **not** copy the schema into
`socket-server/` and do not create a second migrations folder.

The schema currently has one `prisma-client-js` generator for the
backend. Add a second generator that writes a generated client into
the socket-server source tree:

```prisma
generator socketClient {
  provider = "prisma-client-js"
  output   = "../../socket-server/src/generated/prisma"
}
```

This is a generator-output change only: it changes no models, fields,
relations, enums, migration history, or database tables.

Because `ai-workflow-rules.md` protects `schema.prisma`, Ankur must
explicitly approve this exact generator addition before implementation.

### Why a second generated client is necessary

The backend Prisma client is generated inside backend dependencies and
cannot safely be imported by a separate Node project. The socket
server needs its own generated Prisma client to query Neon, but both
clients must be generated from exactly the same authoritative schema.

```text
backend/prisma/schema.prisma
       ├── backend Prisma client        → Next.js REST/history API
       └── socket Prisma client         → Socket.io persistence only
```

Both processes query the same Neon database. Only `backend/` owns
migrations.

### Final message flow

```text
Sender mobile (Feature 09)
  │  socket.emit('message:send', { conversationId, content }, ack)
  ▼
Socket.io server
  │  socket.data.userId from JWT middleware
  │  Zod validate + participant authorization
  ▼
Prisma transaction against Neon
  ├── create Message
  ├── create SENT MessageStatus for each recipient
  └── update Conversation.updatedAt
  ▼
Socket.io user rooms
  ├── user:<senderId>      receives message:new
  └── user:<recipientId>   receives message:new
  ▼
Sender acknowledgement returns the same durable message payload
```

The sender receives the broadcast too. This lets a future mobile
client use the server-created record (real ID and timestamp) rather
than inventing a local message as the source of truth.

## Manual setup required from Ankur

Before the agent begins:

1. Explicitly approve the `socketClient` generator block above.
2. Add these values to `socket-server/.env`:

```env
PORT=4000
JWT_ACCESS_SECRET=<same exact value as backend/.env>
DATABASE_URL=<same exact value as backend/.env DATABASE_URL>
```

`DATABASE_URL` is required at runtime by Prisma. Keep it out of Git.
Do not add `DATABASE_URL_UNPOOLED` unless a future socket-specific
operation actually needs it; migrations remain backend-only.

3. Confirm `socket-server/.gitignore` includes:

```gitignore
.env
src/generated/
```

The generated Prisma client is build output and must not be committed.

4. Install the required socket-server packages at the same stable
Prisma version used by `backend/`:

```powershell
cd socket-server
npm install @prisma/client@6.19.3 zod
npm install --save-dev prisma@6.19.3 socket.io-client
```

- `@prisma/client` provides the Prisma runtime required by the
  generated `prisma-client-js` client.
- `prisma` generates the socket client but must never run `migrate` in
  this package.
- `zod` validates untrusted socket event data.
- `socket.io-client` is a development-only integration-test client;
  it is not part of the production server behavior.

If the backend’s pinned Prisma version changes in the future, update
both packages together. Never use `latest` here.

## Prisma generation and package scripts

After adding the generator block, generate both clients from the
single schema:

```powershell
cd socket-server
npx prisma generate --schema=../backend/prisma/schema.prisma
```

Update `socket-server/package.json` so generation happens before
building and starting production code, for example:

```json
{
  "scripts": {
    "generate": "prisma generate --schema=../backend/prisma/schema.prisma",
    "dev": "npm run generate && ts-node-dev --respawn --transpile-only src/index.ts",
    "build": "npm run generate && tsc",
    "start": "node dist/index.js"
  }
}
```

The agent may choose an equivalent script arrangement, but these rules
are non-negotiable:

- `prisma generate` uses `../backend/prisma/schema.prisma`.
- No `prisma migrate`, `db push`, `db execute`, or `migrate resolve`
  command exists in `socket-server/package.json`.
- The generated output exists before TypeScript compilation.

## Environment validation

Extend `socket-server/src/lib/env.ts` to fail fast for a non-empty
`DATABASE_URL`, alongside the existing validated `PORT` and
`JWT_ACCESS_SECRET`.

Do not log the URL or any secret. The error may name the missing
variable but must not print its value.

## File organization

```text
socket-server/
  src/
    index.ts                         — server setup, middleware,
                                       connect/disconnect, registers handlers
    auth/
      verifySocketToken.ts           — existing handshake middleware
    events/
      messages.ts                    — `message:send` handler only
    lib/
      env.ts                         — validates PORT, JWT secret, DB URL
      prisma.ts                      — one PrismaClient instance + shutdown
      messages.ts                    — payload schema, safe select/mapping,
                                       shared event types
      rooms.ts                       — userRoom(userId) helper
    generated/
      prisma/                        — generated, gitignored, never edited
  scripts/
    verify-message-flow.ts           — manual dev integration test only
```

Keep each module focused. `index.ts` must not grow into a large
message-persistence implementation.

## Prisma client: `src/lib/prisma.ts`

Import `PrismaClient` from the generated socket output, not from the
backend project and not from the default `@prisma/client` import:

```ts
import { PrismaClient } from "../generated/prisma";
```

Create one client instance for the running socket process. Add graceful
shutdown cleanup for `SIGINT` and `SIGTERM` so the process calls
`prisma.$disconnect()` before exiting.

Do not use Prisma migrations, `PrismaClient` from `backend/`, or a
new database abstraction layer.

## User rooms: `src/lib/rooms.ts`

Create a tiny helper:

```ts
export function userRoom(userId: string): string {
  return `user:${userId}`;
}
```

In the existing `connection` handler, after authentication succeeds:

```ts
socket.join(userRoom(socket.data.userId));
```

All active devices/sockets belonging to a user join the same room.
This is deliberately user-scoped instead of conversation-scoped:

- It lets a recipient receive a new message even before Feature 09
  opens that conversation screen.
- It supports multiple devices for one user without special logic.
- Feature 09 filters received messages by `conversationId` locally.

Never let a client request an arbitrary room name or join another
user’s room.

## Shared event types and message mapping: `src/lib/messages.ts`

Define explicit types for the boundary. Suggested public payload:

```ts
export interface TextMessagePayload {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
}
```

Define the send payload as an unknown runtime input, then validate it
with Zod:

```ts
const messageSendSchema = z.object({
  conversationId: z.string().trim().min(1),
  content: z.string().trim().min(1).max(2000),
});
```

Important behavior:

- Use the parsed/trimmed `content`, never the raw content.
- Reject whitespace-only text.
- A 2,000-character maximum is the v1 text-message limit.
- The client never sends `senderId`, `createdAt`, status, media URL,
  message ID, or recipient ID. The server derives all of these.

Use an explicit Prisma `select` and one `toTextMessagePayload`
function. The emitted/acknowledged shape must contain only the five
fields above—no whole Prisma objects, media URL, status rows, email,
token, or database relation data.

## Event contract

### Client → server: `message:send`

```ts
socket.emit(
  'message:send',
  { conversationId: 'clx...', content: 'Hello!' },
  (result) => { /* acknowledgement */ },
);
```

The acknowledgement has exactly one of these shapes:

```ts
{ ok: true, message: TextMessagePayload }
```

```ts
{ ok: false, error: string }
```

The server must always invoke the acknowledgement callback if it was
provided. This prevents a future mobile sender from waiting forever.

### Server → clients: `message:new`

```ts
socket.on('message:new', (message: TextMessagePayload) => {
  // Feature 09 consumes this.
});
```

Emit `message:new` only after the complete transaction succeeds.
Broadcast the same `TextMessagePayload` that is returned in the
successful acknowledgement.

## `message:send` handler: exact server behavior

Implement the handler in `src/events/messages.ts`, registered by
`index.ts`. The handler must follow this order exactly:

1. Read the sender ID only from `socket.data.userId`, assigned by the
   existing JWT handshake middleware.
2. Validate the unknown payload with `messageSendSchema`.
   - Invalid data → acknowledge `{ ok: false, error: "Invalid message" }`.
   - Do not emit anything and do not query/write a message.
3. In a Prisma transaction, look up the participant row matching
   `(conversationId, senderId)`.
   - If no row exists, acknowledge `{ ok: false, error: "Conversation not found" }`.
   - Use this same message for a missing conversation and a
     conversation the sender does not belong to. Do not reveal which
     one occurred.
4. Obtain the other participant(s) from the already-authorized
   conversation. There are exactly two participants for direct chats
   today, but structure the status and recipient mapping as a list so
   it remains correct if groups are deliberately added later.
5. Still inside the same transaction:
   - Create `Message` with `conversationId`, `senderId`, trimmed
     `content`, and `mediaUrl: null`.
   - Create one `MessageStatus` for every recipient other than the
     sender, each with `status: SENT`.
   - Update that conversation’s `updatedAt` to `new Date()`.
6. Map the committed message to `TextMessagePayload`.
7. After the transaction resolves, emit `message:new` to the sender
   room and every recipient room:

```ts
io.to([userRoom(senderId), ...recipientIds.map(userRoom)])
  .emit('message:new', message);
```

8. Acknowledge `{ ok: true, message }`.
9. If an unexpected database/runtime error occurs:
   - Log a concise server-side error without tokens or message text.
   - Acknowledge `{ ok: false, error: "Unable to send message" }`.
   - Do not emit `message:new`.

Do not trust `conversationId` authorization just because the client
has a valid JWT. Authentication proves who sent the event;
participant lookup proves where that user may send.

## Socket type safety

Define TypeScript interfaces for client-to-server events,
server-to-client events, socket data, and acknowledgements. Instantiate
the Socket.io `Server` and `Socket` generics with them where practical.

At minimum, avoid `any` for event payloads. Runtime Zod validation is
still mandatory even with TypeScript types because socket data arrives
from an untrusted network client.

## Logging rules

Permitted logs:

- socket connected/disconnected with socket ID and authenticated user ID
- `message:send` failure category (validation, authorization, or
  unexpected persistence failure) and socket ID/user ID

Never log:

- raw access tokens
- `DATABASE_URL` or JWT secret
- message content
- full event payloads

## Integration verification script

Add `socket-server/scripts/verify-message-flow.ts`, intended for
manual development verification only. It must:

1. Read test values from environment variables, never hardcode them:

```env
TEST_SENDER_TOKEN=
TEST_RECIPIENT_TOKEN=
TEST_CONVERSATION_ID=
```

2. Create two Socket.io clients against `http://localhost:4000`.
3. Connect both with their respective access tokens.
4. Have the sender emit `message:send` with a unique harmless test
   string (for example a timestamp-based value).
5. Assert/print that both sockets received one matching `message:new`
   event and that the sender acknowledgement is successful.
6. Query Neon through the socket server’s Prisma client or use a safe
   post-check to confirm exactly one matching `Message` row exists,
   its sender/conversation are correct, `mediaUrl` is null, and its
   recipient has a `MessageStatus` of `SENT`.
7. Disconnect both sockets and always disconnect Prisma in `finally`.

Do not add test JWTs, URLs, or user IDs to source control. Document
how to run it, for example:

```powershell
$env:TEST_SENDER_TOKEN = '...'
$env:TEST_RECIPIENT_TOKEN = '...'
$env:TEST_CONVERSATION_ID = '...'
npx ts-node-dev --transpile-only scripts/verify-message-flow.ts
```

The agent may use an equivalent temporary script, but must not skip the
true two-client persistence-and-broadcast test.

## Manual test checklist

1. `npm run generate` succeeds in `socket-server/` and generates both
   clients from the backend schema without copying a schema file.
2. `npm run build` succeeds in `socket-server/`.
3. Start `npm run dev`; `/health` still returns `{ "status": "ok" }`.
4. A valid authenticated socket joins only its own user room.
5. Invalid payloads (missing conversation ID, blank content, content
   over 2,000 characters) receive `{ ok: false, error: "Invalid message" }`;
   no database row or broadcast occurs.
6. An authenticated user cannot send to an invented conversation or a
   conversation they do not participate in; acknowledgement is
   `Conversation not found`; no row/broadcast occurs.
7. Two valid participants connected simultaneously receive exactly one
   matching `message:new` payload; the sender receives a successful
   acknowledgement containing the same durable message ID.
8. The corresponding Neon row has the correct sender, conversation,
   trimmed content, `mediaUrl: null`, and one `SENT` status for the
   recipient.
9. The direct conversation’s `updatedAt` becomes newer after sending.
10. Disconnect the recipient, send a message, then inspect Neon: the
    message persists even though no recipient socket was connected.
11. Restart the socket server and confirm persisted messages remain in
    the Feature 07 history endpoint.
12. `npx prettier --write .` passes in `socket-server/`.

## Before marking Feature 08 complete

1. Every manual test above passes against the real Neon database.
2. The schema still exists only at `backend/prisma/schema.prisma` and
   `socket-server/` has never run a migration command.
3. No changes were made in `mobile/` or existing backend REST routes.
4. `socket-server` build passes and generated client output is ignored.
5. Update `progress-tracker.md` and set **Feature 09 — Mobile Chat
   Screen and Live Text Messaging** as next.