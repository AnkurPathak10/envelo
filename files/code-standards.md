# Code Standards

## General

- Keep modules small and single-purpose — a file that handles auth
  should not also handle messaging logic
- Fix root causes, do not layer workarounds (especially around
  socket reconnection and token refresh — these are easy to
  patch-over instead of fixing properly)
- Do not mix unrelated concerns in one component, route, or socket
  event handler

## TypeScript

- Strict mode required throughout (`backend/`, `socket-server/`,
  and `mobile/`)
- Avoid `any` — use explicit interfaces or narrowly scoped types,
  especially for socket event payloads and JWT claims
- Validate unknown external input (request bodies, socket event
  payloads, JWT contents) at system boundaries before trusting it

## Next.js (backend/)

- Default to server-side logic in API routes; no client components
  needed here since this is a pure API backend for the mobile app
- Keep route handlers focused on a single responsibility (one
  action per endpoint)
- Validate and parse request input before any logic runs
- Enforce auth (valid access token) and ownership/participant
  checks before any read or mutation

## Socket.io (socket-server/)

- Verify the JWT access token on connection (handshake `auth`
  payload) before allowing any event to be handled
- Each socket event handler does one thing (e.g. `message:send`,
  `message:delivered`, `message:read`) — do not overload a single
  event with multiple behaviors
- Never trust a `userId`/`conversationId` sent from the client
  without checking it against the authenticated session and
  participant list

## Expo / React Native (mobile/)

- Functional components with hooks only
- Keep navigation, screens, and reusable UI components in separate
  folders (see File Organization below)
- Store tokens only via Expo SecureStore — never AsyncStorage or
  in-memory-only state that would force re-login on every app
  restart

## Data and Storage

- Metadata (users, messages, conversations, status) belongs in
  Postgres via Prisma
- Media (images) belongs in Cloudinary — store only the returned
  URL in the database
- Do not store binary/large content directly in the database

## File Organization

- `mobile/` — Expo/React Native app (screens, components,
  navigation, API + socket client)
- `backend/` — Next.js app (API routes, Prisma client, auth logic)
- `socket-server/` — Node/Express/Socket.io app (connection
  handling, event handlers, shared Prisma client)
- `prisma/` — schema.prisma and migrations, shared by `backend/`
  and `socket-server/`
