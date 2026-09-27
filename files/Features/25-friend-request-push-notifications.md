# Feature 25: Push Notifications for Friend Requests and Chat Messages

## Goal

Send OS-level push notifications for new friend requests and every
new chat message received from another user, including while the app
is closed. These complement the existing live socket badge/messages.

## Scope addition from Ankur

Chat-message push is included by the implementation request, overriding
the original friend-only scope. One push is sent per newly persisted
message to every recipient device; idempotent client-message retries
do not send another push. Batching, mute settings, and notification
preferences remain future decisions.

## Manual setup required from Ankur

The Expo push service needs no new backend API key for basic sending,
but native push credentials and a development/production build are
required. Expo Go on Android does **not** support remote push on SDK 54.

1. Dependencies are installed in `backend/`, `socket-server/`, and
   `mobile/`; `expo-notifications` is in the app config plugin list.
2. Configure Android FCM v1 credentials for the existing EAS project
   in Expo's credentials dashboard. Download Firebase's
   `google-services.json`, add its path under
   `expo.android.googleServicesFile` in `mobile/app.json`, then
   build/install a development or production app. Keep the FCM
   service-account private key out of Git. A paid Apple
   Developer account is required for real iOS push delivery.
3. No new backend environment variable is required. The mobile app
   uses its existing `extra.eas.projectId`.

## Schema

```prisma
model PushToken {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  token     String   @unique
  createdAt DateTime @default(now())
}
```

A user can have multiple tokens (multiple devices) — the unique
constraint is on the token itself, not per-user, since the same
physical device's token should never be duplicated across accounts
(e.g. after a sign-out/sign-in-as-someone-else on the same phone —
the old owner's stale token should be reassigned, not duplicated).

Ankur's request to implement this feature, alongside his earlier
approval to run spec-listed migrations, authorized the additive
`PushToken` migration. It was applied to the configured testing DB.

## Scope

### In scope

- `POST /api/push/register` — mobile registers its Expo push token
  after requesting notification permission
- Sending a push notification via `expo-server-sdk` when a
  `Friendship` row transitions to `PENDING` (a new request) —
  triggered from the same backend code path as Feature 22's
  `POST /api/friends/request`
- Mobile: request notification permission (on first relevant
  screen, or right after login — implementer's reasonable choice),
  register the token, handle a tapped notification by navigating to
  the Pending Requests screen
- Socket server: after a newly persisted message, send a push to each
  recipient's registered devices. Tapping it opens that conversation.
- On sign-out, best-effort unregister the current device's token.

### Out of scope

- Notification preferences/settings (mute, etc.) — not requested
- Native push-credential/account setup — requires Ankur's Expo,
  Firebase, and (for iOS) Apple accounts

## Backend Changes

### `POST /api/push/register`

Body: `{ token: string }`

1. Require auth.
2. Upsert: if this token already exists (possibly under a different
   user, e.g. shared/reused device), reassign it to the current
   `userId`; otherwise create a new row.
3. `DELETE /api/push/register` removes only the current user's matching
   token during sign-out; offline sign-out still clears the local session.

### Sending on friend request

In the same handler as Feature 22's `POST /api/friends/request`
(the branch that actually creates/reactivates a `PENDING` row, not
the auto-accept branch), after committing:

1. Look up all `PushToken` rows for the addressee.
2. Send a push notification via `expo-server-sdk` to each
   (`title`, `body` naming the requester's display name, and a data
   payload the mobile app can use to navigate directly to Pending
   Requests on tap).
3. A push-send failure must never fail the friend-request API call
   itself — log it and move on; the in-app socket notification from
   Feature 22 still works regardless.

### Sending on chat message

After the socket server commits a new message and acknowledges it,
look up the recipients' tokens and send one push per device. Use the
sender's display name and a short text/media preview. Push failures
must not undo message delivery. The idempotent duplicate-message path
does not send another push.

## Mobile Changes

- Request notification permission using `expo-notifications`
  (Android needs an explicit permission request on modern versions;
  iOS always does).
- On permission grant, get the Expo push token and call
  `POST /api/push/register`.
- Handle a tapped notification (app was backgrounded/closed) by
  navigating to the Profile tab's Pending Requests screen.
- Handle a tapped chat-message notification by navigating to that
  conversation. Only navigate if the currently signed-in account
  matches the notification recipient ID.
- Handle a notification received while the app is foregrounded by
  simply relying on the existing Feature 23 live socket update
  (don't also show a redundant system notification banner while the
  app is actively open and already showing the badge update).

## Security Notes

- A push token is not secret in the way a JWT is, but should still
  only ever be associated with the authenticated user making the
  registration call — never accept a `userId` in the request body.
- Reassigning a token on device reuse (a new user logging into an
  old device) is intentional, per the schema note above — prevents
  stale notifications going to a previous account's owner.

## Testing Checklist

1. Grant notification permission, register successfully.
2. With a development build fully closed on Device B, send a friend request from
   Device A — B receives a real system notification.
3. Tapping that notification opens the app directly to Pending
   Requests.
4. With B's app open and foregrounded, sending a request updates the
   in-app badge (Feature 23) without a redundant system notification
   banner appearing on top.
5. Deny notification permission — the rest of the friend system
   (Features 22/23) still works fully via the in-app socket path;
   nothing breaks or blocks.
6. Send text, photo/GIF, and voice messages to closed Device B: each
   new message produces one notification; retrying the same queued
   client message produces none. Tapping opens the conversation.
7. `npx tsc --noEmit` passes in backend, socket server, and mobile.

## Before Marking This Feature Complete

1. All seven checks above pass on two real Android development or
   production builds with FCM credentials; Expo Go cannot perform
   this test on SDK 54. iOS needs Apple push credentials/build.
2. Migration committed.
3. Mark complete in `progress-tracker.md` only after real-device
   delivery and tap-navigation checks pass.
