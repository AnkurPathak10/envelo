# Architecture Context

## Stack

| Layer                      | Technology                                   | Role                                                                       |
| -------------------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| Mobile Frontend            | Expo + React Native + TypeScript             | Chat UI, client-side logic, WebSocket + REST client                        |
| Main Backend               | Next.js (API routes)                         | Auth (signup/login/token issuing), REST APIs, conversation/message history |
| Real-time Backend          | Node.js + Express + Socket.io                | WebSocket server — live message delivery, delivery/read events             |
| Database                   | Prisma + Neon Postgres                       | Users, conversations, messages, message status, refresh tokens             |
| Auth                       | Custom JWT (access + refresh tokens), bcrypt | Session management, password hashing                                       |
| Media Storage              | Cloudinary                                   | Chat images/media, served via CDN                                          |
| Deployment — backend       | Vercel                                       | Hosts the Next.js app                                                      |
| Deployment — socket server | Render                                       | Hosts the always-on Socket.io process (Railway excluded)                   |

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

- **Database (Neon Postgres via Prisma)**: users, direct/group conversations,
  conversation participants with group roles, active/left membership and
  per-member mute state, messages, message status
  (sent/delivered/read), refresh tokens (stored hashed), and directional
  `Friendship` rows (`PENDING`, `ACCEPTED`, `REJECTED`), and per-device
  `PushToken` rows. A rejected
  request's `respondedAt` starts a five-day resend cooldown only in the
  original requester-to-addressee direction; acceptance is mutual.
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
- A new direct conversation requires an accepted friendship in either
  direction. Existing conversations remain accessible without a new gate.
- Group creation and member additions require an accepted friendship
  between the acting user and each added user. Only active group members
  may view group details; admin-only changes are checked server-side.
  A nonempty group keeps an active admin: the sole admin must promote
  someone before leaving. A sole-member admin leaving deletes the group;
  only a group's sole admin may dissolve a nonempty group.
- Group socket sends require active membership. New messages reach every
  active member's user room, including muted members while online; mute
  suppresses only push notifications. Group messages have no per-member
  delivery/read status rows. Their live inbox preview prefixes the sender's
  display name, while the persisted message body stays unchanged.
- Friend request changes are persisted by the Next.js backend before it
  calls the socket server's HMAC-authenticated internal event bridge;
  the socket server emits `friend:request` to each affected user's room.
  Both services use the existing shared `JWT_ACCESS_SECRET` for the bridge
  signature. Set `FRIEND_SOCKET_URL` on the backend deployment to the
  Render socket server's HTTPS origin for live Profile badge updates.
- The authenticated mobile app registers an Expo push token with the
  backend; tokens are unique across accounts and reassigned on sign-in
  from a reused device. A new pending friend request triggers push from
  the backend. A newly persisted chat message triggers push from the
  socket server to each recipient device after its socket acknowledgement.
  Both services use Expo's push API, and push failure never rolls back
  the persisted action. A foreground app suppresses the OS banner and
  uses its live socket updates instead. Notification taps are checked
  against the current account before navigating.

## Invariants

### Calling client (Features 30–32)

- Calling signaling uses the authenticated existing Socket.IO connection;
  Cloudflare RealtimeKit carries the media. `CallProvider` lives above tab
  navigation, and its root overlay owns the full-screen/minimized UI so
  navigation does not create or destroy the media session.
- SDK/native adapters are separated from UI. Expo 54 uses pinned RealtimeKit
  React Native 1.1.0/WebRTC 125.0.1. Native modules load lazily; Expo Go/older
  builds and web continue messaging but report that calling needs a native build.
- Participant credentials exist only in memory during provisioning/joining.
  They are never persisted in history, route parameters, logs, or shared links.
  Server call state is authoritative; incoming push is a hint followed by sync.
- REST call history is an independent cursor stream merged with messages by
  creation time and durable ID. A bounded account/conversation/clear-boundary
  session cache speeds reopening, while the existing persistent message cache
  stays in use. Refreshes do not create blocking message-loading UI.
- Android uses a microphone foreground service with an ongoing notification;
  iOS enables audio background mode. Camera pauses when backgrounded. Chat
  players/recorders yield the native audio session before call media starts.
  Physical-device audio continuity and interruption acceptance remain pending.
- Feature 32 extends the existing `call:invite` payload with `{ callId, userId }`
  for an existing meeting. The single socket coordinator owns joined members,
  independent 45-second invitations, per-user admission, and credential maps;
  existing accepted/sync/ended events carry roster and per-user leave metadata.
  Only a joined member can invite, and the signed backend bridge checks the
  inviter's accepted friendship with the target. There are no new public events
  or database tables. Guest media admission never grants private chat membership
  or history access; Send message opens the guest's friend-gated inviter chat.
- After a third member accepts, the call remains multiparty even as people
  leave. Leaving revokes only that member's provider credential. The last joined
  member leaving finalizes the original single CallLog and revokes remaining
  invitations/credentials; duration starts at the original first acceptance,
  and hadVideo remains monotonic. Direct calls that never become multiparty keep
  their existing two-person end behavior. Restart recovery ends/revokes all
  unfinished calls, rather than reconstructing in-memory invitation state.
- The existing call overlay uses a scrollable participant grid with stable
  identities, video/avatars and mute state. No application participant cap is
  imposed. The configured preset allows nine simultaneous video streams per
  mobile/desktop client; this is a subscription/viewing limit, not an enforced
  meeting admission limit. Larger-call media-window behavior needs device testing.
- Screen sharing, system picture-in-picture, and killed-app CallKit/VoIP ringing
  remain deferred. The minimized call bubble is in-app, not OS picture-in-picture.

### Existing invariants

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
5. Group chat is introduced in stages: Feature 26 supplies the REST
   and schema foundation, Feature 27 supplies socket messaging, and
   Features 28–29 supply mobile UI. Features 30–31 add direct-call signaling
   and mobile media/UI; Feature 32 extends an ongoing direct call with friend
   invitations and multiparty media without converting its private chat to a group.
   End-to-end encryption remains out of scope until separately planned.
