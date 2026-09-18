# Envelo socket server

Create a local `.env` (never commit it) with the same JWT access secret and pooled database URL used by `backend/.env`:

```env
PORT=4000
JWT_ACCESS_SECRET=...
DATABASE_URL=...
```

Install dependencies, generate the socket-specific Prisma client from the authoritative backend schema, and start development:

```powershell
npm install
npm run dev
```

`npm run build` generates the same client before compiling production code. `npm run generate:all` is available when both the backend and socket clients need regeneration; stop any running backend process first on Windows so its Prisma engine file is not locked. Database migrations remain owned by `backend/` and must never be run from this package.

## Two-client message verification

Start the socket server, then provide access tokens for two users who participate in the same direct conversation:

```powershell
$env:TEST_SENDER_TOKEN = '...'
$env:TEST_RECIPIENT_TOKEN = '...'
$env:TEST_CONVERSATION_ID = '...'
npm run verify:message-flow
```

The script checks that both clients receive the same `message:new` payload returned by the sender acknowledgement, then confirms the message and recipient `SENT` status in the configured database. It always disconnects both sockets and Prisma before exiting.

## Delivery and read-state verification

Feature 12 adds authenticated `message:delivered` and `message:read` client events. Rows only move forward from `SENT` to `DELIVERED` to `READ`. Every row that actually changes emits an individual `message:status` event to the original sender's `user:<senderId>` room.

With the backend and socket server running on their default ports, run:

```powershell
npm run verify:message-status
```

The script creates isolated sender, recipient, and outsider accounts in the configured database; verifies persisted status transitions, authorization, no-downgrade behavior, sender broadcasts, and both REST status fields; then deletes all temporary records. Override `TEST_SOCKET_URL` or `TEST_API_URL` when verifying servers on alternate ports.
