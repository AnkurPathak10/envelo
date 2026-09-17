# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Features 03, 04, and 06 implemented - pending manual real-device verification; Features 05, 07, and 08 complete

## Current Goal

- Add `DATABASE_URL` to the local socket-server environment, manually verify the existing Expo Go flows, then begin Feature 09 mobile chat and live text messaging

## Completed

- Repo restructured into `mobile/`, `backend/`, `socket-server/`
  (see `01-project-setup.md`)
- Neon Postgres project created and connected
- Prisma installed in `backend/` (stable v6, pinned explicitly —
  `latest` currently points to an incompatible v8 release
  candidate)
- Initial Prisma schema defined and migrated: `User`,
  `RefreshToken`, `Conversation`, `ConversationParticipant`,
  `Message`, `MessageStatus`
- Expo dev environment confirmed working (`npx expo start`,
  Expo Go on Android)
- EAS CLI connected via browser SSO login (GitHub-based Expo
  account)
- Feature 02: Authentication Backend implemented in `backend/` (Next.js App Router):
  - Initialized Next.js (App Router, TypeScript) in `backend/`
  - Created Prisma Client singleton (`backend/lib/prisma.ts`)
  - Created password hashing & verification using bcrypt (`backend/lib/auth/password.ts`)
  - Created JWT access token signing/verification & HMAC-SHA256 refresh token management (`backend/lib/auth/tokens.ts`)
  - Created reusable `requireAuth` helper (`backend/lib/auth/requireAuth.ts`) ready for future protected routes in Feature 04+
  - Implemented `POST /api/auth/signup` with Zod validation, duplicate email check (409), and token issuance (201)
  - Implemented `POST /api/auth/login` with constant-time/generic error messages (401) against user enumeration, issuing tokens (200)
  - Implemented `POST /api/auth/refresh` with full refresh token rotation (revokes old token, issues new pair)
  - Implemented `POST /api/auth/logout` with idempotent token revocation
  - Satisfied all security requirements (no raw passwords/tokens stored or leaked, short-lived access tokens, generic errors)
  - Verified all 8 test cases from `02-auth-backend.md` passing end-to-end against live database
  - `npm run build` succeeds cleanly with zero errors

- Feature 03: Mobile Auth UI implemented in `mobile/` (commit `6316fd1` — "Done auth screen UI"):

  **Routing & Screens (Expo Router file-based routing):**
  - Removed the Expo starter tab routes (`(tabs)/`, `modal.tsx`) and replaced with two protected route groups: `(auth)/` (unauthenticated) and `(app)/` (authenticated).
  - `app/_layout.tsx` — Root layout using `Stack.Protected` guards based on `useAuth().user` to conditionally render auth vs app group. Wraps the tree in `ThemeProvider` and `AuthProvider`.
  - `app/(auth)/login.tsx` — Login screen with email + password fields, form validation, API error display, and link to signup.
  - `app/(auth)/signup.tsx` — Signup screen with display name, email, password fields, form validation, API error display, and link to login.
  - `app/(app)/home.tsx` — Authenticated placeholder screen showing the user's display name and a logout button.

  **Form Handling & Validation:**
  - Uses `react-hook-form` with `@hookform/resolvers/zod` for declarative form state management.
  - Zod schemas define validation rules (email format, password min length, display name trim + length limits).
  - `Controller` components wire RN `TextInput` to react-hook-form, with per-field inline error messages.
  - Server errors (e.g. duplicate email, wrong credentials) are caught from the API client and surfaced via `setError('root', ...)`.

  **API Client (`mobile/lib/api/`):**
  - `client.ts` — A `fetch`-based API client that auto-attaches Bearer access tokens from SecureStore, implements transparent 401 retry (calls `/auth/refresh` once with the stored refresh token, retries the original request on success, clears session on failure). Exports a typed `ApiError` class.
  - `auth.ts` — Typed wrappers for all four auth endpoints (`signup`, `login`, `refresh`, `logout`), returning `{ user, accessToken, refreshToken }` payloads.

  **Auth State Management (`mobile/lib/auth/`):**
  - `storage.ts` — SecureStore helpers (`getTokens`, `saveTokens`, `clearTokens`) storing access and refresh tokens as separate encrypted keys via `expo-secure-store`.
  - `AuthContext.tsx` — React context + provider that: restores session on mount by reading stored tokens and decoding the access token (or refreshing if expired), exposes `user`, `isLoading`, `signIn`, `signUp`, `signOut` to the entire app, and ensures logout always clears local storage even if the API call fails.

  **Theme System (`mobile/constants/theme.ts`):**
  - Replaced the Expo starter's `Colors` / `Fonts` exports (with keys like `tabIconDefault`, `tabIconSelected`, `icon`, `text`, `background`) with a new design-token-based `colors` object providing `light` and `dark` sub-objects.
  - Tokens: `bgBase`, `bgSurface`, `textPrimary`, `textMuted`, `accentPrimary`, `border`, `error`, `success` — values match the palette in `ui-context.md`.
  - Exports a shared `radius` object (`sm: 8`, `md: 16`, `lg: 20`).
  - All screens use `useColorScheme()` from React Native to detect the device's system appearance and index into `colors[scheme]` at render time — no hardcoded hex values in any screen file.
  - The `createStyles(c)` factory pattern is used consistently: a function that takes the resolved color set and returns `StyleSheet.create(...)`, called inside the component body after `useColorScheme()`.

  **Theme Refactoring (legacy Expo starter components):**
  - `components/themed-text.tsx` — Updated `useThemeColor` call from old `'text'` key to `'textPrimary'`; replaced hardcoded `#0a7ea4` link color with dynamic `useThemeColor({}, 'accentPrimary')`.
  - `components/themed-view.tsx` — Updated to use `'bgBase'` token.
  - `components/parallax-scroll-view.tsx` — Updated `useThemeColor` call from old `'background'` key to `'bgBase'`.
  - `components/ui/collapsible.tsx` — Replaced old `Colors` (capital C) import with `colors` + `useColorScheme()` pattern; replaced `Colors.light.icon` / `Colors.dark.icon` with `c.textMuted`.
  - `hooks/use-theme-color.ts` — Updated to work with the new `colors` shape (`keyof typeof colors.light`).

  **Dependencies Added:**
  - `expo-secure-store` — Encrypted key-value storage for auth tokens
  - `react-hook-form` — Declarative form state management
  - `@hookform/resolvers` — Zod resolver adapter for react-hook-form
  - `zod` — Schema validation (already used in backend, now shared pattern)

  **Verification:**
  - `npx tsc --noEmit` passes with zero errors in `mobile/`
  - `npm run lint` passes in `mobile/`
  - No hardcoded hex color values remain in any `mobile/app/` screen
  - No references to the old `Colors` / `Fonts` exports remain anywhere in `mobile/`

- Feature 04: Socket Server Foundation implemented:
  - Scaffolded `socket-server/` as a strict TypeScript Node project with Express, Socket.io, CORS, dotenv, and JSON Web Token dependencies.
  - Added `socket-server/src/lib/env.ts`, which loads environment configuration at startup and fails fast when `PORT` is missing/invalid or `JWT_ACCESS_SECRET` is missing. It never supplies a fallback secret.
  - Added `socket-server/src/auth/verifySocketToken.ts` Socket.io middleware. It reads `socket.handshake.auth.token`, verifies it with the configured access-token secret using the same JWT `sub` claim format as `backend/lib/auth/tokens.ts`, validates that `sub` is a string, stores it in `socket.data.userId`, and rejects missing, malformed, expired, or invalid tokens with `Unauthorized`.
  - Added `socket-server/src/index.ts`: an Express `GET /health` endpoint returning `{ status: "ok" }`, a Socket.io server with temporary permissive CORS, authentication middleware, and connection/disconnection logs containing only socket ID and authenticated user ID.
  - Added `npm run dev` (auto-reloading with `ts-node-dev`) and `npm run build` (strict type check) scripts. `socket-server/.gitignore` continues to exclude `.env`.
  - Added `socket.io-client` to `mobile/` and a clearly marked temporary Feature 04 authenticated connection hook. Feature 06 moved it into `mobile/lib/socket/useTemporarySocketTest.ts`; Feature 09 will replace it with real messaging lifecycle management.
  - Extended `AuthContext` to expose the current in-memory access token, setting it after sign-in, sign-up, and startup refresh and clearing it on sign-out/session expiry; tokens remain persisted only through Expo SecureStore.
  - Formatted the new socket server and changed mobile files with Prettier.
  - Verification completed locally: `socket-server` strict build passed; the server started with `npm run dev`; `GET /health` returned `{ status: "ok" }`; a valid locally signed JWT connected successfully; an invalid token was rejected with `Unauthorized`; and mobile `npx tsc --noEmit` plus `npm run lint` passed.

- Feature 05: Conversation API Foundation implemented:
  - Added the nullable, unique `Conversation.directKey` schema field. Direct 1:1 conversations use a lexicographically sorted `userId:participantId` key, while future group conversations keep `directKey` as `null`.
  - Applied and recorded the `20260917154500_add_direct_conversation_key` Prisma migration against Neon. `prisma migrate dev` could not create a migration in this non-interactive environment, so Prisma generated the schema diff, applied that exact generated SQL with `prisma db execute`, and recorded it using `prisma migrate resolve --applied`.
  - Added `GET /api/users?query=<text>`: JWT-protected, Zod-validated case-insensitive display-name/email search; excludes the current user; orders by display name; limits to 20; and selects only `id`, `displayName`, and `email`.
  - Added `POST /api/conversations/direct`: JWT-protected and Zod-validated direct-conversation creation/retrieval. It rejects self-conversations, returns 404 for absent users, creates the conversation and both participant records atomically, and safely re-fetches on the `directKey` unique-constraint race.
  - Added `GET /api/conversations`: returns only conversations in which the authenticated user is a participant, ordered by `updatedAt` descending, with only the other participant's public details and no fabricated message data.
  - Added `backend/lib/conversations.ts` for direct-key construction and shared, focused response mapping; request parsing and HTTP status handling remain in route handlers.
  - Regenerated Prisma Client, formatted the new Feature 05 TypeScript files with Prettier, and verified `npm run build` passes in `backend/`.
  - Verified all endpoint cases against the live Neon database using three newly created test users: unauthenticated search is 401; search excludes the requester and exposes no password field; initial/repeated/reversed direct creation returns one shared ID; self and missing-user requests return 400/404; both participants can list the conversation; and a third user cannot.

- Feature 06: Mobile Conversation List implemented:
  - Replaced the authenticated placeholder Home screen with a focus-aware conversation list backed by `GET /api/conversations`. It includes the Envelo header, New conversation and Log out actions, first-load progress, empty state, human-readable API errors, retry behavior, and non-navigating participant rows without fabricated message metadata.
  - Added `mobile/lib/api/conversations.ts` with explicit contract types and envelope-unwrapping wrappers for conversation listing, URL-encoded user search, and idempotent direct-conversation creation. All requests continue through the existing token-refreshing `apiRequest` client.
  - Added the native-stack `New conversation` screen with an automatically focused name/email input, 300 ms debounced search, no request for blank input, loading/empty/error states, retry behavior, and request sequencing so stale responses cannot replace newer results.
  - Choosing a search result disables all result presses, calls the server-owned direct-conversation endpoint, reports creation failures without losing the query, and returns with `router.back()` on success. Home re-fetches whenever it regains focus so the conversation appears without a duplicate check in the client.
  - Added small presentational components for conversation rows, the empty list, and user search results. Every new or changed screen/component uses the existing light/dark design tokens and contains no hardcoded colors.
  - Moved the Feature 04 Socket.io verification lifecycle into `mobile/lib/socket/useTemporarySocketTest.ts`, preserving the authenticated handshake, token-safe logging, temporary marker, and disconnect cleanup.
  - Configured the authenticated stack so Home keeps its custom header while New conversation receives the native title/back button with theme-aware header colors.
  - Formatted all Feature 06 files with Prettier. `npx tsc --noEmit` and `npm run lint` both pass with no errors or warnings; repository checks also confirm no hardcoded colors, direct SecureStore access, duplicate fetch wrapper, message fields, or socket message events were introduced in the Feature 06 files.
  - Follow-up review fixes: capped search input at the API's 100-character maximum and separated search failures from conversation-creation failures, so the search retry action is never shown for a failed creation and users can retry creation by selecting the retained result again.

- Feature 07: Message History API Foundation implemented:
  - Added protected `GET /api/conversations/[conversationId]/messages`, using the existing JWT `requireAuth` helper and the `ConversationParticipant` join table for ownership checks. Missing conversations and conversations owned by another user return the same `404 Conversation not found` response.
  - Added strict path/query handling: trimmed empty conversation IDs return 400, empty cursors return 400, and unknown or cross-conversation message cursors return `400 Invalid message cursor` only after conversation participation is authorized.
  - Added `backend/lib/messages.ts` with the fixed 50-message page size, an explicit Prisma select, an inferred `MessageHistoryItem` type, and safe response mapping limited to `id`, `conversationId`, `senderId`, `content`, and `createdAt`.
  - Implemented deterministic cursor pagination ordered by `createdAt DESC, id DESC`, fetching 51 records to detect an older page, skipping the boundary cursor, and reversing each page before serialization so responses are chronological. The final page returns `nextCursor: null`.
  - Verified against the live backend and Neon with isolated temporary data: missing/invalid authentication returned 401; participants retrieved history; 52 messages paginated as 50 then 2 with no duplicate boundary; both pages were chronological; non-participants and invented conversations returned matching 404s; foreign, empty, and unknown cursors returned 400; and response objects exposed only the five allowed fields. All temporary users, conversations, and messages were deleted after the test.
  - Formatted the new backend files with Prettier and verified `npx tsc --noEmit` plus `npm run build`; the production build recognizes the new dynamic route. No schema, migration, mobile, socket-server, message-write, or existing Feature 05 endpoint changes were made.

- Feature 08: Socket Text Message Persistence and Broadcast implemented:
  - Added only the approved `socketClient` generator to the authoritative `backend/prisma/schema.prisma`; it writes a socket-specific Prisma Client to the gitignored `socket-server/src/generated/prisma/` directory. No model, field, relation, table, migration, or backend REST route changed.
  - Added pinned Prisma 6.19.3 client/CLI dependencies, Zod runtime validation, the development-only Socket.IO client, and local Prettier support. Socket scripts now generate from the backend schema before development/build, provide an optional all-client generation command, compile TypeScript, and copy the custom generated Prisma runtime into `dist/` for production startup.
  - Extended fail-fast environment validation with a non-empty `DATABASE_URL` check without logging its value. Added one socket-process Prisma client and graceful `SIGINT`/`SIGTERM` disconnection.
  - Added explicit Socket.IO client/server event generics, socket data, acknowledgement types, the five-field public text-message payload, a focused Prisma select, and a mapper that serializes `createdAt` without exposing database relations or private fields.
  - Added Zod validation for unknown `message:send` input: conversation IDs are trimmed/non-empty and message text is trimmed, non-empty, and capped at 2,000 characters. Invalid input is rejected before any database query or write.
  - Added database-backed conversation authorization using the authenticated JWT `sub` from `socket.data.userId`. Invented and unauthorized conversation IDs intentionally return the same `Conversation not found` acknowledgement.
  - Implemented one Prisma transaction that creates the text `Message` with `mediaUrl: null`, creates one `SENT` status per non-sender participant, and advances `Conversation.updatedAt`. The server emits and acknowledges only after that transaction commits, preventing ghost messages.
  - Added server-owned `user:<userId>` rooms. Each authenticated socket joins only its own room, and a committed `message:new` payload is emitted to the sender plus every recipient room so multiple active devices receive the same durable record.
  - Added concise validation, authorization, persistence, connection, and disconnection logging containing socket/user IDs only; message text, event payloads, access tokens, JWT secrets, and database URLs are never logged.
  - Added `scripts/verify-message-flow.ts`, which reads two tokens and a conversation ID from environment variables, connects two real clients, checks matching acknowledgement/broadcast payloads, verifies the durable row plus recipient `SENT` status in Neon, and disconnects sockets/Prisma in `finally`. `socket-server/README.md` documents local environment setup, client generation, startup, migration ownership, and the verification command.
  - Verified `npm run build`, production generated-client loading, and `GET /health` (`{ "status": "ok" }`). A live Neon integration run with isolated temporary users exercised blank/oversized/missing payloads, invented and unauthorized conversations, sender/recipient/outsider room isolation, trimmed content, identical one-time broadcasts, durable IDs, `mediaUrl: null`, recipient `SENT`, recency updates, disconnected-recipient persistence, and Feature 07 history retrieval. Temporary test records were deleted afterward.
  - `npx prettier --write package.json src scripts` passes. Generated Prisma output and compiled `dist/` remain ignored, and no socket migration command, mobile change, or existing backend route change was introduced.

## In Progress

- Feature 03 manual real-device verification (signup, persistent session refresh, logout, and backend error states).
- Feature 04 manual real-device verification: copy the exact `JWT_ACCESS_SECRET` used by `backend/` into `socket-server/.env`, set `EXPO_PUBLIC_SOCKET_URL` in `mobile/.env` to `http://<hotspot-ip>:4000`, then confirm the phone can reach `/health`, a logged-in user connects, and an intentionally invalid token is rejected. The implementation is complete; this device/network validation cannot be performed by the agent.
- Feature 06 manual Expo Go verification: confirm list/empty/error states, name and email searches, idempotent selection and focus refresh, native back navigation, light/dark appearance, and logout on a real device. The implementation and static checks are complete.
- Feature 08 local environment setup: add `DATABASE_URL` to `socket-server/.env` using the same value as `backend/.env`. Live verification was completed by injecting the existing backend value into the test process without printing or persisting it; the checked local socket `.env` still lacks this required key.

## Next Up

- Feature 09: Mobile Chat Screen and Live Text Messaging — replace the temporary socket hook with the real mobile socket lifecycle, load Feature 07 history, send `message:send`, consume `message:new`, and render the chat experience.

## Open Questions

- ~~UI color palette, component library, and icon set not yet
  confirmed~~ — Resolved: plain `StyleSheet` with design tokens
  from `ui-context.md`, `@expo/vector-icons` for icons
- Exact reconnection/offline-message-queue behavior for the
  Socket.io client not yet defined
- Docker: Ankur wants to containerize `backend/` and
  `socket-server/` for local dev and deployment — timing TBD,
  planned for once `socket-server/` has real code to containerize

## Architecture Decisions

- Prisma pinned to stable v6 rather than `latest`, since the
  `latest` npm dist-tag currently resolves to an 8.0.0 release
  candidate with a materially different CLI (different flags,
  different `init` behavior, adds AI-agent "skills" scaffolding
  not relevant to this project)
- Prisma schema lives at `backend/prisma/schema.prisma` — no
  shared root-level `prisma/` folder, to keep things simpler for
  a solo project
- `MessageStatus` modeled as one row per (message, recipient) pair
  rather than a single status field per message, so delivery/read
  receipts work correctly if group chat is added later

## Session Notes

- Working relationship: Claude writes feature spec `.md` files
  (architecture/design decisions); the Antigravity IDE agent
  implements code from those specs; Ankur personally handles all
  manual setup steps (accounts, env vars, CLI commands, running
  migrations) rather than the agent doing them automatically.
