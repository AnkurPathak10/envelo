# Feature 23: Friend System (Mobile UI)

## Goal

Build the mobile UI for Feature 22's friend system: an extended
search screen showing the right action per person (chat / add /
pending / cooldown), and a Profile-tab section for managing friends
and incoming requests.

## Scope

### In scope

- Extend the existing search screen (New Conversation, from Feature
  06) to use the new `friendStatus` field per result:
  - `FRIENDS`: tapping opens/creates the chat, exactly as today
  - `NONE`: show a "+" button — tapping sends a friend request
  - `PENDING_OUTGOING`: show a disabled "Pending" label
  - `PENDING_INCOMING`: show quick Accept/Reject actions right in
    the search row (a convenience shortcut — the full Profile-tab
    management screen remains the primary place for this)
  - `COOLDOWN`: show a disabled state with the remaining time (or
    just "Try again in X days" — simple text is fine)
- A **Friends** screen under the Profile tab: list of accepted
  friends, each tappable to open/create the chat with them.
- A **Pending Requests** screen under the Profile tab: incoming
  requests with Accept/Reject buttons.
- The Profile tab icon badge (reserved as a placeholder in Feature
  21) now shows the live count of incoming pending requests, fed by
  Feature 22's `GET /api/friends/requests` and its socket
  notification for live updates.

### Out of scope

- Any backend change (Feature 22 already built everything this
  consumes)
- OS-level push notifications (Feature 24)
- Unfriending UI (not built on the backend either)

## Implementation Notes

- Add `friendStatus`/`cooldownEndsAt` to the existing mobile
  `ConversationParticipant`-adjacent search-result type in
  `mobile/lib/api/conversations.ts` (or wherever Feature 06's search
  types live) — extend, don't duplicate.
- Add typed wrappers for the five new endpoints (`sendFriendRequest`,
  `acceptFriendRequest`, `rejectFriendRequest`, `getFriends`,
  `getPendingRequests`) alongside the existing API modules.
- Subscribe to the new `friend:request` socket event (Feature 22) at
  the same provider level as `message:new`/`message:status` — update
  the Profile badge count live, and refresh the Pending Requests
  screen if it's currently open/focused.
- Reuse Feature 16's design tokens, spacing scale, avatar component,
  and badge component throughout — no new visual system.

## Testing Checklist

1. Search for a non-friend — "+" appears; tapping sends a request,
   and the button updates to "Pending" without a manual refresh.
2. On the other account, the Profile tab badge appears/increments
   live (no app restart needed), and the request shows in Pending
   Requests.
3. Accept it — both accounts can now find each other via search with
   `FRIENDS` status, and tapping opens/creates the chat.
4. Reject a request — the rejected party sees the cooldown state in
   search; the rejecter can still send a fresh request to the other
   person at any time.
5. Search for an existing friend — tapping opens the existing chat,
   exactly like Feature 06 always worked.
6. Light/dark mode — all new screens/states render correctly in both.
7. `npx tsc --noEmit`, `npm run lint`, `npx prettier --write .` pass.

## Before Marking This Feature Complete

1. All seven checks above pass on two real devices.
2. No backend change was made.
3. Update `progress-tracker.md`: mark complete, set **Feature 24 —
   Push Notifications for Friend Requests** as next.
