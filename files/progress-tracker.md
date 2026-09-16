# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Feature 03 implemented � pending manual real-device verification

## Current Goal

- Manually verify the Feature 03 mobile authentication flow on Expo Go

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

- Feature 03: Mobile Auth UI implemented in `mobile/`:
  - Replaced the Expo starter routes with protected `(auth)` and `(app)` route groups.
  - Added login, signup, and authenticated placeholder home screens using React Hook Form, Zod, and plain React Native `StyleSheet`.
  - Added encrypted SecureStore storage for separate access and refresh tokens.
  - Added an API client that attaches Bearer tokens, refreshes and retries a 401 request once, then clears the local session if refresh fails.
  - Added `AuthContext` for silent session restoration, authenticated user state, and logout that clears storage even if the API call fails.
  - Installed `expo-secure-store`, `react-hook-form`, `zod`, and `@hookform/resolvers`.
  - Verified `npm run lint` and `npx tsc --noEmit` in `mobile/` pass.
## In Progress

- Feature 03 manual real-device verification (signup, persistent session refresh, logout, and backend error states).

## Next Up

- Feature 04: conversation list and REST API design, after Feature 03 is manually verified.

## Open Questions

- UI color palette, component library, and icon set not yet
  confirmed (see `ui-context.md`)
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