# Feature 30: Calling Backend & Signaling (Cloudflare Realtime)

## Goal

Back the unified voice/video calling feature (Google Meet-style —
camera is a toggle, not a separate call type) with Cloudflare
Realtime (RealtimeKit) as the media infrastructure, and Socket.IO as
the signaling layer for ringing/accept/decline/end. Backend-only —
Feature 31 builds the mobile call screen on top.

## Manual setup required from Ankur

1. In the Cloudflare dashboard, create a RealtimeKit **App** (a
   container for your meetings/sessions — one App is enough for this
   project; no need for separate staging/production Apps yet).
2. Create a Cloudflare API token with RealtimeKit permissions
   (Create API Token guide in their dashboard).
3. Add to `backend/.env`:
   ```
   CLOUDFLARE_REALTIME_APP_ID=<app id>
   CLOUDFLARE_API_TOKEN=<token>
   CLOUDFLARE_ACCOUNT_ID=<account id>
   ```
4. Install in `backend/`: `npm install` whatever Cloudflare's current
   official Node/REST client is, or plain `fetch` against their REST
   API directly if no official server SDK fits cleanly — confirm
   against their current docs at implementation time, since this is
   a newer product and its SDK surface may still be evolving.

## Important schema decision — confirm before implementation

```prisma
enum CallStatus {
  RINGING
  ONGOING
  COMPLETED
  MISSED
  DECLINED
}

model Conversation {
  // ...existing fields...
  realtimeMeetingId String? // Cloudflare Meeting ID, created lazily on first call
}

model CallLog {
  id             String      @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  initiatorId    String
  initiator      User         @relation(fields: [initiatorId], references: [id])
  status         CallStatus
  hadVideo       Boolean      @default(false)
  startedAt      DateTime     @default(now())
  connectedAt    DateTime?
  endedAt        DateTime?
}
```

Notes:
- One Cloudflare **Meeting** is created once per conversation
  (lazily, on that conversation's first-ever call) and reused for
  every call afterward — matching Cloudflare's own recommended
  pattern (their docs' own example is a recurring "Weekly Standup"
  meeting reused across many sessions).
- `CallLog` is intentionally minimal for v1 — one row per call
  attempt, not one row per participant. Per-participant call
  membership is tracked live in the socket-server's in-memory call
  state, not persisted; this keeps the schema simple and avoids an
  unnecessary table for data nobody's asked to query yet.
- `hadVideo` is set `true` if the camera was enabled by **any**
  participant at any point during the call — used for the chat-
  history call-log display ("📞 Voice call" vs "📹 Video call").

Before the agent touches `schema.prisma`, Ankur must explicitly
approve this migration, per `ai-workflow-rules.md`.

## Scope

### In scope

- `POST /api/calls/:conversationId/start` — lazily creates the
  conversation's Cloudflare Meeting if it doesn't exist yet, creates
  a new `CallLog` row (`RINGING`), adds the caller as a Cloudflare
  participant, returns the meeting ID and the caller's `authToken`
- Socket events: `call:invite`, `call:accept`, `call:decline`,
  `call:end`, `call:ringing-timeout` (auto-decline/miss after a
  reasonable ring duration, e.g. 45 seconds with no answer)
- When a callee accepts: backend adds them as a Cloudflare
  participant too, returns their `authToken`, updates `CallLog` to
  `ONGOING` with `connectedAt` set
- When the call ends (either party hangs up, or the last participant
  leaves): update `CallLog` to `COMPLETED`/`DECLINED`/`MISSED` as
  appropriate, set `endedAt`
- A chat-history representation: extend the existing message-history
  response (or treat call logs as their own lightweight item type
  merged into the same chronological list — implementer's choice,
  document whichever) so the chat screen can render a call-log row
  inline with messages, matching WhatsApp/Telegram's "📞 Voice call •
  5m 32s" convention

### Out of scope

- Screen sharing (explicitly deferred, per Ankur's decision)
- Group/multi-party calling beyond the initial two participants —
  Feature 32
- Any mobile UI — Feature 31
- True OS-level ringing when the app is fully killed (CallKit/VoIP
  push on iOS, which needs a paid Apple Developer account Ankur
  doesn't have yet) — v1 ringing works via existing push
  notifications (Feature 25) when backgrounded, and in-app when
  foregrounded; this is an explicit, deliberate limitation

## Socket Events

### `call:invite` (caller → server → callee)

Payload: `{ conversationId: string }`

1. Require auth. Confirm caller is an active participant of the
   conversation.
2. Confirm the caller isn't already in another active call (reject
   with a clear "You're already on a call" error if so — v1 doesn't
   support simultaneous calls).
3. Create/reuse the Cloudflare Meeting and `CallLog` as described
   above.
4. Emit `call:incoming` to the callee's `user:<userId>` room(s) with
   the conversation ID, caller's display info, and a server-issued
   call ID (the `CallLog` ID).
5. Also attempt a push notification via Feature 25's existing
   infrastructure if the callee isn't currently connected (same
   "push failure never fails the underlying action" rule as
   elsewhere).
6. Start a server-side ring timer; if unanswered within 45 seconds,
   transition to `MISSED` and notify the caller via `call:missed`.

### `call:accept` (callee → server)

Payload: `{ callId: string }`

1. Validate the call is still `RINGING` and the acceptor is the
   intended callee.
2. Add the callee as a Cloudflare participant, return their
   `authToken`.
3. Update `CallLog` to `ONGOING`.
4. Notify the caller via `call:accepted` so their client can
   transition from "ringing" to "connected" UI state.

### `call:decline` / `call:end`

- Straightforward status transitions, notifying the other
  participant(s) so their UI updates immediately rather than waiting
  for Cloudflare's own session-ended detection (which exists but is
  slower than a direct socket notification for UX purposes).

## Security Notes

- `authToken`s are short-lived and participant-specific — never
  reused across users or calls.
- Every call action verifies active conversation membership
  server-side; a caller can't invite someone to a call for a
  conversation they're not actually part of.
- The Cloudflare API token/account credentials never reach the
  client in any form.

## Testing Checklist

1. A calls B in a direct conversation — Meeting created lazily,
   `CallLog` starts `RINGING`.
2. B accepts — both get valid `authToken`s, `CallLog` becomes
   `ONGOING`.
3. A calls B again later in the same conversation — the same
   Cloudflare Meeting is reused, a new `CallLog`/session is created.
4. B doesn't answer within the ring timeout — `CallLog` becomes
   `MISSED`, A is notified.
5. B declines explicitly — `CallLog` becomes `DECLINED` immediately,
   not after the timeout.
6. A attempts to start a second call while already in one — rejected
   with a clear error.
7. Call history renders correctly as a row in the conversation's
   message history.
8. `npx tsc --noEmit` and `npm run build` pass in `backend/`; socket
   build passes.

## Before Marking This Feature Complete

1. All eight checks above pass against real Cloudflare
   infrastructure (not mocked).
2. Migration committed.
3. Update `progress-tracker.md`: mark complete, set **Feature 31 —
   Mobile Calling UI** as next.
