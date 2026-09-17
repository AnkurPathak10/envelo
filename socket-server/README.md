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
