# Feature 02: Authentication Backend

## Goal

Implement a complete, secure, custom JWT-based authentication
system in `backend/` (Next.js). No third-party auth provider
(Clerk, NextAuth, Auth0, etc.) — this is built from scratch, on
purpose, for learning value. By the end of this feature, the
mobile app (built in Feature 03) will be able to sign up, log in,
refresh its session, and log out against real endpoints.

This feature is backend-only. There is no UI work here. Test all
endpoints with a REST client (Postman/Thunder Client/curl) before
Feature 03 begins.

## Scope

### In scope

- Signup (email + password + display name)
- Login (email + password)
- Access token + refresh token issuance
- Refresh token rotation (refresh endpoint)
- Logout (refresh token revocation)
- A reusable "require auth" check for protecting future routes
  (used by later features, e.g. fetching conversations)

### Out of scope (do not implement here)

- OAuth/social login (Google, GitHub, etc.) — may be added later
  as a separate feature on top of this system
- Password reset / email verification flows — not needed for a
  personal learning project in v1
- Rate limiting / brute-force lockout — noted as a stretch goal,
  not required for v1
- Any mobile UI — that is Feature 03

## Data Model

No schema changes needed — `User` and `RefreshToken` already
exist in `backend/prisma/schema.prisma` (see `01-project-setup.md`)
and cover everything this feature needs:

- `User.passwordHash` — bcrypt hash, never the raw password
- `RefreshToken.tokenHash` — hash of the refresh token, never the
  raw token
- `RefreshToken.expiresAt` / `revokedAt` — used to invalidate
  tokens on rotation and logout

## Token Strategy

- **Access token**: a signed JWT, short-lived (15 minutes).
  Payload contains only `{ sub: userId, iat, exp }` — no email,
  no display name, no sensitive data in the payload (JWT payloads
  are base64-encoded, not encrypted, and must be treated as
  readable by anyone who has the token).
- **Refresh token**: a cryptographically random opaque string
  (NOT a JWT) generated with `crypto.randomBytes(64).toString('hex')`.
  Long-lived (30 days). Sent to the client once, stored by the
  client (Expo SecureStore, in Feature 03) — the server only ever
  stores its **hash** (SHA-256 is sufficient here, since this is
  a high-entropy random token, not a low-entropy password — bcrypt
  is not necessary for this value).
- **Rotation**: every time `/api/auth/refresh` is called
  successfully, the old refresh token is marked `revokedAt` and a
  brand new refresh token is issued and stored. If a revoked or
  expired refresh token is ever presented, reject the request —
  do not issue new tokens.
- **No cookies.** Since the client is a mobile app (not a browser),
  tokens are sent as a bearer token in the `Authorization` header
  and in JSON response/request bodies — never as HTTP cookies.
  This also means CSRF protection is not applicable here and
  should not be implemented — it solves a browser-cookie problem
  this app doesn't have.

## Environment Variables

Ankur must add these to `backend/.env` before implementation
begins (the agent should read them via `process.env`, never
hardcode secrets):

```
JWT_ACCESS_SECRET=<long random string>
JWT_REFRESH_SECRET=<a different long random string>
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=30d
```

`JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must be different
values, both at least 32 random bytes. Note: `JWT_REFRESH_SECRET`
here is a bit of a misnomer since refresh tokens aren't JWTs in
this design — repurpose it as `REFRESH_TOKEN_HASH_SECRET` if
that's clearer, used as an HMAC key when hashing the refresh token
(HMAC-SHA256 with this secret, rather than a plain unsalted hash,
so the hash isn't reproducible without the server's secret even if
the DB leaks).

## Libraries to Install

In `backend/`:

```
npm install bcrypt jsonwebtoken zod
npm install --save-dev @types/bcrypt @types/jsonwebtoken
```

- `bcrypt` — password hashing
- `jsonwebtoken` — access token signing/verification
- `zod` — request body validation (required per `code-standards.md`
  — validate all external input before it reaches business logic)

## File Organization

Follow `code-standards.md` conventions:

```
backend/
  lib/
    auth/
      password.ts       — hashPassword(), verifyPassword()
      tokens.ts         — signAccessToken(), verifyAccessToken(),
                           generateRefreshToken(), hashRefreshToken()
      requireAuth.ts     — helper to extract + verify the access
                           token from a request, used by protected
                           routes in future features
    prisma.ts           — Prisma Client singleton (if it doesn't
                           already exist)
  app/
    api/
      auth/
        signup/route.ts
        login/route.ts
        refresh/route.ts
        logout/route.ts
```

Each `route.ts` should stay thin: parse + validate input with zod,
call into `lib/auth/` helpers for the actual logic, return a
response. Business logic does not belong directly in the route
handler body.

## Endpoints

### POST /api/auth/signup

**Request body:**
```json
{ "email": "string", "password": "string", "displayName": "string" }
```

**Behavior:**
1. Validate input with zod (valid email format; password minimum
   8 characters; displayName non-empty, reasonable max length).
2. Check if a `User` with this email already exists. If so, return
   a 409 with a generic message (`"An account with this email
   already exists"`) — this one case is fine to be specific, since
   confirming an email is already taken is normal signup UX and
   not the same risk as a login-enumeration leak.
3. Hash the password with bcrypt (cost factor 10–12).
4. Create the `User` record.
5. Issue an access token and a refresh token (create the
   `RefreshToken` row with its hash).
6. Return `201` with:
```json
{
  "accessToken": "string",
  "refreshToken": "string",
  "user": { "id": "string", "email": "string", "displayName": "string" }
}
```

### POST /api/auth/login

**Request body:**
```json
{ "email": "string", "password": "string" }
```

**Behavior:**
1. Validate input with zod.
2. Look up the user by email.
3. If no user found, OR the password doesn't match: return the
   **same generic error** either way —
   `{ "error": "Invalid email or password" }` with a 401. Do not
   reveal whether the email exists — this prevents user
   enumeration attacks.
4. Use `bcrypt.compare()` for the password check — never compare
   plaintext strings.
5. On success, issue a new access token and refresh token (a new
   `RefreshToken` row — a user can have multiple valid refresh
   tokens across multiple devices/sessions; do not revoke existing
   ones on login).
6. Return `200` with the same shape as signup's success response.

### POST /api/auth/refresh

**Request body:**
```json
{ "refreshToken": "string" }
```

**Behavior:**
1. Hash the provided refresh token (same HMAC method used at
   issuance) and look up a matching `RefreshToken` row by
   `tokenHash`.
2. If no match, or `revokedAt` is set, or `expiresAt` is in the
   past: return `401` with `{ "error": "Invalid or expired refresh
   token" }`. Do not distinguish between these cases in the
   response.
3. If valid: mark the existing `RefreshToken` row's `revokedAt` to
   now (rotation — it can never be used again), then create a new
   `RefreshToken` row and issue a brand new access token.
4. Return `200` with the same `{ accessToken, refreshToken, user }`
   shape as login.

### POST /api/auth/logout

**Request body:**
```json
{ "refreshToken": "string" }
```

**Behavior:**
1. Hash the provided refresh token and mark the matching
   `RefreshToken` row's `revokedAt` to now, if found.
2. Always return `200` with `{ "success": true }`, even if no
   matching token was found (don't leak whether a token existed —
   also makes logout idempotent/safe to call multiple times).
3. This only revokes the **one** refresh token/session provided —
   it does not log the user out of other devices. That is
   correct and expected behavior for v1.

## The `requireAuth` Helper

Build a reusable function (in `lib/auth/requireAuth.ts`) that:

1. Reads the `Authorization` header, expects the format
   `Bearer <accessToken>`.
2. Verifies the JWT signature and expiry using `JWT_ACCESS_SECRET`.
3. On success, returns the decoded payload (at minimum, the
   `userId` from `sub`).
4. On failure (missing header, malformed, invalid signature,
   expired), throws/returns an error that the calling route
   handler turns into a `401` response with
   `{ "error": "Unauthorized" }`.

This helper is not wired into any protected route yet in this
feature (there are no protected routes besides auth itself yet) —
it exists so that Feature 04+ (conversations, messages) can import
and use it immediately without re-deriving this logic. Note in
`progress-tracker.md` that this helper exists and is ready to use.

## Security Checklist (must all be true before this feature is done)

1. Passwords are never stored, logged, or returned in any response
   — only `passwordHash` exists, and it never appears in any API
   response body.
2. Raw refresh tokens are never stored in the database — only
   their hash.
3. JWT secrets are read from `process.env`, never hardcoded, never
   committed (confirm `backend/.env` is gitignored — already true
   per `01-project-setup.md`).
4. Login and refresh failures return identical, generic error
   messages regardless of the specific reason for failure.
5. All request bodies are validated with zod before any database
   query or business logic runs.
6. Access tokens are short-lived (15 min) — the system must not
   rely on a long-lived access token for security.
7. Refresh token rotation actually invalidates the old token — a
   used refresh token must not be usable a second time.

## Testing This Feature (before moving to Feature 03)

Using Postman/Thunder Client/curl, manually verify:

1. Signup with a new email succeeds and returns tokens.
2. Signup with an already-used email fails with 409.
3. Login with correct credentials succeeds and returns tokens.
4. Login with a wrong password fails with 401 and the generic
   message.
5. Login with a non-existent email fails with the **same** 401
   and the **same** generic message (compare the two response
   bodies directly — they must be identical in shape and wording).
6. Calling `/api/auth/refresh` with a valid refresh token returns
   a new access + refresh token pair.
7. Calling `/api/auth/refresh` again with the **same** (now
   rotated-out) refresh token fails with 401.
8. Calling `/api/auth/logout` with a valid refresh token succeeds,
   and that token can no longer be used at `/api/auth/refresh`
   afterward.

## Before Marking This Feature Complete

Per `ai-workflow-rules.md`:

1. All eight test cases above pass.
2. The security checklist above is fully satisfied.
3. `npm run build` passes in `backend/`.
4. Update `progress-tracker.md`: move this feature to Completed,
   note that `requireAuth` is ready for future protected routes,
   and set Feature 03 (mobile auth UI) as the next goal.