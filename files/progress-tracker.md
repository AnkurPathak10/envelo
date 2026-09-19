# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Features 03, 04, 06, 09, 11, and 13 implemented - pending remaining manual real-device verification; Features 05, 07, 08, 10, and 12 complete

## Current Goal

- Implement Feature 14's optimistic/offline sending, then Feature 15's live mobile inbox

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

- Feature 09: Mobile Chat Screen and Live Text Messaging implemented:
  - Added the dynamic authenticated `conversation/[conversationId]` Expo Router route, registered it in the existing native stack, and used the display-only participant route parameter for the native header title with the standard platform back button.
  - Made conversation rows accessible press targets that navigate with the server-owned conversation ID and participant display name. No participant name or route parameter is used for authorization or message data.
  - Extended the existing conversation API module with the exact nullable `TextMessage` contract and a token-refreshing, URL-encoded Feature 07 history wrapper supporting optional cursors; no second fetch client or direct SecureStore access was introduced.
  - Replaced and deleted the temporary Feature 04 socket hook with an app-level `SocketProvider` nested inside `AuthProvider`. It creates one typed Socket.IO client for the current in-memory access token, disables automatic reconnection for the documented v1 behavior, exposes typed send/subscription methods and connection state, and disconnects on token changes, sign-out, and unmount.
  - Added timeout/disconnect-safe `message:send` acknowledgement handling. The composer retains its draft on a failure acknowledgement, timeout, or disconnect, clears only the submitted draft after success, disables Send for blank text, active sends, and disconnected sockets, and never creates optimistic or queued messages.
  - Added pure message merging that filters nullable non-text history entries, de-duplicates REST history, socket broadcasts, and acknowledgements by durable ID, then sorts chronologically with ID as a stable tie-breaker. Initial and older-page responses merge into current state so in-flight live events cannot be overwritten.
  - Added initial loading, retryable history error, safe 404/unavailable with Back, calm empty history, explicit cursor-based **Load earlier messages**, independent older-page error/loading, and disconnected/send-failure states. Loading an older page preserves the visible list position rather than jumping to the latest message.
  - Added themed incoming/outgoing message bubbles with timestamps and a multiline 2,000-character composer in a safe-area-aware `KeyboardAvoidingView`. All new screen/component colors come from the existing light/dark tokens; no delivery/read UI, media behavior, retry queue, or extra dependency was added.
  - Reviewed the Expo SDK 54 reference before implementation. `npx tsc --noEmit`, `npm run lint`, and the required final `npx prettier --write .` all pass in `mobile/`; TypeScript and lint also pass after formatting. A production web export bundles successfully and recognizes the new dynamic conversation route. Repository checks find no remaining temporary socket-hook import, no direct SecureStore use outside auth storage, and no hardcoded color values in the new Feature 09 files.
  - No backend, socket-server, Prisma schema, or migration code was changed for Feature 09. Real-device navigation, keyboard/theme, persistence, disconnect, pagination, and true two-participant live-send tests remain pending because the required local environment values are not yet complete.

- Feature 09 local testing follow-ups:
  - Added a root Expo Router redirect so `/` resolves to login or home instead of an unmatched route.
  - Added the Expo-documented web storage fallback for development browser testing while Android/iOS continue using encrypted SecureStore.
  - Added origin-restricted backend API CORS handling for the local Expo web origin.
  - Configured the socket server with the backend database URL without exposing it; Prisma generation, socket startup on port 4000, and `/health` were verified.
  - Two signed-in accounts have exchanged a live message successfully. The remaining full Feature 09 edge-case checklist is still pending.

- Feature 10: Conversation Inbox Metadata API implemented:
  - Preserved the stable `directConversationSelect` used by Feature 05 creation/reuse and added a separate `conversationListSelect(currentUserId)` factory for the authenticated inbox query.
  - The list selection fetches the newest message with deterministic `createdAt DESC, id DESC` ordering and `take: 1`, selecting only `id`, `senderId`, nullable `content`, and `createdAt`.
  - Added a Prisma-filtered relation count for messages whose status row belongs to the authenticated user and is not `READ`. Because senders have no recipient status row, their own messages do not increase their count; both `SENT` and `DELIVERED` count without exposing status rows.
  - `GET /api/conversations` continues authorizing through `requireAuth` and `ConversationParticipant`, now uses the user-aware selection in the same bounded Prisma query, and orders by `updatedAt DESC` with conversation ID as a deterministic secondary key. No N+1 follow-up query was introduced.
  - Added a safe mapper contract with ISO-string conversation/message dates, `lastMessage: null` for empty conversations, exact uncapped `unreadCount`, and only the specified participant and preview fields. Whole Prisma models, media URLs, relations, and status data remain private.
  - Verified against the live production API and Neon with isolated temporary users and conversations: missing/invalid auth returned 401; empty metadata was null/zero; five sender messages produced recipient/sender counts of 5/0; `DELIVERED` remained unread; `READ` reduced the count; the latest timestamp/ID tie-break selected the correct four-field preview; updated activity moved the conversation first; a third user could not see it; and dates/response keys matched the minimized contract.
  - Re-verified Feature 05 direct-conversation reuse and Feature 07 message history through their real endpoints. Temporary records were cascade-deleted after the run.
  - `npx tsc --noEmit`, a clean `npm run build`, backend Prettier, and `git diff --check` pass. No mobile, socket-server, Prisma schema, migration, generated-client, auth/token, message-write, or history implementation changed.

- Feature 11: Socket Reconnection & Connection Resilience implemented:
  - Re-enabled the app-level Socket.IO client's retry behavior with explicit bounded backoff: ten attempts, starting at one second and capping each delay at ten seconds. It now reports `reconnecting` separately from the terminal `disconnected` state once retries are exhausted.
  - Added a React Native `AppState` foreground listener. When the app returns to `active` with no live socket, it refreshes the existing authenticated session through `AuthContext` before reconnecting; refresh failures do not expose or log tokens and leave the composer unavailable rather than attempting a stale-token connection.
  - Review follow-up: serialized refresh, sign-in, and sign-out storage mutations while retaining an auth revision for state application. Sign-out clears the UI immediately, then runs after any already-started refresh; a stale refresh cannot erase credentials from a newer sign-in or restore a signed-out session.
  - Made the socket client explicitly connect after listener setup, preserves the existing sign-out/unmount cleanup, and added a connection epoch so mounted chat screens can distinguish an initial connection from a later reconnection.
  - An open conversation now re-fetches the newest Feature 07 history page after each later successful connection and merges it with the existing durable-ID de-duplication helper. This preserves messages already on screen while recovering messages persisted during an outage.
  - Updated the existing composer state notice to show the understated `Reconnecting…` label; Send remains disabled for every state other than `connected`. No offline queue or optimistic sends were added.
  - Confirmed the socket server already runs `verifySocketToken` for every new connection and joins the authenticated user room, so reconnections need no backend, socket-server, Prisma, or migration changes.
  - Reviewed the Expo SDK 54 reference before implementation. `npx tsc --noEmit`, `npm run lint`, and final `npx prettier --write .` pass in `mobile/`. The six required two-device/device-network scenarios remain pending because they require real devices and a prolonged background/token-expiry interval.
  - Review follow-up: a chat screen mounted before its first socket connection now reloads history when that initial connection completes, closing the small missed-message window between the REST history request and subscription readiness. The Feature 11 file map now names the actual `SocketContext` and chat component locations.
  - Re-ran `npx tsc --noEmit` and `npm run lint` in `mobile/` after the review follow-ups; both pass.
  - Real-device Test 5 follow-up: installed the Expo SDK 54-compatible `@react-native-community/netinfo` package and subscribed in `SocketProvider` to disconnected-to-connected network transitions. Connectivity recovery now starts a fresh explicit socket connection after the bounded retry sequence has been exhausted, including when the app remains foregrounded.
  - Added an accessible `Disconnected. Tap to retry.` composer affordance that explicitly starts a fresh connection attempt while the terminal disconnected state is visible. The reconnecting label and send-disable behavior remain unchanged during that attempt.
  - After the network-recovery follow-up, final mobile Prettier, `npx tsc --noEmit`, `npm run lint`, and repository `git diff --check` all pass. The physical Test 5 re-run remains explicitly pending below.

- Feature 12: Socket Delivery and Read State Foundation implemented:
  - Added authenticated, Zod-validated `message:delivered` and `message:read` events with explicit success/error acknowledgements. Delivery batches accept 1–100 non-empty message IDs; read requests require a conversation ID and boundary message ID.
  - Added shared `messageStatus.ts` transaction helpers. Delivery validates participation, silently skips a sender's own messages, and changes only `SENT → DELIVERED`; read validates conversation participation and the boundary message, then changes only the authenticated recipient's `SENT`/`DELIVERED` rows at or before the boundary timestamp to `READ`.
  - Both updates use `updateManyAndReturn` inside one Prisma transaction, so acknowledgements and broadcasts include exactly the rows that changed. Existing `READ` rows can never be downgraded by a later delivery call.
  - Added individual `message:status` broadcasts (`{ messageId, status }`) to each changed message's original sender room after commit. The recipient who initiated the transition is not echoed unless they independently share the sender room on another applicable message.
  - Extended Feature 07 history and Feature 10 `lastMessage` selections with the other participant's status row, returning `SENT`, `DELIVERED`, `READ`, or unexpected-case `null`. History dates are now explicitly mapped to ISO strings; the existing unread-count query is unchanged.
  - Added `verify:message-status`, a repeatable isolated Neon integration harness. It verified offline-recipient `SENT`, manual `DELIVERED`, timestamp-bounded `READ`, sender self-delivery no-op, outsider rejection for both events, foreign-conversation boundary rejection, no downgrade from `READ`, live sender broadcasts, and both REST status fields. All temporary users, conversations, messages, and statuses were deleted afterward.
  - Backend `npx tsc --noEmit` and production `npm run build` pass. Socket-server generation/build passed after the source implementation; final source compilation and a separate strict type-check of the verification harness also pass after formatting. Required Prettier passes completed in both projects, and repository `git diff --check` passes.
  - No mobile source, Prisma schema, or migration changed. Feature 13 will wire the mobile emissions, reconnect catch-up delivery, live status consumption, and Telegram-style clock/single-tick/double-tick UI.
  - Review follow-up: delivery batches now reject any missing message ID instead of treating an all-missing or partially missing batch as a successful no-op. Read updates now use the same composite chronological boundary as history (`createdAt` first, then `id`), preventing equal-timestamp messages after the selected boundary from being marked read. The live Neon harness now covers both regressions and passes; temporary records were cleaned afterward.

- Feature 13: Mobile Message Status Ticks implemented:
  - Extended the mobile message contract with nullable `SENT`, `DELIVERED`, and `READ` status data. Socket-created messages are normalized to `SENT` for the sender and `null` for the recipient until durable REST data or a live status update supplies the authoritative state.
  - Added provider-level `message:delivered`, `message:read`, and `message:status` contracts. Incoming live messages are acknowledged even when their chat screen is closed, while a 300 ms set-backed batch combines bursts and caps every delivery event at the server's 100-ID limit. Pending batches survive temporary disconnection and flush after reconnection; no persistent “already acknowledged” tracking was introduced.
  - Every chat history path now queues incoming messages for delivery acknowledgement: initial load, Feature 11 reconnect catch-up, and Load earlier pagination. Inbox loading also acknowledges incoming latest-message previews, covering the required fully-closed-app case where Socket.IO cannot replay an event that occurred before the new connection.
  - Focused chat screens emit `message:read` through the latest loaded incoming-message boundary on initial focus, reconnect, and each newly received incoming message. Read emission first flushes the current delivery batch so the server sees delivery before read on the same ordered socket transport. Native reads additionally require `AppState === active`, and web reads require a visible browser tab; returning to a visible focused chat acknowledges the newest pending incoming boundary.
  - Chat screens subscribe to `message:status` and update the matching local message without a REST re-fetch. Both live updates and later history merges preserve monotonic status order, so stale data cannot visually downgrade `READ` to `DELIVERED` or `SENT`.
  - Outgoing bubbles render a single `@expo/vector-icons` check beside the timestamp for both `SENT` and `DELIVERED`, and a double check for `READ`; the clock is reserved for Feature 14's future local pending state. Incoming bubbles render no status icon. Real-device follow-up increased the icon to 14 px and uses the bubble's text color at reduced opacity for legible contrast in both themes.
  - Review follow-up: failed delivery acknowledgements now restore their message IDs and retry up to three times with 500 ms, 1 s, and 2 s exponential delays. The retry budget resets after success, a fresh socket connection, or a later explicit delivery/read opportunity, so transient server failures recover without creating an unbounded retry loop.
  - Reviewed the Expo SDK 54 reference before implementation. Final `npx prettier --write .`, `npx tsc --noEmit`, `npm run lint`, and repository `git diff --check` pass. No backend, socket-server, Prisma schema, migration, dependency, auth/token, or offline-queue changes were made.

## In Progress

- Feature 03 manual real-device verification (signup, persistent session refresh, logout, and backend error states).
- Feature 04 manual real-device verification: copy the exact `JWT_ACCESS_SECRET` used by `backend/` into `socket-server/.env`, set `EXPO_PUBLIC_SOCKET_URL` in `mobile/.env` to `http://<hotspot-ip>:4000`, then confirm the phone can reach `/health`, a logged-in user connects, and an intentionally invalid token is rejected. The implementation is complete; this device/network validation cannot be performed by the agent.
- Feature 06 manual Expo Go verification: confirm list/empty/error states, name and email searches, idempotent selection and focus refresh, native back navigation, light/dark appearance, and logout on a real device. The implementation and static checks are complete.
- Feature 09 remaining two-device verification: complete sender de-duplication, reload/offline-recipient persistence, validation, disconnected draft retention, pagination over 50 messages, keyboard/light/dark layout, sign-out socket cleanup, and account isolation.
- Feature 09 review follow-up: removed the web `localStorage` token fallback after security review. Android/iOS continue using Expo SecureStore; web tokens now exist only in module memory for the active page lifecycle and are cleared on reload. Persistent web login remains intentionally deferred until the backend owns an HttpOnly refresh-cookie flow. Feature 11 now supplies the bounded Socket.IO reconnection policy; offline message queueing remains intentionally deferred.
- Feature 11 manual two-device verification: re-run Test 5 by exhausting all ten retries in airplane mode and then restoring connectivity while the app stays foregrounded; confirm both automatic NetInfo recovery and the manual disconnected-state retry. The other pending scenarios cover foreground recovery, expired-token refresh, missed-message history re-sync, and sign-out during reconnecting.
- Feature 13 manual two-device verification: re-validate `SENT`/`DELIVERED` as a legible single tick, focused-chat `READ` as a double tick, inbox delivery, background/reconnect catch-up, absence of ticks on incoming bubbles, and light/dark contrast. Confirm native background state and hidden browser tabs defer read acknowledgement until visibility returns. The implementation and static checks are complete; this follow-up real-device/browser verification remains pending.

## Next Up

- Feature 14: Optimistic Sending & Offline Queue.
- Feature 15: Mobile Live Inbox and UX polish (live row movement, preview/timestamp, unread badge, and improved New conversation/header controls).

## Open Questions

- ~~UI color palette, component library, and icon set not yet
  confirmed~~ — Resolved: plain `StyleSheet` with design tokens
  from `ui-context.md`, `@expo/vector-icons` for icons
- ~~Exact Socket.IO reconnection behavior~~ — Resolved in Feature 11 with
  bounded retry backoff, foreground recovery, and history re-sync; offline
  message queueing remains deferred
- Conversation-list UX review: the current text-only New conversation action
  looks visually distorted/unfinished and must become a polished icon/button
  during Feature 15's mobile inbox work.
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
