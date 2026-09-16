# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Feature 03 implemented - pending manual real-device verification

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

## In Progress

- Feature 03 manual real-device verification (signup, persistent session refresh, logout, and backend error states).

## Next Up

- Feature 04: conversation list and REST API design, after Feature 03 is manually verified.

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