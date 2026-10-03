# Feature 32: Add to Call / Group Calling

## Goal

Let a user invite another friend into an ongoing call, growing a 1:1
call into a multi-party one — any friend of **either** existing
participant can be invited, per Ankur's original description. Since
every call already routes through Cloudflare's SFU (not a direct
peer-to-peer mesh), adding participants is a natural extension of
Feature 30/31, not new media architecture.

## Scope

### In scope

- The "add person" icon already visible in Ankur's reference
  screenshots (top-right of the call screen) opens a friend picker
  (reusing Feature 28's existing member-picker component)
- Inviting someone mid-call sends them a `call:invite` exactly like
  starting a fresh call (Feature 30's existing event), but targeting
  the *existing* call's Meeting/session rather than creating a new
  one
- The call screen's UI adapts from a 1:1 layout to a grid/multi-tile
  layout once a third participant joins (standard video-grid
  pattern — reasonable simple implementation, not required to be
  visually elaborate)
- Any current participant can add more people (not restricted to the
  original caller) — matches Ankur's "any friend of any two users"
  description
- A joined multi-party call continues to log as one `CallLog` row;
  `hadVideo` and duration logic are unchanged from the 1:1 case

### Out of scope

- A participant list/management UI beyond simply seeing who's in the
  grid (no kick-from-call, no mute-others — not requested)
- Any SFU-scaling concerns beyond what Cloudflare already handles —
  this feature doesn't need to reason about media routing at all,
  that's Cloudflare's job once participants are properly added via
  the API

## Implementation Notes

- The friends-only gate applies per-invite exactly like Feature 26's
  group-chat membership rule: the person extending the invite must
  be friends with the person being invited (not every other call
  participant).
- No cap on participant count is being requested, but it's worth
  surfacing to Ankur during implementation if Cloudflare's specific
  plan/preset imposes a practical limit — note this in
  `progress-tracker.md` if discovered, rather than silently
  enforcing an arbitrary cap.
- Reuse Feature 31's existing call-screen component, extending its
  layout logic for 3+ participants rather than building a parallel
  group-call screen.

## Testing Checklist

1. A and B are in a 1:1 call. A adds C (A's friend, not necessarily
   B's) — C receives a ring, accepts, and all three are connected.
2. B (not the original caller) adds D — succeeds, confirming any
   participant can extend the call.
3. The call screen correctly shows all active participants' tiles,
   including video for whoever has their camera on and avatars for
   whoever doesn't.
4. One participant leaves — the remaining participants' call
   continues uninterrupted.
5. The call ends when the last participant leaves — `CallLog`
   resolves correctly as in the 1:1 case.
6. `npx tsc --noEmit`, `npm run lint`, `npx prettier --write .` pass.

## Before Marking This Feature Complete

1. All six checks above pass with 3+ real devices/accounts.
2. No backend contract change beyond reusing Feature 30's existing
   invite event for an in-progress call.
3. Update `progress-tracker.md`: mark complete. This closes the
   Calling arc (Features 30–32); Screen Sharing remains a deliberately
   deferred follow-up whenever Ankur wants to pick it up.
