# Feature 21: Bottom Tab Navigation (Chats / Settings / Profile)

## Goal

Replace the current single-stack `(app)` layout with a Telegram-style
bottom tab dock: **Chats**, **Settings**, **Profile**. This is
navigation-shell work only — no friend system yet (that's Features
22–23) — but it's the foundation those features attach to, so it
goes first.

## Reference (from Ankur's screenshots)

- Three tabs, each with an icon + label, active tab shows a subtle
  background/tint change (matching Telegram's dock exactly).
- The user's own avatar (currently shown at the top of the Chats
  header, per Feature 17) moves into the **Profile** tab instead.
- A numeric badge can appear on a tab icon (top-right corner) —
  Chats shows total unread message count across all conversations;
  Profile will later show pending friend-request count (wired up in
  Feature 23, not this feature — build the badge-capable UI now,
  leave the Profile badge at 0/hidden until that data exists).

## Scope

### In scope

- Convert `mobile/app/(app)/` from a flat stack into an Expo Router
  tab navigator with three tabs, each owning its own nested stack
  (so pushing New Conversation, a chat screen, etc. still works
  correctly within the Chats tab).
- Move the New Conversation header action and the theme toggle
  (Light/Dark/System, from Feature 16) into the **Settings** tab.
- Move Log out (from Feature 06) into **Settings** as well.
- Move the existing Profile screen (avatar view/change, from Feature
  17) to live at the Profile tab's root, instead of being pushed
  from a header tap.
- Add the aggregate unread-count badge on the Chats tab icon,
  summing `unreadCount` across the already-loaded conversation list
  (Feature 10/16 data — no new API call needed).
- Apply the app's existing theme tokens/spacing scale to the tab bar
  itself — no new visual system, reuse what exists.

### Out of scope

- Any friend-system UI (Features 22/23)
- Any backend change — this is 100% mobile navigation/layout
- Push notification badges (Feature 24) — the Profile tab's future
  friend-request badge is out of scope here, only the Chats tab's
  unread badge is built now

## Implementation Notes

- Use Expo Router's tab group pattern: `app/(app)/(tabs)/_layout.tsx`
  as the `Tabs` navigator, with `chats/`, `settings/`, and
  `profile/` as sibling route groups inside it, each with its own
  `_layout.tsx` stack for anything pushed on top (New Conversation,
  `conversation/[conversationId]`, etc. — these currently live
  directly under `(app)/`, so this is a real file-move, not just an
  addition; update every existing `router.push(...)` call site that
  references old paths).
- Tab bar icons: continue the existing `@expo/vector-icons`
  convention. Active/inactive states use the existing theme tokens
  (e.g. `c.accentPrimary` for active, `c.textMuted` for inactive).
- Preserve the existing auth guard (`Stack.Protected` from Feature
  03) at the level above this tab navigator — unauthenticated users
  still never see the tab bar at all.
- Badge rendering: a small reusable badge component (likely already
  exists from Feature 16's per-row unread badge — reuse it, don't
  duplicate) positioned on the tab icon.

## Testing Checklist

1. All three tabs render, navigate correctly, and show the active
   state matching Telegram's visual pattern (subtle background
   change on the active tab).
2. Opening a conversation, then pressing back, returns to the Chats
   tab's list — not to a broken navigation state.
3. New Conversation and Log out now live in Settings and work
   exactly as before, just relocated.
4. Theme toggle (Light/Dark/System) still works from its new
   location in Settings.
5. Profile tab shows the existing avatar view/change screen at its
   root — no extra tap needed to reach it.
6. The Chats tab badge shows the correct summed unread count, and
   updates live when a new message arrives (reusing Feature 16's
   live inbox subscription).
7. `npx tsc --noEmit`, `npm run lint`, `npx prettier --write .` pass.

## Before Marking This Feature Complete

1. All seven checks above pass on a real device.
2. No backend change was made.
3. Update `progress-tracker.md`: mark complete, set **Feature 22 —
   Friend System (Backend)** as next.
