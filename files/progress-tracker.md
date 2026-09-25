# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Features 03, 04, 06, 09, 11, 13, 14, 15, 16, and 17 implemented - pending remaining manual real-device verification; Features 05, 07, 08, 10, and 12 complete

## Current Goal

- Add a GIPHY development key to `mobile/.env`, then complete real-device validation of the new chat header, message search, clear/delete confirmations, full emoji catalog, and animated GIF send/offline flow.
- Verify the app-wide warm-gray/rose dark theme on a real device across authentication, conversations, chat, and profile-photo update flows.
- Verify Feature 18's light-theme chat and inbox colour placement on a real device; see the UI Upgrades section below.
- Complete Feature 17's ten-case two-device verification checklist, including ImageKit dashboard compression/file-type checks and the offline text-message regression test

## UI Upgrades

- Chat header, search, and expression upgrade — implemented; GIPHY key and real-device acceptance pending.
  - Replaced the title-only native chat header with an opaque custom row containing Back, the other participant's profile photo, name, and a three-dot menu. Inbox and newly created conversation navigation now pass the participant ID/avatar as display-only route state.
  - Added authenticated, case-insensitive message search with a rounded header search field, 250 ms client debounce, 100-character query cap, chronological results, and a 100-result server limit. Search mode hides the composer and restores the existing conversation when closed.
  - Corrected Clear chat and Delete chat to be account-wide but participant-specific. `ConversationParticipant.clearedAt` and `deletedAt` now persist the caller's history cutoff/inbox visibility in PostgreSQL, so the same account sees the action on mobile and localhost while the other participant's history remains unchanged. History, search, pagination, inbox preview, and unread counts are filtered server-side; no shared message or conversation row is deleted.
  - Restoring a deleted direct conversation now clears only the caller's deletion marker and preserves the history cutoff, allowing New conversation to open normally instead of routing to an empty state. A user-room socket event updates the same account's other active sessions and invalidates their cache/offline queue; REST refresh provides reconnect/reload consistency.
  - Strengthened cross-device persistence after a fresh three-client test showed the phone UI clearing without advancing the database cutoff. Clear/Delete now use acknowledged authenticated Socket.IO mutations on the same server path already proven by live message delivery. The socket server writes the caller's participant marker, broadcasts the authoritative timestamp to every session for that account, and acknowledges only after persistence; REST remains the disconnected fallback. The initiating UI changes only after one of those authoritative writes succeeds.
  - Live account-isolation verification passed against the running services and PostgreSQL-backed APIs. Clearing Ravi produced one server timestamp and both `localhost` and the LAN API returned zero post-cutoff messages plus a null inbox preview for Ankur, while Ravi still received all six shared messages. Deleting Test removed it from Ankur's inbox with zero visible history while the other participant still received all five messages. A two-socket same-account test also confirmed exactly one visibility event reached the second session while the initiating session used its acknowledgement without a duplicate event.
  - The participant-visibility migration was applied successfully. Mobile, backend, and socket-server TypeScript checks pass; the socket production build reached Prisma generation but could not replace the Windows query-engine DLL while the running socket process held it open. Restart both development servers before the final three-client acceptance test (account A on mobile + localhost, account B separately).
  - Cross-device diagnosis verified that there is only one Ravi conversation and that localhost, LAN API, and the socket server use the same PostgreSQL data. Inbox reconciliation reruns on socket reconnect, browser focus/tab visibility, and native foreground so a missed live invalidation is repaired from REST.
  - Web auth/session correction: replaced page-lifecycle-only web refresh state with a backend-owned, rotating `HttpOnly` refresh cookie. Web fetches now include credentials and an explicit platform header; auth responses omit the raw refresh token, while native Expo Go continues using SecureStore/body tokens. Local Expo web rewrites the configured LAN API host to the browser's localhost/127.0.0.1 hostname so the cookie remains same-site over development HTTP. Credentialed origin-restricted CORS now permits the platform header and `DELETE`, fixing localhost Clear/Delete preflights. Refresh follow-up now coalesces concurrent client refreshes, atomically allows only one server-side token rotation, and prevents a stale rejected refresh response from clearing a newer cookie. A live signup → cookie refresh test passed with rotation, no JSON refresh-token exposure, and successful temporary-account cleanup; mobile/backend TypeScript, Expo lint, and the static web export also pass.
  - Replaced the 24 hardcoded emoji with the maintained Unicode 15 catalog from `@emoji-mart/data`, including all categories, keyword/name search, virtualized rendering, and accessible draft insertion. Stickers remain deferred.
  - Integrated GIPHY Trending/Search with PG filtering, visible attribution, an environment-supplied client key, animated `expo-image` rendering, a provider badge, durable remote-media queueing, and an exact HTTPS GIPHY CDN allowlist on the socket server. No provider key is committed; `mobile/.env.example` documents `EXPO_PUBLIC_GIPHY_API_KEY`.
  - Automated verification passed: mobile/backend/socket TypeScript, Expo lint, backend production build, socket production build, Expo public-config resolution, static web export, and Android production bundle export. Real-device interaction checks remain pending.

- Chat bubble timestamp/receipt alignment — implemented; real-device visual acceptance pending.
  - Plain-text and caption content now reserves explicit right-side width while the single visible timestamp/receipt row stays anchored to the bubble's lower-right corner. Short messages remain compact and wrapped messages can no longer collide with the metadata, pull it leftward, or lift the receipt above the baseline.
  - Superseded the visible/inherited-color metadata-copy experiment after Android rendered its supposedly hidden timestamp and ticks. The current renderer contains only one real metadata unit and reserves its lower-right footprint with deterministic right padding, including a readable gap after the final word.
  - Outgoing sent/delivered/read receipts now use the same high-contrast warm orange (`#C45A27`) in light and dark themes; timestamps retain their quieter text treatment.
  - Static verification passed: mobile TypeScript, Expo lint, and repository whitespace checks.

- App-wide warm-gray dark theme — implemented; real-device visual acceptance pending.
  - Replaced the near-black/navy dark foundation with warm charcoal gray (`#242326` base, `#343236` surface, `#4A464A` border) and replaced the remaining shared blue accent with the exact Rosy Taupe (`#D39A86`). React Navigation and the runtime system root now receive the same palette, and the dark splash no longer flashes black.
  - Dark chat now matches light chat's brand roles: Soft Blush (`#FEE3E2`) outgoing bubbles with dark text/timestamps/ticks, Rosy Taupe send and attachment actions, Cotton Rose unread/selected states, and gray incoming/composer surfaces.
  - Login and signup keep their existing split hero, animation, fields, and authentication behavior but now use gray panels/inputs and rose links in dark mode. Conversations, new-conversation, profile-photo update, headers, loading/retry states, and fallback avatars inherit the same gray/rose system; user photos and semantic error/success colors remain unchanged.
  - Verification passed: mobile TypeScript, Expo lint, Expo public-config resolution, static web export, Android bundle export, and repository whitespace checks.

- Feature 19: Floating Rich Message Composer — Milestone 1 implemented; typed rich-message milestones remain in progress.
  - Replaced the full-width bordered footer with a floating, fully rounded translucent composer and removed its top separator. Chat list padding now allows messages to scroll behind the composer while keeping the newest item reachable.
  - Added an expression panel with working Unicode emoji insertion and reserved GIF/Sticker tabs. Added a paperclip menu containing Gallery, File, Location, and Contact destinations.
  - The trailing action now displays a microphone for an empty composer and automatically becomes a Send icon when text or a prepared photo exists. Existing text/photo queueing, compression, optional captions, and removable preview behavior are preserved.
  - Added Expo SDK 54 `expo-blur` for the glass surface. Voice, arbitrary file, structured location/contact cards, GIF, and sticker sending remain intentionally disabled until Feature 19's documented typed socket/database/offline-queue/renderer milestone is implemented.
  - Android real-device follow-up, revision two (subsequently superseded): tried keyboard avoidance around the complete chat viewport while measuring the overlaid composer. The third pass below replaced this after the tested device still left the absolute composer behind the keyboard.
  - Extended the theme-aware transparent-to-background gradient through the bottom safe-area region so there is no unblurred gap below the capsule.
  - Rebuilt the paperclip panel as a recent-photo sheet using Expo Media Library: Camera is the first tile, recent photos follow newest-first, More opens the system picker, and Gallery/File/Location/Contact sit in a bottom category bar. Camera and selected gallery photos reuse Feature 17's immediate compression/removable preview path. Duplicate asset IDs are removed before rendering, and Media Library rejections are caught.
  - Added an Expo Go-safe Android fallback: current Expo Go cannot grant the full media-library access required by the embedded grid, so the sheet explains the limitation and keeps Camera plus the system gallery picker working instead of producing an unhandled LogBox error. A development build enables the full embedded grid with the registered permission text.
  - Installed SDK 54-compatible `expo-location` and `expo-contacts`. Location requests foreground access only on tap and prepares a visible coordinates/maps-link text draft; Contact requests Android contact access on tap, opens the native single-contact picker, and prepares a visible snapshot draft. The user must still tap Send, no background location or address-book upload is used, and structured rich cards remain Milestone 2.
  - Follow-up verification passes: mobile TypeScript, Expo lint, Expo public-config resolution, SDK dependency compatibility, static web export, and repository whitespace checks. Android keyboard motion, permission prompts, and system picker behavior still require the next real-device pass.
  - Expo terminal follow-up: fixed a duplicate sibling-key bug in `ChatScreen`. The message list and composer wrapper had both used the bare conversation ID as their React key; they now use distinct namespaced keys so React cannot omit or incorrectly reuse either layout subtree.
  - Latest-message clearance follow-up: replaced the list's bottom padding with a measured footer spacer and added a post-measurement anchor pass. The footer is genuine scrollable content, so Android `scrollToEnd()` now opens with the newest bubble fully above the floating composer instead of placing it underneath the glass controls.
  - Smooth-open follow-up: the initial list and composer now measure and complete their non-animated newest-message positioning behind a neutral loading surface. The chat is revealed only after that anchor pass finishes, eliminating the visible middle-of-history-to-bottom swipe during conversation opening.
  - Keyboard-open regression repair: the full-viewport avoiding view did not move the absolute composer on the tested Android device, so the composer again uses Keyboard Controller's dedicated `KeyboardStickyView`. Controller show/hide events now add the live keyboard height to the measured footer spacer; the resulting bottom anchor clears the keyboard and composer together, keeping the newest bubble fully above the input.
  - Location/contact link-card follow-up: installed the Expo SDK 54-compatible `react-native-maps` package and upgraded the exact Envelo compatibility payloads at render time. Locations now show a pinned native map preview (with a web fallback) and the whole card opens the coordinate in Google Maps; shared phone numbers now render as accessible underlined links that open the device dialer. Earlier `maps.google.com/?q=` messages are supported, ordinary text is never auto-converted, and the stored/socket payload remains readable text until Milestone 2 adds typed metadata.
  - Link-card verification passed: mobile TypeScript, Expo lint, Expo public config, SDK dependency compatibility, static web export, Android bundle export, and repository whitespace checks.
  - Conversation reveal and bubble-metadata correction: disabled the conversation route's native push animation so the inbox no longer ghosts through while a chat opens. Plain-text and image-caption bubbles keep one time/status row anchored at the lower-right and reserve its footprint in content layout; media-only and rich cards retain their separate block metadata row.
  - Conversation reveal/metadata verification passed: mobile TypeScript, Expo lint, Android bundle export, and repository whitespace checks.
  - Reply-message and adaptive-composer upgrade: short drafts retain the floating capsule, while multiline drafts and reply previews use a rounded rectangle so the emoji, attachment, and microphone/Send controls remain usable. Swiping a confirmed incoming or outgoing bubble left opens a cancellable reply preview; sent replies persist a validated same-conversation `replyToId` relationship and display a quoted sender/content or media glimpse in history, live messages, cache, and offline optimistic state across the account's devices.
  - Reply-gesture visual correction: idle reply icons are now completely hidden outside the right edge. Their translation and opacity follow left-swipe distance until they stop fully visible, then animate back out on release. Bubble metadata has only one rendered timestamp/receipt and uses explicit right-side layout reserve to protect its lower-right footprint and keep a readable text-to-time gap. The gesture responder now covers the entire full-width message row with a shorter activation threshold, so even compact messages can be replied to by swiping from the empty part of their row. Bubble sizing remains on the animated element, and all outgoing messages share the same right edge.

- Authentication UI refresh:
  - Rebuilt login and signup as one split design with a deep brand upper section, animated illustration, and rounded theme-aware form panel with Envelo branding.
  - Kept the existing email/password and display-name fields, validation, links, submission states, and authentication calls. No social-login or reference-only controls were added.
  - Primary buttons use the exact requested `#D39A86`. Both screens scroll with the keyboard; a later dark-theme expansion made their panels, inputs, text, and links follow the effective Light/Dark/System preference without changing the layout or backend behavior.
  - Browser visual checks passed for both routes; mobile TypeScript and lint checks are recorded after implementation.

- Feature 18: Light Theme Colors for Chat and Conversations — implementation finished; real-device visual acceptance pending.
  - Added scoped light-mode messaging tokens using the exact supplied palette: Rosy Taupe actions (`#D39A86`), Cotton Rose badges/borders/selected theme toggle (`#E3C4C9`), Soft Blush outgoing bubbles (`#FEE3E2`), Platinum incoming bubbles/input (`#F1F0F1`), and White chat/inbox/header/composer backgrounds (`#FEFFFE`).
  - Applied these roles to text, pending, and captioned media bubbles, composer controls, conversation rows, empty/error/loading/offline states, and the conversation header. Filled light controls and badges use dark foregrounds; timestamps and status ticks remain legible.
  - Inbox initials avatars now choose deterministically from the warm palette. Photos are unchanged; the shared avatar's default appearance remains in profile and new-conversation screens.
  - A later app-wide expansion superseded the original dark-palette preservation constraint; Light/Dark/System selection, screen layout, media preview/offline queue, messaging, and keyboard behavior remain preserved while all screens now share the warm gray/rose dark system.
  - Validation: mobile TypeScript and Expo lint pass; changed code was formatted with Prettier and the repository whitespace check passes. No running authenticated preview was available for visual inspection.
  - Verify light-mode colour placement on a real device against the supplied references, then switch between Dark and System before marking this UI upgrade complete.

## Completed

- Repo restructured into `mobile/`, `backend/`, `socket-server/`
  (see `01-project-setup.md`)
- Added a production multi-stage Docker image for Render at `socket-server/Dockerfile`. It installs reproducibly with `npm ci`, generates the socket Prisma client from the authoritative backend schema, compiles to the confirmed `dist/index.js` entry point, prunes dev dependencies, and runs as the non-root Node user with only production `node_modules` and `dist/` in the final image. The repository-root `.dockerignore` excludes dependencies, secrets, stale build/generated output, and socket verification harnesses from the build context.
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

- Feature 14: Optimistic Sending & Offline Queue implemented:
  - Added nullable `Message.clientMessageId` through migration `20260919195658_add_client_message_id`; no backfill or unrelated model change was needed. The initial migration was deployed to Neon, with the later per-sender uniqueness follow-up recorded below.
  - Extended `message:send` with an optional trimmed 1–100 character client ID and includes its nullable value in acknowledgements and `message:new`. The socket server checks `(senderId, clientMessageId)` before creation and returns an existing message without rebroadcasting on retry.
  - Preserved the existing authorized message/status/conversation transaction for first-time sends while storing the client ID. Concurrent duplicate requests recover from Prisma `P2002` by re-fetching the winning row, preventing duplicate durable messages and recipient broadcasts.
  - Added the Expo SDK 54-compatible AsyncStorage dependency and a serialized, versioned, single-array queue store. Each entry records `clientMessageId`, conversation, sender, content, and local timestamp; reads are user-scoped so one account never renders or flushes another account's pending content.
  - Sending now creates a locally ordered optimistic message immediately, persists it before network transmission, clears the draft after durable storage succeeds, and remains enabled while disconnected. `PENDING` renders the restored clock icon; server-confirmed `SENT`/`DELIVERED` remain a single check and `READ` remains a double check.
  - SocketProvider loads the durable queue on authentication and flushes on initial connection, reconnection, queue load, or a new online enqueue. Messages send sequentially within each conversation, while conversation groups flush independently in parallel; a failure stops only that conversation until a later flush opportunity.
  - Successful broadcasts or acknowledgements remove the durable entry and reconcile the optimistic row to the authoritative server ID/timestamp using `clientMessageId`. Live broadcasts plus ack-driven reconciliation cover both normal sends and the lost-ack/idempotent-retry path without duplicate UI rows.
  - Added a cached non-secret authenticated-user profile alongside existing secure native tokens so a cold offline native restart can enter the authenticated UI and display its durable queue. Network recovery now refreshes the session before reconnecting, allowing an expired cached access token to recover and flush automatically.
  - Pending messages can render while REST history is unavailable, retain deterministic local order with monotonic timestamps, survive explicit sign-out without leaking into another account, and resume when their owning account signs in again. No REST endpoint or REST response contract changed.
  - Added `verify:offline-queue`, which passed live against Socket.IO and Neon for client-ID echoing, ordinary retry idempotency, concurrent unique-race recovery, no duplicate recipient rebroadcast, and maximum-length validation. Its isolated users, conversation, messages, and statuses were cascade-cleaned after the run.
  - Reviewed the Expo SDK 54 and AsyncStorage references. Mobile Prettier, `npx tsc --noEmit`, and Expo lint pass; socket-server Prettier, generation/build, strict harness type-check, and live verification pass; backend production build passes; repository `git diff --check` passes.
  - CodeRabbit follow-up: replaced the global `clientMessageId` unique index with the semantic `(senderId, clientMessageId)` constraint through forward migration `20260919213000_scope_client_message_id_to_sender`. The server now uses the generated compound-unique lookup, allowing two accounts to coincidentally use the same client ID while preserving per-sender retry idempotency. The migration was deployed to Neon, status reports all four migrations current, and the expanded live harness verified the cross-sender case alongside the original race/retry cases with full temporary-data cleanup.
  - CodeRabbit follow-up: pending rows are now synchronized even when the durable queue becomes empty, so an AsyncStorage write failure removes the optimistic clock row instead of leaving a message that can never send. Pending rendering is additionally restricted to the active user's entries.
  - CodeRabbit clock-skew follow-up: pending rows are no longer filtered by the server-owned clear-history cutoff. Their timestamps come from the device clock, while Clear/Delete already remove the relevant durable queue entries directly; this keeps newly queued offline messages visible even when the device clock is behind the server.
  - CodeRabbit follow-up: replaced the two independent secure token keys with one versioned SecureStore session record containing both tokens and their owning user ID. Startup restores offline auth only when that owner matches the cached profile; authentication writes wait for both storage operations and clear both sides after any partial failure. The legacy unbound token keys are removed during cleanup, so an existing development install may require one fresh sign-in after this storage-format upgrade.
  - CodeRabbit follow-up: queue flushing captures the exact authenticated user and socket that started the pass. It revalidates both after storage reads and before every send, and emits through that captured socket, preventing an old account's delayed queue from crossing into a newly signed-in account's connection.

- Feature 15: Offline Viewing — Conversation List & History Caching implemented:
  - Added a versioned AsyncStorage conversation-list cache and per-conversation history entries using the same durable storage dependency as Feature 14. Every key is scoped by authenticated user ID, and malformed or cross-user payloads are rejected instead of rendered.
  - Added a serialized history-cache index with least-recently-used eviction. It retains at most 20 conversation histories and the newest 100 durable text messages per conversation, while preserving a valid oldest-message cursor when earlier uncached history remains available.
  - Conversation-list focus now starts cache and live loading together, renders a saved list immediately when available, refreshes it from `GET /api/conversations`, and writes every successful response back to storage. A successful authoritative list also removes cached histories for conversations the user can no longer access.
  - Chat history now follows the same cache-first pattern, merges cached and fresh pages through the existing durable-ID/client-ID de-duplication and monotonic-status helper, updates the cache after initial and earlier-page fetches, and retains pending Feature 14 messages during offline starts.
  - Exported explicit connectivity-error classification from the shared API client (`ApiError.status === 0`). Only those failures use cached content with understated offline notices; 401/404/500-class responses retain the existing blocking error/retry behavior, and a 404 removes that conversation's cached history.
  - Previously opened chats remain freely navigable offline, including after a cold app restart through Feature 14's cached authenticated-user lifecycle. An uncached conversation still shows the expected connection error, and offline attempts to fetch uncached earlier history show a scoped non-blocking explanation.
  - Reviewed the Expo SDK 54 reference before implementation. The existing installed Prettier formatted the mobile changes, and mobile `npx tsc --noEmit` plus `npm run lint` pass. No backend, socket-server, Prisma schema, migration, API contract, or dependency change was made for Feature 15.
  - CodeRabbit follow-up: authorization retention now enumerates the user's actual AsyncStorage history keys rather than trusting only the LRU index. Unauthorized, malformed, and over-limit orphan entries are deleted, while authorized orphan entries are restored to the index as least-recently-used, closing the interrupted-write gap without weakening the 20-conversation bound.
  - Follow-up validation passes: mobile full Prettier, `npx tsc --noEmit`, and Expo lint; socket-server source type-check/production emit, Prettier, strict harness type-check, and live offline-queue verification; backend production build; Prisma migration status; and repository `git diff --check`. No REST endpoint changed.

- Feature 16: Mobile Live Inbox, UX Polish, and Theme Toggle implemented:
  - Added a persisted app-level theme provider with `light`, `dark`, and `system` preferences. AsyncStorage writes are serialized, the system option follows device appearance live, and the effective scheme now drives React Navigation, the status bar, auth screens, the inbox, chat, New conversation, and legacy themed components through one shared hook.
  - Replaced every screen/component import of React Native's raw `useColorScheme` with the shared app-theme hook; only `ThemeContext` reads the native system value. The existing compatibility hooks now delegate to the same context so the manual override cannot silently stop at a nested screen.
  - Added the specified `xs` through `xl` spacing scale and used it throughout the redesigned inbox controls and rows. Added an `onAccent` color token so icon, badge, avatar, and selected-toggle text remain legible without component-level white color literals.
  - Rebuilt each conversation row with a deterministic 48×48 initials avatar, bold participant name, single-line last-message preview, shared relative timestamp formatter, capped `99+` unread badge, and the same shared pending/sent/read icon renderer used by chat bubbles. Empty conversations display `No messages yet`.
  - Replaced the unfinished text-only New conversation action with an accessible filled compose icon, retained an accessible logout icon, and added an accessible three-way theme segmented control in the inbox header without changing either action's navigation/auth behavior.
  - Subscribed the mounted inbox to the existing `message:new` and `message:status` streams. Known conversations update their preview and timestamp immediately, move to the top, increment unread only for incoming messages while the inbox is actually visible, and update outgoing last-message ticks monotonically without refetching.
  - Live list changes are written back to the Feature 15 conversation cache. Cache writes are now serialized so rapid socket events cannot finish out of order, duplicate message IDs cannot double-increment unread counts, and a REST response racing a newer socket event preserves the newer row while keeping the REST list as the baseline.
  - Opening a conversation clears its badge optimistically in memory and cache; the existing chat read acknowledgement plus the inbox focus refresh remain authoritative. Unknown live conversation IDs trigger a focused REST refresh because the socket payload intentionally does not duplicate participant profile data.
  - Reviewed the Expo SDK 54 reference before implementation. Final full-mobile Prettier, `npx tsc --noEmit`, Expo lint with zero warnings, and repository `git diff --check` pass. No socket-server, Prisma schema, migration, mobile API contract, or dependency changed; the separately documented legacy-data inbox filter is the sole backend resilience exception.
  - CodeRabbit follow-up: inbox socket handling now rejects a delayed/replayed message when the displayed last message is newer under the same `createdAt`, `id` ordering used by the server. This prevents stale events from moving a conversation to the top or incrementing its unread count.
  - CodeRabbit follow-up: relative-day calculation now compares calendar dates instead of assuming every local day lasts 24 hours, so a message from yesterday remains labelled `Yesterday` across daylight-saving transitions.
  - CodeRabbit follow-up: web theme resolution remains light for the server render and first client render, then follows the actual system scheme after hydration. This restores static-render/hydration consistency while preserving live Light/Dark/System behavior.

- Feature 17: Media Sharing & Profile Photos (ImageKit) implemented:
  - Added the protected `GET /api/media/upload-auth` endpoint. It creates a fresh UUID token, a five-minute expiry, and the lowercase HMAC-SHA1 signature required by ImageKit without exposing the private key or touching image bytes.
  - Added the protected `PATCH /api/users/me` endpoint. It accepts only a non-empty URL belonging to the configured ImageKit endpoint, updates only the authenticated user's `avatarUrl`, and returns the exact public user shape used by the mobile auth context.
  - Centralized backend ImageKit configuration, signing, and URL validation in `backend/lib/media.ts`. URL acceptance compares parsed protocol, host, and endpoint path boundaries rather than trusting a loose string prefix, preventing lookalike-host and path-prefix bypasses.
  - Extended authentication responses, user search, conversation participants, message history, and conversation `lastMessage` contracts with the existing nullable `avatarUrl`/`mediaUrl` fields. No Prisma model, migration, or database schema change was made.
  - Extended the existing Socket.IO `message:send` schema additively: content may be null only when a valid media URL is present, empty messages and foreign URLs are rejected, and `mediaUrl` flows through the same authorization, idempotent transaction, persist-before-broadcast, acknowledgement, delivery, and read-status path as text.
  - Added `IMAGEKIT_URL_ENDPOINT` to socket-server's fail-fast environment contract so media validation is enforced independently by the process that accepts message sends. The private ImageKit key remains backend-only and is never included in mobile or socket configuration.
  - Installed the Expo SDK 54-compatible `expo-image-picker` 17.0.11 and `expo-image-manipulator` 14.0.8 packages, and registered the image-picker permission plugin without requesting microphone access.
  - Added one reusable mobile media helper for both profile and chat flows. It requests gallery permission, selects images only, resizes the longest dimension to at most 1600 pixels, saves as JPEG at 0.7 quality, requests fresh upload credentials, uploads directly to ImageKit with `FormData`, and verifies the returned URL before use.
  - Added an authenticated profile screen opened by tapping the inbox's own avatar. It displays the cached user, supports pick/compress/upload/save with progress and clear errors, preserves the previous avatar after failures, and updates `AuthContext` plus its cached user immediately after success.
  - Upgraded the shared conversation avatar to render remote profile photos with an image-error fallback to the existing deterministic initials/color design. Conversation rows and New conversation search results now receive server-provided avatars.
  - Initially added the composer attachment action and an online-only image-send path. This restriction was superseded by the post-testing offline-media follow-up below.
  - Added media bubble rendering with a loading placeholder, optional caption, the existing sent/read ticks, and a lightweight full-screen dismissible viewer. Cached/history/live messages all retain URL-only media references; no image bytes enter REST responses, socket payloads, or AsyncStorage.
  - Chose to compute the media-only inbox preview (`📷 Photo`) on mobile so the backend continues returning the underlying nullable content and media URL without inventing persisted text. Live and REST/cache inbox paths use the same preview rule.
  - Reviewed the exact Expo SDK 54 ImagePicker/ImageManipulator documentation and ImageKit Upload V1 authentication contract before implementation. Static socket schema checks accept media-only and text-only sends while rejecting empty and foreign-URL sends; backend and socket production builds, mobile TypeScript/lint, Expo SDK dependency/config checks, repository whitespace checks, and full changed-file Prettier checks pass.
  - Web follow-up: added `PATCH` to the API CORS allow-list. Browsers can now complete the authenticated `PATCH /api/users/me` request after a successful direct ImageKit upload; native Expo Go was unaffected because native fetch is not governed by browser CORS.
  - Web follow-up: changed ImageManipulator resize calls to omit the aspect-ratio dimension instead of explicitly passing `null`. Expo SDK 54's web resize implementation treated `null` as a supplied zero dimension and failed in Canvas `createImageData`; omitting it preserves aspect ratio on every platform and avoids the zero-height/width failure.
  - CodeRabbit follow-up: ImageKit endpoint configuration is now parsed, normalized, and restricted to HTTPS before upload credentials or socket validation can use it. Backend and socket URL checks also require at least one actual asset-path segment after the configured endpoint, so the CDN base URL itself cannot be stored as a broken avatar or message image; the mobile upload-response check mirrors the same rule.
  - CodeRabbit follow-up (superseded by the composer preview/queue flow below): a failed media send recorded its originating conversation ID to prevent attaching it to another chat.
  - CodeRabbit follow-up: direct ImageKit uploads now abort after 60 seconds and always clear their timer. A stalled request returns a retryable timeout message instead of leaving the profile/composer upload state disabled indefinitely.
  - Post-real-device follow-up: image selection now compresses immediately and shows a removable thumbnail beside the composer; optional caption and image are only queued when Send is tapped. The previous immediate-upload and offline-blocking behavior was removed.
  - Extended Feature 14's durable, per-user AsyncStorage queue to media entries. Compressed photos are copied into `expo-file-system` document storage on native (IndexedDB on web), render optimistically from the local copy with a `PENDING` clock, and survive app restarts. The existing per-conversation flush uploads media with fresh ImageKit credentials before its idempotent socket send, retains failed items and ordering, and removes the local copy after server confirmation. Text queue behavior remains unchanged.
  - Follow-up static checks: mobile TypeScript, Expo lint, changed-file Prettier, web export, and repository whitespace checks pass. Real-device offline/restart/reconnect and ImageKit failure-path checks still require manual verification.

- Inbox orphan-conversation resilience repair:
  - Diagnosed the Expo Go `GET /api/conversations` 500 as legacy database data created when users were manually deleted from Neon: the remaining participant can still see a direct conversation whose other participant row was cascade-deleted.
  - The inbox route now filters out conversations with no other participant before mapping them to the mobile contract. Valid conversations continue unchanged, while a malformed legacy row can no longer make the complete inbox fail with a 500.
  - Backend Prettier, `npx tsc --noEmit`, and repository `git diff --check` pass. A local direct Prisma maintenance connection could not complete its Windows TLS channel-binding handshake, so the orphan rows themselves have not been deleted from Neon; they are safely excluded and can be cleaned up later through the Neon SQL console.

- Feature 09 real-device follow-up: initial chat positioning and Android keyboard:
  - Kept the chronological `FlatList` rather than changing it to `inverted`: the existing cursor pagination prepends older messages through the list header and uses `maintainVisibleContentPosition` to preserve the reader's offset. Inverting it would make that proven pagination behavior more complex and risk regressions.
  - Initial cached and live history now request a non-animated scroll before changing from the loading state. The pending scroll is flushed after either list layout or content sizing (on the next frame), so a newly opened conversation lands at its newest message without affecting **Load earlier messages** positioning. Live incoming and sent-message scrolling remains unchanged.
  - Real-device investigation ruled out both built-in Android combinations: `pan` plus height avoidance produced an excessive gap followed by overlap, while native `resize` without JavaScript avoidance left the composer behind the keyboard in Expo Go. Initial history scrolling independently repeats non-animated across its first measured frames and only runs for a newly opened conversation; reconnect/history refreshes and **Load earlier messages** do not force readers back to the newest message.
  - Final keyboard follow-up after the native-only approach also failed in Expo Go: installed Expo SDK 54's bundled `react-native-keyboard-controller` 1.18.5 and added its root `KeyboardProvider`. The provider starts disabled so unrelated screens retain their existing native keyboard behavior; the focused chat enables it and disables it again on blur/unmount.
  - The first keyboard-controller pass used `KeyboardStickyView` around only the composer, but the list lacked keyboard clearance. A later whole-viewport avoiding-view attempt failed to move the absolute composer on the tested device. Feature 19 now combines the sticky composer with a real footer containing both measured composer and live keyboard heights, so both pieces move/clear correctly without depending on Android viewport resize.

## In Progress

- Feature 03 manual real-device verification (signup, persistent session refresh, logout, and backend error states).
- Feature 04 manual real-device verification: copy the exact `JWT_ACCESS_SECRET` used by `backend/` into `socket-server/.env`, set `EXPO_PUBLIC_SOCKET_URL` in `mobile/.env` to `http://<hotspot-ip>:4000`, then confirm the phone can reach `/health`, a logged-in user connects, and an intentionally invalid token is rejected. The implementation is complete; this device/network validation cannot be performed by the agent.
- Feature 06 manual Expo Go verification: confirm list/empty/error states, name and email searches, idempotent selection and focus refresh, native back navigation, light/dark appearance, and logout on a real device. The implementation and static checks are complete.
- Feature 09 remaining two-device verification: complete sender de-duplication, reload/offline-recipient persistence, validation, disconnected draft retention, pagination over 50 messages, keyboard/light/dark layout, sign-out socket cleanup, and account isolation. Re-test the initial open with a long history (it must start at the newest message without an animated jump) and Android composer visibility with the keyboard open; introduce a keyboard-controller dependency only if the `resize` configuration remains unreliable on the target device.
- Feature 09 review follow-up: Android/iOS continue using Expo SecureStore, while web now uses an in-memory access token plus the backend-owned rotating `HttpOnly` refresh cookie. Re-test localhost login, hard refresh, logout, cookie rotation, and account-wide Clear/Delete after one fresh login establishes the new cookie. Feature 11 supplies the bounded Socket.IO reconnection policy; offline message queueing remains intentionally deferred.
- Feature 11 manual two-device verification: re-run Test 5 by exhausting all ten retries in airplane mode and then restoring connectivity while the app stays foregrounded; confirm both automatic NetInfo recovery and the manual disconnected-state retry. The other pending scenarios cover foreground recovery, expired-token refresh, missed-message history re-sync, and sign-out during reconnecting.
- Feature 13 manual two-device verification: re-validate `SENT`/`DELIVERED` as a legible single tick, focused-chat `READ` as a double tick, inbox delivery, background/reconnect catch-up, absence of ticks on incoming bubbles, and light/dark contrast. Confirm native background state and hidden browser tabs defer read acknowledgement until visibility returns. The implementation and static checks are complete; this follow-up real-device/browser verification remains pending.
- Feature 14 manual two-device verification: validate instant online clock-to-tick reconciliation, airplane-mode queueing, force-close/cold-start persistence, automatic recovery, strict same-conversation ordering, independent multi-conversation flushing, and light/dark clock presentation. Server idempotency is live-verified; the physical-device queue and restart scenarios remain pending.
- Feature 15 manual two-device verification: validate cached chat and inbox rendering in airplane mode (including force-close/reopen), switching among multiple previously opened chats, the expected error for a never-opened chat, reconnect merge/de-duplication, genuine HTTP-error handling, and light/dark offline-notice presentation. The implementation and static checks are complete; these physical-device/browser scenarios remain pending.
- Feature 16 manual real-device/browser verification: run all ten specification checks for persisted Light/Dark/System behavior, cross-screen theme consistency, two-account live row movement and unread clearing, empty previews, deterministic avatars, timestamp cases, and inbox appearance. The implementation and static checks are complete; this physical-device/browser validation remains pending.
- Feature 17 manual two-device verification: confirm removable pre-send image preview and optional caption; test offline image queueing, local thumbnail and `PENDING` clock, force-close/reopen persistence, reconnect upload/send, local-file cleanup, same-conversation text/media order after an upload failure, and independent conversations. Re-run avatar propagation, full-screen viewer, media-only inbox previews, foreign-URL rejection, actual ImageKit uploads/compression, and light/dark/error states. Confirm ImageKit's image-only restriction and optional size limit. Physical-device and external-service verification remain pending.
- Optional Neon data hygiene: delete the legacy conversations with fewer than two participants through the Neon SQL console once a browser session or working direct maintenance connection is available. The app no longer depends on this cleanup because the inbox route excludes them.

## Next Up

- Finish Feature 18's real-device visual acceptance for the light chat and inbox palette.
- Decide authentication direction in a separately numbered future feature: keep password login or design Email OTP, accounting for provider cost, deliverability, abuse controls, and the desired mobile sign-in experience.

## Open Questions

- ~~UI color palette, component library, and icon set not yet
  confirmed~~ — Resolved: plain `StyleSheet` with design tokens
  from `ui-context.md`, `@expo/vector-icons` for icons
- ~~Exact Socket.IO reconnection behavior~~ — Resolved in Feature 11 with
  bounded retry backoff, foreground recovery, and history re-sync; Feature 14
  now provides durable offline queueing and ordered reconnect flushing
- ~~Conversation-list UX review: the text-only New conversation action looked
  distorted/unfinished~~ — Resolved in Feature 16 with a padded, accessible
  compose icon button in the inbox header.
- Optional visual follow-up: decide whether a separate screen-by-screen polish
  feature is wanted for chat bubbles, authentication, and New conversation;
  Feature 16 intentionally kept those screens out of redesign scope while
  making them all honor the manual theme preference.
- Docker: socket-server production containerization is complete for Render.
  Backend containerization and any local multi-service Docker Compose setup
  remain future work.

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
