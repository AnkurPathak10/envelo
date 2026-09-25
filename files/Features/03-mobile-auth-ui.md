# Feature 03: Mobile Auth UI

## Goal

Build the signup, login, and session-handling UI in `mobile/`
(Expo/React Native), wired to the real `backend/` auth endpoints
from Feature 02. By the end of this feature, Ankur can open the
app, sign up, get redirected into the app, close and reopen the
app and still be logged in (session persists via refresh token),
and log out.

## Design Decisions Made For This Feature

`ui-context.md` left the component library and icon set
undecided. To unblock implementation, these are now decided as
follows — update `ui-context.md`'s "Open Items to Discuss" section
to mark these resolved once this feature is built:

- **Component library**: plain React Native `StyleSheet` — no
  NativeWind/React Native Paper dependency for now. Keeps the
  dependency list minimal while the app is young; can be
  revisited later if styling repetition becomes painful.
- **Icons**: `@expo/vector-icons` — already bundled with Expo, no
  extra install needed.
- **Forms/validation**: use `react-hook-form` + `zod` (same `zod`
  library already used in `backend/`, so the validation approach
  is consistent across the stack — good for consistency and for
  the resume value of the project).
- **Navigation**: this project already uses Expo Router (file-based
  routing under `mobile/app/`) — continue using it, do not
  introduce React Navigation as a separate library.

## Scope

### In scope

- Signup screen
- Login screen
- Auth state handling: on app launch, check for a stored session
  and route accordingly (logged in → home; logged out → login)
- Secure token storage (Expo SecureStore)
- An authenticated API client wrapper that attaches the access
  token and automatically retries once via the refresh endpoint
  on a 401
- A minimal placeholder home screen (just enough to prove login
  works — e.g. "Logged in as {displayName}" + a logout button).
  Full conversation list UI is a later feature.
- Logout (calls `/api/auth/logout`, clears stored tokens, routes
  back to login)

### Out of scope (do not implement here)

- Conversation list, chat screens, messaging UI — later features
- Password reset / email verification — not in scope for the
  backend either (see `02-auth-backend.md`)
- Profile editing, avatar upload — later feature
- Any Socket.io/real-time connection — later feature

## Manual Setup Required (Ankur — before the agent starts)

1. **Find your computer's local network IP address** (not
   `localhost`) — this is required because a physical phone
   running Expo Go cannot reach `localhost` on your computer; it
   needs your computer's actual LAN IP.
   - Windows: run `ipconfig`, look for "IPv4 Address" under your
     active network adapter (usually starts with `192.168.`).
2. Run `npx next dev` inside `backend/` and confirm it's
   accessible at `http://<your-ip>:3000` from your phone's
   browser (open that URL on your phone to sanity check — you
   should see the Next.js default page or a 404, not a
   connection error).
3. Create `mobile/.env` (gitignore it if not already covered) with:
   ```
   EXPO_PUBLIC_API_URL=http://<your-ip>:3000
   ```
   Expo exposes any env var prefixed `EXPO_PUBLIC_` to client-side
   code automatically — no extra config needed.
4. Inside `mobile/`, install the new dependencies:
   ```
   npx expo install expo-secure-store
   npm install react-hook-form zod @hookform/resolvers
   ```
   (`expo install` is used instead of plain `npm install` for
   Expo-specific native packages — it ensures a version compatible
   with your installed Expo SDK.)

## File Organization

Follow the existing Expo Router structure in `mobile/app/`:

```
mobile/
  lib/
    api/
      client.ts        — fetch wrapper: attaches access token,
                          handles 401 → refresh → retry once
      auth.ts          — signup(), login(), refreshSession(),
                          logout() — thin wrappers around client.ts
    auth/
      storage.ts       — getTokens(), saveTokens(), clearTokens()
                          using expo-secure-store
      AuthContext.tsx  — React context: current user, loading
                          state, login()/logout() actions exposed
                          to the rest of the app
  app/
    _layout.tsx        — wraps the app in AuthContext provider;
                          on mount, checks stored tokens and routes
                          to (auth) or (app) group accordingly
    (auth)/
      login.tsx
      signup.tsx
    (app)/
      home.tsx         — placeholder post-login screen
```

(Adjust group names if they conflict with what's already in
`mobile/app/` — check the existing folder structure before
creating these, since `mobile/app/` already has some scaffolding
from the default Expo template.)

## Token Storage

- Store `accessToken` and `refreshToken` as two separate
  SecureStore keys (e.g. `envelo_access_token`,
  `envelo_refresh_token`) — never combine them into one JSON blob
  under a single key, and never use `AsyncStorage` for either.
- On app launch, read the refresh token from SecureStore. If
  present, call `/api/auth/refresh` immediately to get a fresh
  access token pair (this also validates the stored refresh token
  is still valid — if the call fails, clear storage and route to
  login).
- Do not persist any in-memory-only "remember me" flag — if a
  refresh token exists in SecureStore, the app always attempts to
  resume the session.

### Web session follow-up

- Expo SecureStore is native-only. On web, keep the short-lived access token in memory and store the rotating refresh token only in a backend-issued `HttpOnly` cookie; never put either token in `localStorage` or AsyncStorage.
- Browser auth requests send `X-Envelo-Platform: web` with credentials included. Login/signup set the scoped refresh cookie, refresh rotates it, and logout/rejected refresh clears it. Browser JSON responses must not expose the raw refresh token; native clients retain the existing response-body/SecureStore contract.
- Credentialed CORS must allow only configured origins, include `X-Envelo-Platform`, and allow every API method used by web, including `DELETE` for participant-scoped Clear/Delete actions.
- When Expo web itself is opened on `localhost`/`127.0.0.1`, resolve the configured LAN API host to that same browser hostname while preserving its port. Native Expo Go keeps the configured LAN address; this makes the development browser and API same-site so the HttpOnly cookie works over local HTTP.
- Startup waits for cookie refresh before choosing the protected route, so a normal browser reload keeps the user signed in without briefly rendering cached account data as an unauthenticated session.

## The API Client Wrapper (`lib/api/client.ts`)

Behavior:

1. Reads the current access token (from `AuthContext` or
   SecureStore) and attaches it as `Authorization: Bearer <token>`
   on every request to `backend/`.
2. If a request returns `401`, attempt exactly **once**: call
   `/api/auth/refresh` with the stored refresh token, and if that
   succeeds, retry the original request with the new access
   token. If the refresh also fails, clear stored tokens and route
   the user to the login screen.
3. Do not implement infinite retry loops — one refresh attempt per
   original request, maximum.

## Screens

### Signup (`app/(auth)/signup.tsx`)

- Fields: email, password, display name (matches
  `02-auth-backend.md`'s signup contract)
- Client-side validation via `react-hook-form` + a `zod` schema
  mirroring the backend's rules (email format, password min 8
  chars, non-empty display name) — this gives immediate feedback
  before hitting the network, but the backend remains the source
  of truth for validation.
- On submit: call the signup API. On success, store tokens via
  `storage.ts`, update `AuthContext`, route to `(app)/home`.
- On failure: show the server's error message (e.g. "An account
  with this email already exists") in the UI — do not swallow or
  replace it with a generic message; the backend's message is
  already appropriately generic/specific per endpoint.
- Include a link/button to navigate to the login screen for
  existing users.

### Login (`app/(auth)/login.tsx`)

- Fields: email, password
- Same validation approach as signup.
- On submit: call the login API. On success, store tokens, update
  `AuthContext`, route to `(app)/home`.
- On failure: show the backend's generic "Invalid email or
  password" message — do not attempt to guess or refine this
  message client-side.
- Include a link/button to navigate to the signup screen for new
  users.

### Home (`app/(app)/home.tsx`)

- Minimal placeholder: show the logged-in user's `displayName`
  (from `AuthContext`) and a "Log out" button.
- Logout button: call the logout API with the stored refresh
  token, clear SecureStore regardless of the API call's result,
  clear `AuthContext`, route back to `(auth)/login`.

## Routing / Auth Guard Logic (`app/_layout.tsx`)

- On mount: attempt the silent refresh described above under
  "Token Storage".
- While that check is in progress, show a simple loading state
  (a spinner is enough — no need for a splash screen animation).
- Once resolved: if authenticated, ensure the user lands in the
  `(app)` group; if not, ensure they land in the `(auth)` group.
  Use Expo Router's redirect/guard patterns to enforce this (e.g.
  a layout-level redirect) so a logged-out user can't navigate
  directly to `(app)/home` by deep link.

## Security Notes

- Never log tokens to the console, even during development
  debugging — remove any `console.log` of tokens before
  considering this feature done.
- Never render the access or refresh token anywhere in the UI.
- Confirm `mobile/.env` is gitignored before committing (check
  `mobile/.gitignore` covers `.env`).

## Testing This Feature (before moving to Feature 04)

Manually verify, on a real device via Expo Go:

1. Fresh install / cleared storage → app opens to the login
   screen (not home).
2. Sign up with a new account → lands on home screen showing the
   correct display name.
3. Force-close the app and reopen it → still logged in, still on
   home screen (silent refresh worked).
4. Log out → returns to login screen.
5. Log back in with the same credentials → works, lands on home.
6. Try logging in with a wrong password → the backend's generic
   error message is shown in the UI.
7. Try signing up with an email that's already registered → the
   "already exists" message is shown in the UI.
8. (Optional but good to confirm) Turn off Wi-Fi briefly to
   simulate a network failure during login → the app shows some
   reasonable error state rather than crashing or hanging forever.

## Before Marking This Feature Complete

Per `ai-workflow-rules.md`:

1. All eight test cases above pass on a real device.
2. The security notes above are fully satisfied.
3. The app builds and runs via `npx expo start` with no errors.
4. Update `progress-tracker.md`: move this feature to Completed,
   and update `ui-context.md`'s "Open Items to Discuss" section to
   reflect the component library / icon / navigation decisions
   made here.
