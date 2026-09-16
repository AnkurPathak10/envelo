# Feature 04: Socket Server Foundation

## Goal

Stand up `socket-server/` for real (it has been an empty scaffold
folder until now) and prove that an authenticated real-time
WebSocket connection works end to end: a logged-in mobile user can
open a socket connection to `socket-server/`, and an unauthenticated
attempt is rejected. No messaging/conversation logic yet — that is
Feature 05. This feature exists purely to get the real-time
connection layer working and understood before building anything
on top of it.

## Scope

### In scope

- Scaffold `socket-server/` as a Node + Express + Socket.io +
  TypeScript project
- A `GET /health` REST endpoint (plain Express, not a socket
  event) to confirm the server is up
- JWT verification on socket connection (reusing the same
  `JWT_ACCESS_SECRET` as `backend/`) — reject the connection if the
  token is missing or invalid
- Logging on connect/disconnect (just `console.log` for now — no
  need for a logging library yet)
- A minimal, temporary test hook in `mobile/` to actually open a
  socket connection from the app and prove it works (to be
  replaced by real usage in Feature 05 — this is scaffolding, not
  final UI)

### Out of scope (do not implement here)

- Any message-related socket events (`message:send`, etc.) —
  Feature 05
- Conversations, message persistence — Feature 05
- Delivery/read receipts — Feature 05
- Deployment to Render — later, once there's a real feature worth
  deploying
- Redis — still not needed (single server instance)

## Manual Setup Required (Ankur — before the agent starts)

1. Find your **JWT_ACCESS_SECRET** value from `backend/.env` — you
   will need to copy this exact value into `socket-server/.env` too
   (the socket server must be able to verify tokens signed by the
   backend, so it needs the same secret).
2. Decide the socket server's port — recommend `4000` (backend
   already uses `3000`).
3. Since you're now using Windows Mobile Hotspot (from Feature 03
   troubleshooting) to put your phone and laptop on the same real
   network, you do NOT need ngrok for the socket server. Once
   `socket-server/` is running, find your laptop's hotspot IP again
   via `ipconfig` (the same `192.168.137.1`-style address used for
   the backend) and use that directly.
4. Create `socket-server/.env`:
   ```
   PORT=4000
   JWT_ACCESS_SECRET=<same exact value as backend/.env>
   ```
5. Add `socket-server/.env` to `socket-server/.gitignore` (create
   the gitignore file if it doesn't exist yet).
6. Add to `mobile/.env`:
   ```
   EXPO_PUBLIC_SOCKET_URL=http://<your-hotspot-ip>:4000
   ```
   (use `http://`, not `ws://` — Socket.io's client handles the
   protocol upgrade itself from a plain http(s) URL)

## Libraries to Install

In `socket-server/`:
```
npm init -y
npm install express socket.io jsonwebtoken cors dotenv
npm install --save-dev typescript ts-node-dev @types/node @types/express @types/jsonwebtoken @types/cors
npx tsc --init
```

In `mobile/`:
```
npm install socket.io-client
```

## File Organization

```
socket-server/
  src/
    index.ts           — Express app + HTTP server + Socket.io
                          server setup, starts listening on PORT
    auth/
      verifySocketToken.ts  — middleware-style function used in
                               Socket.io's connection auth step
    lib/
      env.ts            — loads and validates required env vars
                           at startup (fail fast if
                           JWT_ACCESS_SECRET or PORT is missing)
  package.json
  tsconfig.json
  .env
  .gitignore
```

## Implementation Details

### `src/lib/env.ts`

Read `PORT` and `JWT_ACCESS_SECRET` from `process.env` at startup.
If `JWT_ACCESS_SECRET` is missing, throw immediately and refuse to
start the server — never fall back to a default/hardcoded secret,
since that would silently break auth security.

### `src/auth/verifySocketToken.ts`

Socket.io supports a `io.use((socket, next) => {...})` middleware
pattern that runs before a connection is accepted. Implement:

1. Read the token from `socket.handshake.auth.token` — the client
   is expected to send it there (not as a header), since this is
   Socket.io's standard convention for auth.
2. If no token is present, call `next(new Error("Unauthorized"))`
   — this rejects the connection.
3. Verify the JWT using `JWT_ACCESS_SECRET` (same algorithm/method
   as `backend/lib/auth/tokens.ts` in Feature 02 — the two must be
   compatible since they share a secret and must agree on how the
   token is signed).
4. If verification fails (expired, invalid signature, malformed):
   call `next(new Error("Unauthorized"))`.
5. If verification succeeds: attach the decoded `userId` to the
   socket instance (e.g. `socket.data.userId = decoded.sub`) so
   future event handlers (Feature 05) can access it, then call
   `next()` to allow the connection.

### `src/index.ts`

1. Create an Express app with a single route: `GET /health`
   returning `{ status: "ok" }` with a 200 — useful for quickly
   confirming the server is reachable (including from a browser on
   your phone, same trick used to test the backend earlier).
2. Create an HTTP server wrapping the Express app, and attach
   Socket.io to it (`new Server(httpServer, { cors: { origin:
   "*" } })` — permissive CORS is fine here since this isn't a
   browser-facing production API yet).
3. Apply the `verifySocketToken` middleware via `io.use(...)`.
4. On `io.on("connection", (socket) => {...})`: log
   `` `Socket connected: ${socket.id}, user: ${socket.data.userId}` ``.
5. On `socket.on("disconnect", () => {...})`: log a matching
   disconnect message.
6. Start listening on `PORT`.

### Mobile test hook (temporary)

Add a small, clearly-temporary block to the existing `(app)/home.tsx`
screen (from Feature 03) — NOT a new permanent screen:

- On mount (or behind a test button — agent's choice, whichever is
  simpler), create a socket connection using `socket.io-client`:
  ```ts
  import { io } from "socket.io-client";
  const socket = io(process.env.EXPO_PUBLIC_SOCKET_URL, {
    auth: { token: accessToken },
  });
  ```
  (`accessToken` from `AuthContext`, same one used for REST calls)
- Log to the console (visible in the Expo terminal / dev tools)
  when the socket connects successfully or errors out, so Ankur
  can visually confirm the connection worked.
- Clearly comment this block as temporary test code to be replaced
  in Feature 05, so it isn't mistaken for real architecture later.

## Security Notes

- `JWT_ACCESS_SECRET` must match exactly between `backend/.env`
  and `socket-server/.env` — a mismatch will cause every
  connection to be rejected as invalid, which is a common source
  of confusing bugs here. Double check for typos/trailing spaces
  if connections unexpectedly fail.
- Never log the raw token value, only the fact that a
  connection succeeded/failed and the userId once decoded.
- The socket server does not query the database in this feature —
  no Prisma install needed yet here either (that comes in
  Feature 05, when messages actually need to be persisted).

## Testing This Feature (before moving to Feature 05)

1. Start `socket-server/` (`npm run dev`, using `ts-node-dev` for
   auto-reload — add this as a `dev` script in its `package.json`).
2. Open `http://<hotspot-ip>:4000/health` in your phone's browser
   — confirm you get `{"status":"ok"}`.
3. Run the mobile app, log in (using Feature 03's working auth),
   and confirm the socket-server terminal logs a successful
   connection with the correct `userId` matching your logged-in
   account.
4. Temporarily break the test connection on purpose — e.g. hardcode
   an invalid token string in the mobile test hook — and confirm
   the socket-server terminal logs a rejection, and the client
   receives a connection error rather than silently hanging.
5. Restore the correct token afterward and confirm it reconnects
   successfully.

## Before Marking This Feature Complete

Per `ai-workflow-rules.md`:

1. All four test steps above pass.
2. Code is formatted per `code-standards.md`'s Formatting section
   (run Prettier before finishing).
3. `socket-server/` starts with no errors via its `dev` script.
4. Update `progress-tracker.md`: move this feature to Completed,
   note that the mobile test hook in `home.tsx` is temporary and
   will be replaced in Feature 05, and set Feature 05 (real-time
   messaging) as the next goal.