# Feature 20: Signup Email Verification via OTP (Brevo)

## Implementation Status (2026-09-26)

Implemented in the backend and Expo app. The Prisma migration is applied to the configured Neon database, existing accounts are backfilled as verified, and backend/mobile static verification passes. Final acceptance still requires one real Brevo-email signup on Expo Go and web so delivery, OTP autofill/manual entry, SecureStore, and the browser refresh cookie can be confirmed with the configured sender.

The implemented verification screen is intentionally light-only. It follows Envelo's white/platinum/rose visual system, shows six OTP cells, enforces the server-provided 60-second resend time, and provides **Not your email?** plus Back actions that return to signup without creating an account.

## Goal

Require a new user to prove ownership of the email address entered during signup by submitting a one-time six-digit code delivered through Brevo Transactional Email.

This is a signup-completion step only. It does not add passwordless login, two-factor login, login OTP, magic links, password-reset OTP, or recurring verification. After a user completes signup, the existing `POST /api/auth/login` email-and-password flow remains unchanged and must never send or request an OTP.

The account and authenticated session are created only after the signup OTP succeeds. This prevents unverified accounts, refresh tokens, conversations, or other user-owned data from being created before email ownership is proven.

## Provider Decision

Use Brevo Transactional Email through its HTTPS API.

- The backend sends `POST https://api.brevo.com/v3/smtp/email` with the backend-only Brevo API key in the `api-key` header.
- Use the existing Next.js/Node `fetch` implementation. Do not add an email SDK dependency merely to call this endpoint.
- The mobile app never receives or reads the Brevo API key.
- Brevo is an external delivery provider only. OTP generation, hashing, expiry, attempt limits, resend rules, signup state, and user creation remain owned by Envelo's backend and PostgreSQL database.
- The free Brevo plan is adequate for development and an early MVP, but it is a quota rather than unlimited infrastructure. Envelo must fail safely when the quota/provider is unavailable and must not bypass verification.

Provider references checked while defining this feature:

- [Brevo free-plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan)
- [Create and verify a Brevo sender](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email)
- [Brevo transactional-email API](https://developers.brevo.com/docs/send-a-transactional-email)

## Manual Setup Required from Ankur

Complete these steps before endpoint implementation or live email testing:

1. Create a free Brevo account.
2. In Brevo, open **Settings → Senders, Domains & Dedicated IPs → Senders** and add a sender.
3. For the zero-cost starting setup, use an email address you control, such as a Gmail or Outlook address. Brevo sends a verification code to that address; enter it in Brevo to verify the sender. A custom authenticated domain is recommended for later production deliverability but is not required to begin development.
4. Open **Settings → SMTP & API → API Keys**, create an API key dedicated to Envelo, and copy it once into the backend environment. Never paste it into mobile configuration, source files, screenshots, commits, or chat messages.
5. Generate an independent OTP HMAC secret. From a terminal, this is sufficient:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

6. Add the following to `backend/.env` for local development:

   ```dotenv
   BREVO_API_KEY=<the API key created in Brevo>
   BREVO_SENDER_EMAIL=<the exact sender address verified in Brevo>
   BREVO_SENDER_NAME=Envelo
   EMAIL_OTP_HMAC_SECRET=<the independent random value generated above>
   EMAIL_OTP_DAILY_CAP=250
   ```

7. Add the same five variables to the backend web service's Environment settings in Render. They belong to the backend service, not the socket-server or Expo service.
8. Restart the local backend after changing `.env`; redeploy/restart the Render backend after changing Render environment variables.

`EMAIL_OTP_DAILY_CAP=250` intentionally leaves headroom beneath Brevo's current free-plan daily allowance. The backend must treat the configured cap as an application-wide ceiling, not as permission to ignore Brevo's own quota.

## Existing-Account Migration Decision

Feature 20 must not force users created before this feature through a new login OTP or lock them out.

- Add `emailVerifiedAt DateTime?` to `User` for an auditable verification timestamp.
- The migration must backfill every existing user's `emailVerifiedAt` with a non-null value (prefer that user's `createdAt`) because those accounts predate the signup-verification requirement.
- Every user created after Feature 20 must be created only by successful OTP verification and must receive `emailVerifiedAt = now()` in that same transaction.
- Login remains email/password only. It must not branch into an OTP challenge.

## Data Model

The schema change requires a Prisma migration. Do not edit production data manually as a substitute for the migration.

```prisma
model User {
  // Existing fields remain unchanged.
  emailVerifiedAt DateTime?
}

model PendingSignup {
  id                 String    @id @default(cuid())
  email              String    @unique
  displayName        String
  passwordHash       String
  otpHash            String
  expiresAt          DateTime
  attempts           Int       @default(0)
  lastSentAt         DateTime
  deliveryAcceptedAt DateTime?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  @@index([expiresAt])
}

model EmailOtpSendEvent {
  id         String    @id @default(cuid())
  emailHash  String
  ipHash     String
  acceptedAt DateTime?
  createdAt  DateTime  @default(now())

  @@index([emailHash, createdAt])
  @@index([ipHash, createdAt])
  @@index([createdAt])
}
```

`PendingSignup` is deliberately separate from `User`: an email becomes an account only after verification. It may contain the already-bcrypt-hashed password but must never contain a plaintext password or plaintext OTP.

`deliveryAcceptedAt` prevents verification with a code whose provider request never reached an accepted state. `EmailOtpSendEvent` supports persistent rate limiting across backend restarts and Render instances: every attempt protects the per-email/per-IP windows, while only rows with `acceptedAt` consume the application-wide successful-send allowance. Hash normalized emails and client IP addresses with `EMAIL_OTP_HMAC_SECRET`; do not store raw IP addresses in this table. Old send events and expired pending signups should be removed by bounded opportunistic cleanup during OTP operations or a later maintenance task.

## Signup Contract Changes

### Existing login contract

`POST /api/auth/login` remains exactly email plus password. A completed user logs in directly and receives the normal access/refresh session. The login screen, login API payload, generic invalid-credentials response, refresh rotation, logout, and multi-device behavior must not acquire any OTP dependency.

### `POST /api/auth/signup`

Request body remains:

```json
{
  "email": "person@example.com",
  "password": "at least 8 characters",
  "displayName": "Person"
}
```

Behavior:

1. Validate and normalize input with the same Zod rules already used by signup.
2. If a completed `User` already owns the normalized email, return the existing `409` account-exists response.
3. Enforce the resend, per-email, per-IP, and global daily limits before generating or sending anything.
4. Hash the password with the existing bcrypt helper.
5. Generate the OTP with `crypto.randomInt(100000, 1000000)` and keep it as a six-character string.
6. Generate or retain the pending-signup ID in application code (a cryptographically random UUID is acceptable), then hash the OTP with HMAC-SHA256 using `EMAIL_OTP_HMAC_SECRET`, binding at least that ID, normalized email, and OTP into the HMAC input. Never use an unsalted plain hash for a six-digit secret.
7. Upsert the `PendingSignup` for this email. A permitted new request replaces the previous OTP hash, resets attempts, advances expiry, sets `deliveryAcceptedAt` back to null, and invalidates every older code.
8. Create an unaccepted `EmailOtpSendEvent`, then send the email through Brevo. Do not include the password, password hash, API key, internal IDs, or authentication tokens in the email.
9. When Brevo accepts the request, atomically set the pending challenge's `deliveryAcceptedAt` and the send event's `acceptedAt`. The challenge is not verifiable before this update succeeds.
10. Return `202` without issuing access or refresh tokens:

```json
{
  "verificationRequired": true,
  "challengeId": "pending-signup-cuid",
  "emailMasked": "p***@example.com",
  "expiresAt": "ISO-8601 timestamp",
  "resendAvailableAt": "ISO-8601 timestamp"
}
```

11. Never return or log the OTP.

If Brevo rejects or times out, return a retryable `503` and do not create a user/session. A pending challenge may remain, but it must not become usable unless an email was successfully accepted by Brevo; a later allowed request rotates the code before retrying delivery.

### `POST /api/auth/signup/verify-otp`

Request body:

```json
{
  "challengeId": "pending-signup-cuid",
  "code": "123456"
}
```

Behavior:

1. Validate `challengeId` and require `code` to be exactly six ASCII digits.
2. Find the pending challenge and reject a missing, unaccepted-delivery, expired, or exhausted challenge with one generic response such as `Invalid or expired verification code`.
3. Recompute the HMAC and compare hashes with `crypto.timingSafeEqual`.
4. On mismatch, atomically increment `attempts`. The fifth failed attempt expires/invalidates the challenge immediately. Concurrent requests must not obtain more than five effective guesses.
5. On success, use one database transaction to:
   - verify the challenge is still live and unconsumed;
   - create `User` with the stored normalized email, display name, bcrypt password hash, and `emailVerifiedAt = now()`;
   - delete the `PendingSignup` so the OTP is single-use.
6. After the transaction succeeds, create the normal refresh-token row and access token using the existing Feature 02 helpers.
7. Return the same authenticated session shape that signup currently returns. Preserve the existing web/native split: web receives its rotating `HttpOnly` refresh cookie, while native receives the refresh token for SecureStore.
8. If another request already completed the same challenge, return the generic invalid/expired response rather than issuing a second session from the OTP.

### `POST /api/auth/signup/resend-otp`

Request body:

```json
{ "challengeId": "pending-signup-cuid" }
```

Behavior:

1. The caller cannot choose a new recipient address; the challenge determines the normalized email.
2. Enforce all send limits.
3. Generate and HMAC a fresh OTP, reset attempts, replace the previous hash, clear `deliveryAcceptedAt`, and set a new ten-minute expiry. The previous OTP becomes invalid immediately.
4. Create the send-attempt event, send through Brevo, and mark both acceptance fields only after Brevo accepts the request.
5. Return the new `expiresAt` and `resendAvailableAt`, never the OTP.
6. Do not create a user or authentication session.

## Rate Limits and Quota Protection

The free provider quota is a shared application resource and must be protected server-side. Mobile countdowns are UX only and are never authoritative.

- Minimum 60 seconds between sends for one pending email.
- Maximum 5 sends per normalized email in a rolling hour.
- Maximum 20 sends per hashed client IP in a rolling hour.
- Maximum `EMAIL_OTP_DAILY_CAP` successful provider submissions across the application in a UTC day.
- Maximum 5 verification attempts per generated code.
- Ten-minute OTP expiry.
- Return `429` with a safe `retryAfterSeconds` value when a cooldown/rate limit applies.
- Do not count a request as successfully sent unless Brevo accepts it, while still preventing rapid retries during provider failure.
- The backend must derive the client address only from trusted deployment headers/connection data appropriate to Render; it must not blindly trust an arbitrary client-supplied IP header.

## Brevo Email Adapter

Create one backend-only adapter, for example `backend/lib/email/brevo.ts`.

Responsibilities:

- Validate required environment variables at use/startup and fail with a configuration-safe server error; never expose secret values.
- Call Brevo's transactional-email HTTPS endpoint with a finite timeout/abort signal.
- Send both a concise plain-text body and minimal HTML equivalent.
- Treat only Brevo's successful response as accepted delivery.
- Return a typed internal result/error; route handlers must not expose Brevo internals or API responses verbatim.
- Never log request headers or the OTP-bearing email body.

Suggested email content:

```text
Subject: Your Envelo verification code

Your Envelo signup code is: 123456

This code expires in 10 minutes. If you did not try to create an
Envelo account, you can ignore this email.
```

Use `BREVO_SENDER_NAME` and the exact verified `BREVO_SENDER_EMAIL` in the `sender` object. Do not use the SMTP login as the From address.

## Backend File Organization

```text
backend/
  lib/
    auth/
      signupOtp.ts          — generation, HMAC, limits, verification
    email/
      brevo.ts              — provider adapter and timeout handling
  app/api/auth/
    signup/route.ts         — validate details and request first OTP
    signup/verify-otp/route.ts
    signup/resend-otp/route.ts
```

Keep route handlers thin. Provider calls, OTP cryptography, rate-limit queries, and transaction logic belong in helpers.

## Mobile Signup Changes

- Login UI and login API wrappers remain unchanged.
- Signup becomes a two-step flow:
  1. display name, email, and password;
  2. six-digit OTP verification for the masked signup email.
- The first successful signup response must not be passed to `AuthContext` because it contains no session. Navigate to the verification step with the challenge details.
- The verification screen shows six numeric cells or one accessible numeric input, expiry guidance, a Verify button, and a Resend action/countdown based on the server timestamp.
- On successful verification, pass the returned normal session through the existing native/web session handling, update `AuthContext`, and navigate to the inbox.
- Back/cancel returns to signup or login without creating a user.
- Persisting `challengeId`, masked email, expiry, and resend time in AsyncStorage is allowed solely to resume an interrupted signup. It is not an authentication token or proof of verification. Never persist the password, OTP, password hash, or Brevo key.
- If the challenge expires or is exhausted, provide a clear route back to signup to request a new code.
- Autofill/paste should be supported where the platform exposes it, but manual entry must always work.

## Security Requirements

- OTPs are generated cryptographically, HMACed, single-use, expire after ten minutes, and allow no more than five guesses.
- Raw OTPs exist only briefly in backend memory and in the outbound email. They are never stored, logged, returned, placed in URLs, analytics, crash reports, or mobile persistence.
- `BREVO_API_KEY` and `EMAIL_OTP_HMAC_SECRET` are backend-only secrets and must never use the `EXPO_PUBLIC_` prefix.
- The OTP HMAC secret must be independent of JWT and refresh-token secrets.
- Passwords are bcrypt-hashed before pending persistence; plaintext passwords are never stored.
- Successful verification and user creation are atomic and protected by the existing unique email constraint.
- Provider failures never result in a verified user or authenticated session.
- API responses expose only masked recipient information and safe application errors.
- Login remains resistant to user enumeration and never reveals verification challenge details.

## Out of Scope

- OTP or magic-link login.
- OTP on every login or new device.
- Two-factor authentication.
- Password reset.
- Changing an existing account's email address.
- Phone/SMS OTP.
- Contact discovery or features gated by verification.
- Custom-domain purchase or mailbox hosting.

## Testing Checklist

1. New signup returns `202` with challenge metadata and no tokens; the Brevo email reaches the real address.
2. The account does not exist in `User` before OTP verification.
3. Correct OTP creates exactly one user, sets `emailVerifiedAt`, returns the normal session, and allows normal password login later with no OTP.
4. Wrong OTP increments attempts; the fifth failure invalidates the code; the correct code then also fails.
5. Expired, already-used, unknown, and exhausted challenges return the same generic verification failure.
6. Resend before cooldown returns `429`; an allowed resend invalidates the older OTP and only the newest code succeeds.
7. Per-email, per-IP, and global daily send limits work across backend restarts.
8. Existing pre-Feature-20 users remain able to log in normally without OTP and have a backfilled `emailVerifiedAt`.
9. Signup for an existing completed email still returns `409` and does not send an email.
10. Brevo timeout, rejection, missing environment variables, or exhausted provider quota returns a safe failure and creates no user/session.
11. Native verification success stores tokens in SecureStore; web receives its rotating `HttpOnly` refresh cookie and survives reload through the existing refresh flow.
12. API key, OTP, password, and secret values never appear in logs, responses, client bundles, AsyncStorage, or committed files.
13. Backend Prisma migration status, TypeScript, production build, and focused OTP verification tests pass.
14. Mobile TypeScript, Expo lint, formatting, web behavior, and real-device Expo verification pass.

## Before Marking This Feature Complete

1. Ankur has verified the Brevo sender and configured all five backend environment variables locally and on Render.
2. The Prisma migration is committed, applied to the intended database, and changes only the planned verification models/fields/indexes.
3. Focused tests cover OTP hashing/comparison, expiry, attempt concurrency, resend invalidation, quota behavior, provider failures, atomic user creation, native session response, and web cookie response.
4. All fourteen checks above pass.
5. `files/progress-tracker.md` records the completed backend/mobile work and retains passwordless/login OTP as out of scope.
