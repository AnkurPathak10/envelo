# Feature 26: Group Chat — Backend Foundation

## Goal

Add group conversations as a first-class alongside existing direct
(1:1) conversations: creation, membership, admin roles, leave/kick,
mute, and group metadata (name/photo/description). Backend-only —
Features 27–29 build the socket and mobile layers on top.

## Approved design decisions

- **No per-message read receipts for group messages** — see the
  explanation above. Group messages get a single sent tick only.
- Groups are **friends-only at creation and when adding members**,
  consistent with Feature 22's friends-only philosophy — you can
  only add people who are your accepted friends.
- A group's creator becomes its first `ADMIN`. A nonempty group always
  has at least one active admin. The sole admin must promote another
  member before leaving; when they are also the sole member, leaving
  deletes the group. An admin can remove another admin when at least
  one admin remains.
- A separate dissolve action permanently deletes a nonempty group and
  its messages; only the sole active admin may do this.

## Schema decision — approved by Ankur

```prisma
enum ConversationType {
  DIRECT
  GROUP
}

enum ParticipantRole {
  MEMBER
  ADMIN
}

model Conversation {
  // ...existing fields...
  type        ConversationType @default(DIRECT)
  name        String?          // group name; always null for DIRECT
  photoUrl    String?          // group photo (ImageKit URL); null for DIRECT
  description String?          // group description; null for DIRECT
  createdBy   String?          // creator's userId; null for DIRECT
}

model ConversationParticipant {
  // ...existing fields...
  role    ParticipantRole @default(MEMBER)
  leftAt  DateTime?       // soft-delete: set on leave/kick; null = active member
  mutedAt DateTime?       // set when this user mutes this conversation
}
```

Notes:
- `directKey`'s existing unique/nullable design already anticipated
  this — it stays `null` for every `GROUP` conversation, exactly as
  it was designed to allow back in Feature 05.
- `leftAt` is a soft delete: a kicked/left member's row is preserved
  (not hard-deleted) so past messages remain correctly attributable
  and the member list can be reconstructed if ever needed. "Currently
  a member" = `leftAt IS NULL`.
- `photoUrl` reuses Feature 17's existing ImageKit URL-endpoint
  validation — no new upload mechanism needed.

Ankur explicitly approved this migration before implementation.

## Scope

### In scope

- `POST /api/conversations/group` — create a group
- `PATCH /api/conversations/group/:id` — update name/photo/description
  (admin only)
- `POST /api/conversations/group/:id/members` — add members (admin
  only; each new member must be a friend of the adder)
- `DELETE /api/conversations/group/:id/members/:userId` — remove a
  member (admin, removing anyone including other admins — per
  Ankur's explicit instruction) OR a member removing themselves
  (leave)
- `POST /api/conversations/group/:id/members/:userId/promote`
- `POST /api/conversations/group/:id/members/:userId/demote`
- `POST /api/conversations/group/:id/mute` /
  `POST /api/conversations/group/:id/unmute`
- `GET /api/conversations/group/:id` — full detail for the info screen
- `DELETE /api/conversations/group/:id` — permanently dissolve the
  group (sole active admin only)
- Extending the existing `GET /api/conversations` inbox endpoint to
  include group conversations alongside direct ones

### Out of scope

- Socket messaging changes (broadcasting to all members) — Feature 27
- Any mobile UI — Features 28/29
- Files, Links, Music tabs' underlying data — those message types
  don't exist in this app yet; not fabricated here either

## Endpoints

### `POST /api/conversations/group`

Body: `{ name: string; photoUrl?: string; description?: string; memberIds: string[] }`

1. Require auth. Validate `name` non-empty (reasonable max length,
   e.g. 100 chars); `memberIds` may be empty (creator-only group),
   but may not contain duplicates or the creator.
2. Every ID in `memberIds` must be an accepted friend of the caller
   (reuse Feature 22's friendship check) — 403 otherwise, naming
   which one failed is fine here since it's the creator's own friend
   list, no enumeration risk.
3. Validate `photoUrl` against the ImageKit endpoint if provided
   (same rule as Feature 17's avatar validation).
4. Create the `Conversation` (`type: GROUP`, `createdBy: <caller>`),
   the caller as `ADMIN`, and each member as `MEMBER`, atomically.
5. Return the full group object plus member list.

### `PATCH /api/conversations/group/:id`

- Admin only (403 for non-admins/non-members).
- Update any of `name`/`photoUrl`/`description` supplied.

### `POST /api/conversations/group/:id/members`

Body: `{ memberIds: string[] }`

- Admin only. Each new ID must be a friend of the **adder** (not
  necessarily of every existing member).
- Skip IDs already active members; reactivating a previously-left
  member (clearing their `leftAt`) is acceptable if they're re-added.

### `DELETE /api/conversations/group/:id/members/:userId`

- If `userId` equals the caller: allowed to leave unless the caller
  is the sole admin and other members remain. In that case, they
  must promote another admin first (or dissolve the whole group).
- Otherwise: caller must be an admin. Set the target's `leftAt`.
- If the sole admin is also the sole member, leaving deletes the
  group. A group with zero active members is not retained.

### `DELETE /api/conversations/group/:id`

- Require an active admin, and require that this is the group's sole
  active admin. Permanently delete the conversation, participants,
  and messages via the existing cascade relations.

### Promote / Demote

- Admin only.
- **Demote rule:** reject if the target is the group's only current
  admin — return a clear error ("Promote another member first").

### Mute / Unmute

- Any active member, for themselves only. Sets/clears `mutedAt` on
  their own `ConversationParticipant` row. This is what Feature 25's
  push-notification sending must check before sending a group
  message push to this user.

### `GET /api/conversations/group/:id`

- Require the caller to be an active member (admin or not).
- Return `{ id, name, photoUrl, description, createdBy, members:
  [{ id, displayName, email, avatarUrl, role }] }` — active members
  only (`leftAt IS NULL`). Include the caller's `mutedAt` so the
  mute state can be shown and tested.

### `GET /api/conversations` extension

- Include `GROUP` conversations the caller actively belongs to,
  alongside existing direct ones, still ordered by `updatedAt DESC`.
- Add `type`, and for groups, `name`/`photoUrl` in place of the
  direct-conversation `participant` field (mobile will branch on
  `type` to render correctly).
- `lastMessage` preview for a group should be prefixed with the
  sender's display name (e.g. `"Ravi: Hello"`) — Feature 27 will
  supply the actual message data; this feature just needs the
  response shape ready for it.

## Security Notes

- Every mutation checks active membership and, where relevant,
  `ADMIN` role — server-side, from the verified JWT, never trusted
  from the client.
- The friends-only gate on group creation/adding applies exactly
  once per new member relative to the person performing that action
  — it does not require every existing member to be mutually
  friends with every other member (that would be unreasonably
  restrictive and isn't how Telegram groups work either).

## Testing Checklist

1. Create a group with 3 friends — creator is `ADMIN`, others `MEMBER`.
2. Attempt to add a non-friend as a member — rejected.
3. Promote a member, then have them successfully perform an admin
   action (e.g. remove another member).
4. Attempt to demote the sole remaining admin — rejected.
5. A member leaves — group continues to function for the rest;
   they no longer appear in `GET .../group/:id`.
6. An admin removes another admin — succeeds (per explicit spec).
7. Mute, then confirm the mute state persists via `GET .../group/:id`
   or an equivalent check.
8. `GET /api/conversations` returns both direct and group
   conversations correctly shaped.
9. A creator-only group can be created; when its sole admin leaves,
   the group is deleted.
10. A nonempty group can be dissolved by its sole admin, but not while
    multiple active admins exist.
11. `npx tsc --noEmit` and `npm run build` pass in `backend/`.

## Before Marking This Feature Complete

1. All eleven checks above pass against the real database.
2. Migration committed.
3. Update `progress-tracker.md`: mark complete, set **Feature 27 —
   Group Chat Socket Messaging** as next.
