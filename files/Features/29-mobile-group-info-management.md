# Feature 29: Mobile Group Info & Management Screen

## Goal

Build the screen that opens when tapping a group's chat header —
matching Ankur's fourth reference screenshot: group photo, name,
member count, Message/Unmute/Leave actions, description, Add
Members, and Members/Media tabs with admin controls.

## Honest scope note

Telegram's reference screenshot shows Members/Media/Files/Links/
Music tabs. This app currently only has **Members** and **Media**
(images/GIFs) as real, populated data — Files, Links, and Music
aren't message types that exist anywhere in this app yet (Files was
explicitly deferred in Feature 19's Milestone 2, Links extraction
was never built, and voice notes aren't "Music" files). Build only
the two tabs that have real content behind them; do not add empty
placeholder tabs that look broken when tapped.

## Scope

### In scope

- The group info screen itself, reached by tapping the group name/
  photo in the chat header (for direct conversations, this same tap
  target can continue to do whatever it already does, or simply be
  a no-op if nothing was built there — this feature only adds new
  behavior for `type: GROUP`)
- Header section: photo, name, member count (no "X online" — this
  app has no presence tracking, correctly matching Ankur's
  instruction to omit it)
- Action row: **Message** (dismisses back to the chat, matching the
  reference's redundant-but-present button), **Mute/Unmute**
  (toggles via Feature 26's endpoints, label reflects current state),
  **Leave** (confirmation dialog, then leaves via Feature 26's
  self-removal endpoint and navigates back to the inbox)
- Description display (admin-editable inline or via a small edit
  screen — either is fine, keep it simple)
- **Add Members** button — reuses Feature 28's Screen 1 friend
  picker (the member-selection UI), pre-filtered to exclude current
  members, calling Feature 26's add-members endpoint instead of the
  group-creation endpoint
- **Members** tab: list of active members, avatar + name, an
  "Admin" label badge for admins, no badge for regular members
- **Media** tab: a grid of images sent in this group (reuse
  whatever gallery/grid pattern exists for viewing shared images, if
  one already exists from the 1:1 media viewer work; otherwise a
  simple grid pulling from message history filtered to image
  messages)
- Per-member admin actions (visible only to admins, only on other
  members' rows — never on your own row, which instead uses the
  Leave button): **Promote to Admin**, **Demote from Admin** (hidden
  if this member is the group's only admin — mirror Feature 26's
  server-side rule so the option isn't even offered when it would
  just fail), **Remove from Group**

### Out of scope

- Files/Links/Music tabs (see honest scope note above)
- Any backend/socket change — this consumes Feature 26/27 as-is

## Implementation Notes

- Gate all admin-only controls (edit description, add members,
  promote/demote/remove) on the current user's role from Feature
  26's `GET /api/conversations/group/:id` response — hide them
  entirely for non-admins rather than showing a disabled button
  that would just 403.
- Present per-member actions via a simple action sheet/menu on
  long-press or a trailing "⋮" button per row — whichever fits the
  existing app's established interaction pattern most naturally.
- Reuse the existing avatar, badge, and spacing-token components
  throughout — no new visual system.

## Testing Checklist

Use a group of 3+ accounts, at least one non-admin member.

1. Tap the group header from the chat screen — info screen opens
   with correct photo/name/member count.
2. As a non-admin member: no admin controls are visible anywhere on
   this screen (no edit, no add members, no per-member actions).
3. As the admin: edit the description — persists and is visible to
   other members.
4. As the admin: add a new friend as a member — they appear in the
   Members tab and can now send/receive in the group.
5. Promote a member to admin — they immediately gain the same admin
   controls on their own device.
6. Demote an admin (with 2+ admins present) — succeeds; attempting
   to demote when they're the sole remaining admin — the option is
   simply not shown (matching Feature 26's server rule).
7. Remove a member — they lose access; if they have the info screen
   open, handle this gracefully (e.g. navigate them out on their
   next inbox refresh, no crash).
8. Leave the group as a non-admin member — returns to inbox, group
   no longer appears in their list.
9. Mute, confirm the button now reads "Unmute" and persists across
   app restart.
10. Media tab shows previously sent images correctly.
11. Light/dark mode — full screen renders correctly in both.
12. `npx tsc --noEmit`, `npm run lint`, `npx prettier --write .` pass.

## Before Marking This Feature Complete

1. All twelve checks above pass on real devices with 3+ real accounts.
2. No backend/socket change was made.
3. Update `progress-tracker.md`: mark complete. This closes out the
   Group Chat arc (Features 26–29).
