# Feature 28: Mobile Group Creation Flow

## Goal

Build the three-screen group creation flow from Ankur's Telegram
reference screenshots: a floating compose button on the Chats tab,
a friend picker with a selected-chips row, and a group name/photo
screen. Consumes Feature 26's `POST /api/conversations/group`.

## Navigation correction from the bottom-tab feature

The earlier bottom-tab navigation work moved "New Conversation" into
the Settings tab. Per Ankur's screenshots, this moves back: a
floating "+" button sits on the **Chats tab itself** (bottom-right,
matching the reference exactly), replacing that Settings entry.
Tapping it opens a small menu with two options:
- **New Message** — the existing Feature 06/23 friend-chat flow,
  unchanged in behavior, just relocated here
- **New Group** — this feature's new flow

Remove the "New Conversation" action from Settings; it now lives
behind this floating button instead.

## Scope

### Screen 1: Member picker ("New Group")

- A search bar at the top (searching the user's **friends list**
  only, per this app's friends-only design — there's no broader
  "everyone" search here, unlike Feature 06's non-friend discovery
  search).
- Below it, the full friends list (from `GET /api/friends`),
  alphabetically ordered, each with a checkable row.
- Tapping a friend: adds them as a chip (avatar + name) in a
  horizontal row above the search bar, and shows a checkmark on
  their list row — exactly matching the reference screenshot.
  Tapping an already-selected friend's row or their chip removes
  them.
- No upper limit on selection (matches the reference's "3 of
  200000 selected" style, though an exact number label isn't
  required — a simple "X selected" is fine).
- A forward arrow button (bottom-right, matching the reference) is
  disabled until at least one friend is selected; tapping it
  proceeds to Screen 2, carrying the selected member IDs forward.

### Screen 2: Group name & photo

- A circular photo-picker (camera icon placeholder until a photo is
  chosen) — reuses Feature 17's existing pick/compress/upload helper
  exactly as the profile-photo flow does, uploading to ImageKit and
  producing a URL before group creation.
- A text field for the group name, with an emoji button (reusing
  Feature 19's existing emoji panel component) that inserts emoji
  into the name field's text — not a separate send-emoji action.
- **Do not include an Auto-Delete Messages control** — this is
  explicitly not being built; remove it entirely from this screen
  rather than showing it disabled.
- A confirm action (e.g. a checkmark or "Create" button) that:
  1. Validates the name is non-empty.
  2. If a photo was picked, ensures its upload has completed (show a
     brief uploading state if needed).
  3. Calls `POST /api/conversations/group` with the name, photo URL
     (if any), and the member IDs collected from Screen 1.
  4. On success, navigates directly into the new group's chat screen
     (Feature 27 already handles group messaging in that same chat
     screen component — no separate group-specific chat UI needed
     beyond what Feature 29 adds to the header/info screen).
  5. On failure, shows a clear error and lets the user retry without
     losing their entered name/photo/selection.

### Out of scope

- The group info/management screen (tapping the group's header) —
  Feature 29
- Any backend or socket change — this consumes Feature 26/27 as-is

## Implementation Notes

- Reuse Feature 06/23's existing list/row/avatar components for the
  friend picker rather than building new ones — this is structurally
  very similar to the existing New Conversation search screen, just
  sourced from friends instead of a broader search, and multi-select
  instead of single-select-and-navigate.
- The selected-chips row is the one genuinely new UI piece — a
  horizontally scrollable row of small avatar+name chips with a
  remove affordance (tapping the chip itself, per the reference,
  removes that person).
- Follow the app's existing theme tokens/spacing scale throughout —
  no new visual system for this feature.

## Testing Checklist

1. Tap the floating "+" on Chats — the New Message / New Group menu
   appears; New Message still works exactly as before.
2. Search and select several friends — chips and checkmarks update
   correctly; deselecting via either the chip or the list row works.
3. The forward arrow is disabled with zero selected, enabled with
   one or more.
4. On Screen 2, pick a photo — it compresses/uploads correctly
   (reusing Feature 17's pipeline); the emoji button inserts emoji
   into the name field.
5. Create the group — lands directly in its chat screen, which
   already supports sending/receiving per Feature 27.
6. Attempt creation with an empty name — blocked with a clear message.
7. Light/dark mode — all three screens render correctly in both.
8. `npx tsc --noEmit`, `npm run lint`, `npx prettier --write .` pass.

## Before Marking This Feature Complete

1. All eight checks above pass on a real device.
2. No backend/socket change was made.
3. Update `progress-tracker.md`: mark complete, set **Feature 29 —
   Mobile Group Info & Management Screen** as next.
