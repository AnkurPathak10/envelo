# Feature 16: Mobile Live Inbox, UX Polish, and Theme Toggle

## Goal

Turn the conversation list from a bare, text-only placeholder into
a real inbox: live-updating previews, unread badges, proper visual
hierarchy, and a manual light/dark toggle. All backend data this
feature needs already exists (Feature 10's `lastMessage`/
`unreadCount`, Feature 12's message `status`) — this is entirely a
mobile presentation and interaction feature.

## Scope

### In scope

- Manual light/dark theme toggle (Light / Dark / Match System),
  persisted across app restarts, replacing every screen's direct
  use of the device's system-only `useColorScheme()`
- Conversation row redesign: avatar placeholder, last-message
  preview, relative timestamp, unread badge, sent-message status
  icon
- Live updates to the conversation list: new messages reorder the
  list, update the preview/timestamp, and update the unread badge
  without a manual refresh or re-navigation
- Header/New Conversation control redesign (replacing the
  flagged "text-only, looks unfinished" action)
- A defined spacing/typography scale applied consistently across
  the redesigned inbox

### Out of scope

- Redesigning the chat screen's message bubbles, the auth screens,
  or the New Conversation search screen — this feature is scoped to
  the inbox/list screen and the theme system that other screens will
  gradually adopt. If the inbox still doesn't feel right after this,
  a further screen-by-screen pass is a reasonable follow-up feature
  rather than expanding this one.
- Real profile pictures/avatar uploads — Feature 17+ (media)
- Any backend, socket-server, or schema change — every data point
  this feature displays already exists

## Design specifics

### Spacing scale

Introduce a small, consistent scale rather than ad-hoc numbers per
screen:

```ts
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};
```

Add this to `mobile/constants/theme.ts` alongside the existing
`colors` and `radius` exports. Use it for all padding/margin values
in this feature's new/changed components — no unscaled magic
numbers like `13` or `17`.

### Conversation row layout

Each row:
- A circular avatar placeholder (`radius.lg` sized appropriately,
  e.g. 48×48) showing the participant's initials (first letter of
  first and last word in `displayName`, uppercase). Background
  color derived deterministically from the user's ID (e.g. hash the
  ID to pick from a small fixed palette of 5–6 muted accent-adjacent
  colors) so the same person always gets the same color — this
  gives visual distinctiveness between conversations without needing
  real photos.
- Display name (bold, `c.textPrimary`) and last-message preview
  (`c.textMuted`, single line, ellipsized) stacked vertically next
  to the avatar.
- Timestamp (`c.textMuted`, small) and unread badge aligned to the
  row's trailing edge.
- Unread badge: a small filled circle/pill using `c.accentPrimary`
  with the count in a light, legible color — cap the displayed
  number at `99+` per Feature 10's existing contract note. Hide the
  badge entirely when `unreadCount` is 0 — do not show an empty
  badge.
- If `lastMessage` is `null` (brand-new empty conversation), show a
  placeholder like "No messages yet" in `c.textMuted` instead of a
  blank space.
- If the last message was sent by the current user, prefix the
  preview with the same tick icon logic from Feature 13 (small,
  reused component if one already exists — do not duplicate the
  icon logic).

### Relative timestamp formatting

Apply simple, familiar rules (this is purely a mobile display
concern — the API already returns ISO timestamps, nothing server-
side changes):

- Under 1 minute: "Just now"
- Under 1 hour: "Xm" (e.g. "12m")
- Same calendar day: "H:MM AM/PM"
- Yesterday: "Yesterday"
- This week: short weekday name (e.g. "Tue")
- Older: short date (e.g. "14 Sep")

Keep this logic in one small shared utility function, not
duplicated inline in the row component.

### Header / New Conversation control

Replace the current plain text action with a proper icon button
(using the existing `@expo/vector-icons` convention — e.g. a
pencil/compose or plus icon) positioned in the header, sized and
padded using the new spacing scale. Keep the existing navigation
behavior (`router.push` to the New Conversation screen) — this is a
visual/layout change only, not a behavior change.

## Theme Toggle

### Storage and context

Add a new `ThemeContext` (or extend an existing top-level provider
if one fits naturally) that:

1. Reads a stored preference (`'light' | 'dark' | 'system'`) from
   AsyncStorage on startup, defaulting to `'system'` if none is set.
2. Exposes the **effective** resolved scheme (`'light' | 'dark'`) —
   when the preference is `'system'`, resolve it against the
   device's actual `useColorScheme()` value from `react-native`.
3. Exposes a setter that updates both the in-memory state and the
   persisted AsyncStorage value.

### Refactor existing screens

Every screen currently calling `useColorScheme()` directly from
`react-native` (Features 03, 06, 09, 13, etc.) must switch to a new
shared hook (e.g. `useAppColorScheme()`) that reads from this
context instead — this is a mechanical, codebase-wide replacement,
not a redesign of those screens. Search the codebase for every
existing `useColorScheme()` import from `'react-native'` and
replace it; do not leave any screen still reading the raw system
value directly, or the toggle will appear broken on that screen.

### Toggle UI

Add a simple control (e.g. a three-way segmented control or a
row of three tappable options) on the Home/inbox screen — a
dedicated Settings screen is not required for this feature; keep it
minimal and accessible from the existing header area.

## Live Inbox Updates

The app already holds a live Socket.IO connection at the provider
level (Features 09/11/13). Extend the existing `message:new` and
`message:status` subscriptions so the inbox screen (not just an open
chat screen) also reacts to them when mounted/focused:

1. On a relevant `message:new` for any conversation the user is
   part of: update that conversation's `lastMessage` preview,
   timestamp, and move it to the top of the list (matching the
   backend's `updatedAt`-descending ordering — no separate client-
   side sort logic needed beyond re-positioning that one row).
2. If the message is incoming (not sent by the current user) and
   the inbox is the visible screen (not a specific chat screen),
   increment that conversation's unread badge locally — the
   authoritative count still comes from the REST endpoint on next
   full fetch, but this gives instant visual feedback without
   waiting for a re-fetch.
3. On a relevant `message:status` update to `READ` for the current
   user's own sent message: no unread-count change needed (that
   only affects the recipient's count), but update the preview's
   tick icon if that message is the currently-shown last message.
4. Do not introduce a second, competing source of truth — the
   existing cache-first + REST-refresh pattern from Feature 15
   remains the baseline; this feature only adds live nudges on top
   of it, consistent with how the chat screen already layers live
   events on top of REST data.

## File organization

```text
mobile/
  constants/
    theme.ts                 — add spacing scale
  lib/
    theme/
      ThemeContext.tsx        — preference storage + effective
                                 scheme resolution
      useAppColorScheme.ts    — shared hook replacing direct
                                 useColorScheme() usage
    format/
      timestamp.ts            — relative timestamp utility
  components/
    conversations/
      conversation-row.tsx    — redesigned row (avatar, preview,
                                 badge, timestamp, tick)
      avatar-placeholder.tsx  — initials + deterministic color
      unread-badge.tsx
  app/
    (app)/
      home.tsx                 — header redesign, live inbox
                                  subscription, theme toggle control
```

Adjust to match whatever the actual current file names/locations
are from prior features — reuse and extend existing components
where they already exist rather than duplicating them.

## Security Notes

- No new security surface — this feature only changes presentation
  and consumes already-authenticated, already-validated data.

## Testing Checklist

1. Toggle theme to Dark, force-close and reopen the app — the
   preference persists (not reset to system default).
2. Toggle theme to Light, then change the device's own system theme
   — the app's theme stays on the manually chosen Light setting,
   not the device's system value (proves the override actually
   works).
3. Set theme to "System" and change the device's system theme — the
   app follows it live.
4. Every screen (auth, inbox, chat, new conversation) reflects the
   chosen theme correctly — spot-check that no screen was missed in
   the `useColorScheme()` refactor.
5. With two accounts, send a message from B to A while A has the
   inbox screen open (not a specific chat) — A's conversation row
   updates its preview/timestamp and moves to the top live, with an
   incremented unread badge, with no manual pull/refresh.
6. Open that conversation as A — the badge clears (existing Feature
   12/13 read-marking behavior) and reflects correctly next time the
   inbox is viewed.
7. A conversation with no messages yet shows "No messages yet"
   rather than a blank preview.
8. Two different conversations show visibly different avatar colors
   for their two different participants; the same participant shows
   the same color consistently across app sessions.
9. Timestamps display correctly for a few different cases: a message
   sent seconds ago, one from earlier today, one from yesterday, and
   one from several days ago.
10. `npx tsc --noEmit`, `npm run lint`, and `npx prettier --write .`
    pass in `mobile/`.

## Before Marking This Feature Complete

Per `ai-workflow-rules.md`:

1. All ten checks above pass on a real device.
2. No backend, socket-server, Prisma schema, or migration changes
   were made.
3. Mobile TypeScript, lint, and Prettier checks pass.
4. Update `progress-tracker.md`: mark this feature complete, resolve
   the "New conversation looks unfinished" open question, and note
   whether a further screen-by-screen visual pass (chat bubbles,
   auth screens) is still wanted as a follow-up feature.
