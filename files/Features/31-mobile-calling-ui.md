# Feature 31: Mobile Calling UI

## Goal

Build the single, unified call screen (no separate "voice call" vs
"video call" — camera is just a toggle, Google Meet-style), matching
Ankur's reference screenshots: a call icon in the chat header, a
ringing/outgoing screen, an in-call screen with camera feed and
controls, and a "more options" sheet. Consumes Feature 30's signaling.

## setup required 

Install the Cloudflare RealtimeKit React Native SDK in `mobile/` —
confirm the exact current package name(s) against Cloudflare's docs
at implementation time (their mobile SDK surface is newer and may
have shifted since this spec was written). Request camera and
microphone permissions via the SDK's documented Expo config plugin
requirements.

## Scope

### In scope

- A call icon in the chat header (next to the existing three-dot
  menu, per Ankur's screenshots — left of the menu, not replacing it)
- Outgoing call screen: contact photo/name, "Calling...", Speaker/
  Video/Mute controls, End button — matching reference Image 1
- Incoming call screen: similar layout with Accept/Decline instead
  of in-call controls
- In-call screen: full-screen camera feed when video is active (self
  view + participant view, picture-in-picture style self-preview,
  matching reference Image 2), controls for camera flip, filters/
  effects icon is NOT required (that's a nice-to-have, not requested)
- Camera toggle: tapping Video enables the local camera track live,
  mid-call, no renegotiation UI needed from the user's perspective
  (standard WebRTC track enable/disable) — tapping again disables it,
  reverting to a voice-only view (avatar/photo shown instead of feed)
- A "More" sheet (reference Image 3) with: **Send message** (opens
  the conversation's text chat in a minimized/overlay state — see
  below) and **Share** — omit **Share screen** (explicitly deferred)
  and **Noise cancellation** (not pursued, per Ankur's own call — this
  is a genuinely nontrivial DSP feature, correctly scoped out)
- A minimized/floating in-app call bubble: tapping "Send message" (or
  navigating away from the call screen generally) shrinks the call to
  a small persistent overlay (not true OS-level picture-in-picture,
  which is a separate, harder platform feature) so the user can browse
  the rest of the app while remaining on the call; tapping the bubble
  returns to the full call screen
- A call-log row rendered in chat history (📞/📹 icon, duration or
  "Missed call", tappable to redial)
- Ringtone/vibration on an incoming call (standard Expo audio/haptics,
  nothing exotic)

### Out of scope

- Screen sharing (deferred)
- Group calling (Feature 32)
- True OS-level picture-in-picture
- CallKit/VoIP push (ringing when the app is fully killed) — per
  Feature 30's explicit v1 limitation

## Implementation Notes

- Request microphone permission always (required for any call);
  request camera permission only when the user actually taps the
  video toggle for the first time, not upfront — matches the
  on-demand permission pattern already established elsewhere in
  this app (location/contacts in Feature 19).
- The call screen should be reachable/visible regardless of which
  tab/screen the user is currently on once a call is active — likely
  implemented as a screen mounted above the normal tab navigation
  (a modal-style route or a root-level overlay), not nested inside
  a single tab's stack, so navigating between Chats/Settings/Profile
  doesn't interrupt or hide an active call.
- Reuse the existing avatar, theme tokens, and spacing scale
  throughout — no new visual system.
- Handle the obvious interruption cases gracefully: an incoming
  phone call on the device itself, the app being backgrounded
  mid-call (keep the call alive in the background where the platform
  allows it; Cloudflare's SDK should handle audio continuing in the
  background similarly to how a voice-call app normally behaves —
  verify this specifically during testing, since it's a common gap).

## Testing Checklist

Use two real devices.

1. A taps the call icon in a direct chat — sees the outgoing/ringing
   screen; B sees an incoming call screen with ringtone/vibration.
2. B accepts — both transition to the connected in-call screen.
3. A enables video — A's camera feed appears on both devices; B's
   screen updates to show A's video without B needing to do anything.
4. B also enables video — both see each other's camera feed.
5. Either party disables video mid-call — reverts to voice-only view
   on both sides without dropping the call.
6. Mute/unmute works correctly (verify the other party actually stops
   hearing audio when muted).
7. Tap "Send message" — call minimizes to a floating bubble; the
   chat screen is usable underneath; tapping the bubble restores the
   full call screen without interrupting the call.
8. End the call from either side — both devices return to the chat
   screen; a call-log row appears in history with correct duration.
9. B doesn't answer — A sees a clear "No answer"/missed state after
   the timeout; a missed-call log row appears for both.
10. Background the app mid-call on Android — audio continues; verify
    whether video also continues or gracefully pauses (document
    actual platform behavior found during testing).
11. Light/dark mode — all call screens render correctly in both.
12. `npx tsc --noEmit`, `npm run lint`, `npx prettier --write .` pass.

## Before Marking This Feature Complete

1. All twelve checks above pass on two real devices.
2. No backend/socket contract change beyond what Feature 30 defined.
3. Update `progress-tracker.md`: mark complete, set **Feature 32 —
   Add to Call / Group Calling** as next.
