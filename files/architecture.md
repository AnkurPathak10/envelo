# Architecture Context

## Stack

| Layer                  | Technology                                   | Role                                                                 |
| ----------------------- | --------------------------------------------- | --------------------------------------------------------------------- |
| Mobile Frontend         | Expo + React Native + TypeScript             | Chat UI, client-side logic, WebSocket + REST client                 |
| Main Backend            | Next.js (API routes)                         | Auth (signup/login/token issuing), REST APIs, conversation/message history |
| Real-time Backend       | Node.js + Express + Socket.io                | WebSocket server — live message delivery, delivery/read events      |
| Database                | Prisma + Neon Postgres                       | Users, conversations, messages, message status, refresh tokens      |
| Auth                    | Custom JWT (access + refresh tokens), bcrypt | Session management, password hashing                                |
| Media Storage           | Cloudinary                                   | Chat images/media, served via CDN                                   |
| Deployment — backend    | Vercel                                       | Hosts the Next.js app                                                |
| Deployment — socket server | Render                                    | Hosts the always-on Socket.io process (Railway excluded)            |

## System Boundaries

- `mobile/` — Expo/React Native client. Owns all UI, navigation,
  local state, and the WebSocket + REST client connections. Does
  not talk to Postgres directly.
- `backend/` (Next.js) — Owns authentication (signup, login, token
  issuing/refresh), REST endpoints for conversation/message
  history, and the Prisma client as the source of truth for the
  database. Does not hold long-lived WebSocket connections.
- `socket-server/` (Node + Express + Socket.io) — Owns the
  real-time layer only: accepting authenticated WebSocket
  connections, broadcasting new messages, and emitting
  delivery/read status events. Verifies JWTs but does not issue or
  refresh them. Persists messages via the shared Prisma client.
- `prisma/` — Shared schema and migrations, used by both
  `backend/` and `socket-server/`.

## Storage Model

- **Database (Neon Postgres via Prisma)**: users, conversations,
  conversation participants, messages, message status
  (sent/delivered/read), refresh tokens (stored hashed).
- **Blob storage (Cloudinary)**: message images/media, profile
  pictures. Only the resulting URL is stored in the database —
  binary content never touches Postgres.

## Auth and Access Model

- Users authenticate with email/password against the custom auth
  system (no third-party provider).
- On login, the backend issues a short-lived JWT access token and
  a long-lived refresh token. The refresh token is stored hashed
  in the database and rotated (invalidated and reissued) each time
  it's used.
- The mobile client stores the refresh token in Expo SecureStore
  (encrypted at rest), never in plain AsyncStorage.
- The access token is sent as a Bearer token on REST requests and
  during the Socket.io connection handshake; the socket server
  verifies it but never issues new ones.
- A user can only read or send messages in conversations they are
  a participant of — enforced on both the REST endpoints and the
  socket server before any read/write.

## Invariants

1. The Socket.io server never performs signup/login/token-issuing
   logic — that is the Next.js backend's responsibility exclusively.
2. A message is persisted to Postgres before (or atomically with)
   being broadcast to other clients — no message exists only
   in-memory on the socket server.
3. Refresh tokens are never stored in plaintext, on the server or
   the client; access tokens are short-lived and never persisted
   to disk unencrypted.
4. No Redis and no multi-instance socket server scaling is
   introduced unless a specific, demonstrated need arises — v1 runs
   a single socket server instance.
5. Group chat, calls, and end-to-end encryption are explicitly out
   of scope until `project-overview.md` is updated to bring them
   into scope.
