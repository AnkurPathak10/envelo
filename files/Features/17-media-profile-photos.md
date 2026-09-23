# Feature 17: Media Sharing & Profile Photos (ImageKit)

## Complexity note

This feature is on the larger side, similar to Feature 14 — it adds
a new external service, a new backend endpoint, a new socket
payload field, and touches several existing screens (composer, chat
bubbles, conversation rows, a new profile screen). Expect a longer
implementation and testing pass than the recent UI-only features.

## Goal

Let users set a profile photo and share images in chat, using
ImageKit as the storage/CDN provider. Images are always referenced
by URL in API responses and socket payloads. Pending uploads keep a
local image file, but AsyncStorage stores only its reference, never
raw image bytes.

## Manual setup required from Ankur (before implementation)

1. Sign up at imagekit.io (free tier). From the dashboard's
   Developer section, collect three values: **Public Key**,
   **Private Key**, and **URL Endpoint**.
2. In the ImageKit dashboard, restrict allowed file types to images
   only (defense in depth — the mobile picker already restricts to
   images, but this closes the gap if that's ever bypassed).
   Optionally set a max upload file size.
3. Add to `backend/.env` (the private key must NEVER reach the
   mobile app or any client-side code):
   ```
   IMAGEKIT_PUBLIC_KEY=<public key>
   IMAGEKIT_PRIVATE_KEY=<private key>
   IMAGEKIT_URL_ENDPOINT=<url endpoint>
   ```
4. Add to `mobile/.env` (these are safe for the client bundle — the
   public key and URL endpoint are meant to be public):
   ```
   EXPO_PUBLIC_IMAGEKIT_PUBLIC_KEY=<same public key>
   EXPO_PUBLIC_IMAGEKIT_URL_ENDPOINT=<same url endpoint>
   ```
5. Install new dependencies:
   - In `mobile/`: `npx expo install expo-image-picker
expo-image-manipulator expo-file-system`
   - No new backend package is required — the signature ImageKit
     needs is a standard HMAC-SHA1 of `token+expire` using the
     private key, computable with Node's built-in `crypto` module.
     Using the official `imagekit` npm package instead is acceptable
     if the agent finds it meaningfully simpler, but the built-in
     approach avoids one more dependency, consistent with this
     project's pattern so far.

## How the upload flow actually works (background, so the design below makes sense)

ImageKit's client-side upload pattern, confirmed against their
current docs:

1. The mobile app asks the backend for one-time upload credentials.
2. The backend generates a `token` (random), an `expire` timestamp
   (a few minutes out), and a `signature` — an HMAC-SHA1 digest of
   `token + expire`, signed with the private key. The private key
   itself never leaves the backend.
3. The mobile app uploads the actual image file **directly to
   ImageKit** (not through your backend — your server never
   touches the image bytes), including the public key, token,
   expire, and signature.
4. ImageKit verifies the signature, accepts the upload, and returns
   the file's public URL.
5. The mobile app then sends that URL to your backend/socket-server
   as normal (setting `avatarUrl`, or as a message's `mediaUrl`).

This keeps your own servers fast and cheap (no file bytes ever pass
through them) while keeping the private key secure.

## Scope

### In scope

- `GET /api/media/upload-auth`: protected endpoint generating
  one-time ImageKit upload credentials
- Profile photo: pick, compress, upload, and save to `User.avatarUrl`
  (field already exists, unused, since Feature 05)
- A minimal profile screen: view/change your own avatar (not a full
  profile-editing feature — display name editing is out of scope
  here)
- Displaying real avatars (replacing Feature 16's initials
  placeholder when `avatarUrl` is set, falling back to initials
  otherwise) in conversation rows
- Chat media: an attachment button in the composer, image picker,
  compression, upload, then sending via the existing `message:send`
  socket event extended with an optional `mediaUrl`
- Rendering image messages as bubbles in the chat screen, with a
  simple tap-to-view full-screen viewer
- Extending Feature 07's history response and Feature 10's
  `lastMessage` to include `mediaUrl`, with a sensible preview text
  (e.g. "📷 Photo") when a message has media but no caption
- Validating that any `avatarUrl`/`mediaUrl` a client submits
  actually belongs to the configured ImageKit URL endpoint, before
  accepting it — a client should never be able to set an arbitrary
  external URL

### Out of scope

- Video, audio, or file-type attachments — images only for this
  feature
- Multi-image messages (one image per message for now)
- Editing an already-sent image message, or deleting media
- Full profile editing (display name change, bio, etc.)
- Changes to the existing text-message flow or delivery/read receipts;
  the same offline queue now also carries images without changing text behavior

## Updated decision: media sending also works offline

The original Feature 17 implementation blocked media while offline.
Real-device testing superseded that decision: selecting a photo now
compresses it and shows a removable composer preview, but does not
send it. On Send, the compressed file is copied to durable local
storage and added to Feature 14's existing AsyncStorage queue with
its caption, local file reference, and stable `clientMessageId`.
The optimistic bubble uses the local image and `PENDING` clock.
On reconnect, the existing ordered flush obtains fresh upload
credentials, uploads to ImageKit, then sends `mediaUrl` through the
same idempotent socket event. Upload/send failure leaves the item
pending and pauses that conversation's flush. Server confirmation
removes both the queue entry and local file. Text queue behavior is
unchanged. Native uses `expo-file-system` document storage; web uses
durable IndexedDB because Expo FileSystem does not support web.

## Backend Changes

### `GET /api/media/upload-auth`

1. Require authentication via the existing `requireAuth` helper.
2. Generate a random token, an expiry a few minutes in the future,
   and the HMAC-SHA1 signature per the flow above.
3. Return `{ token, expire, signature, publicKey, urlEndpoint }`
   (the public key/URL endpoint are already known client-side via
   env vars, but returning them here too keeps the client simple —
   implementer's choice whether to include them or have the client
   use its own env values directly).
4. No database read/write — this endpoint only issues credentials.

### `PATCH /api/users/me`

Request body:

```json
{ "avatarUrl": "string" }
```

Rules:

1. Require authentication.
2. Validate with Zod: non-empty string, and — critically — confirm
   it starts with the configured `IMAGEKIT_URL_ENDPOINT`. Reject
   with 400 otherwise. This is the check that prevents a client
   from setting an arbitrary, non-ImageKit URL as someone's avatar.
3. Update the authenticated user's `avatarUrl`.
4. Return the updated `{ id, displayName, email, avatarUrl }`.

### Extending message-related contracts

- `backend/lib/messages.ts`: add nullable `mediaUrl` to
  `MessageHistoryItem` and its Prisma select — this field already
  exists on the `Message` model (unused since Feature 05), so no
  migration is needed.
- `backend/lib/conversations.ts`: add nullable `mediaUrl` to the
  `lastMessage` selection/mapper, and have the mapper produce a
  `"📷 Photo"` preview string when `content` is null but `mediaUrl`
  is present (this preview text can be computed here or left to the
  mobile client — implementer's choice; document whichever is
  chosen).

### Extending `GET /api/users` search results

Add `avatarUrl` (nullable) to the existing user-search response so
the New Conversation screen can show real avatars too, consistent
with the rest of the app.

## Socket-Server Changes

### `message:send` payload

Add an optional field:

```ts
{ conversationId: string; content: string | null; mediaUrl?: string; clientMessageId?: string }
```

Rules:

1. At least one of `content` or `mediaUrl` must be present and
   non-empty — reject a payload with neither (an empty message).
2. If `mediaUrl` is provided, validate with Zod that it starts with
   the configured `IMAGEKIT_URL_ENDPOINT` — same check as the
   avatar endpoint, same reasoning.
3. `content` remains optional-nullable when media is present (an
   image can have a caption or not).
4. Pass `mediaUrl` through to the existing Feature 08 transaction
   (the `Message` model already supports it) and include it in the
   ack and `message:new` broadcast payload.
5. All existing authorization, idempotency (`clientMessageId`), and
   persist-before-broadcast behavior from Features 08/14 continues
   unchanged — this is an additive field, not a new code path.

## Mobile Changes

### Image selection and compression

Before any upload (profile photo or chat media):

1. Use `expo-image-picker` to let the user choose from their gallery
   (camera capture is a reasonable addition if it fits naturally,
   not required).
2. Use `expo-image-manipulator` to resize the image to a reasonable
   maximum dimension (e.g. 1600px on the longest side) and compress
   it (e.g. JPEG quality ~0.7) before upload — this keeps uploads
   fast, keeps ImageKit's free-tier bandwidth usage reasonable, and
   matches how real chat apps handle this (never send an
   uncompressed multi-megabyte original).

### Upload helper

Add one shared upload function (e.g. `mobile/lib/media/upload.ts`):

1. Calls `GET /api/media/upload-auth` for fresh credentials.
2. Uploads the compressed image directly to
   `https://upload.imagekit.io/api/v1/files/upload` using
   `FormData` with the file, a generated file name, the public key,
   and the returned token/expire/signature.
3. Returns the resulting URL on success, or throws a clear error on
   failure (network issue, ImageKit rejection, etc.).

Both the profile-photo flow and the chat-composer flow should reuse
this one function rather than duplicating upload logic.

### Profile screen

A minimal screen (accessible from the inbox header, e.g. tapping
the user's own current avatar/initials):

- Shows the current avatar (or initials placeholder) and display
  name (read-only for now).
- A button to pick/replace the photo: pick → compress → show a
  brief uploading state → upload → call `PATCH /api/users/me` →
  update `AuthContext`'s cached user so the new avatar reflects
  immediately across the app without a restart.
- Handle upload/save failure with a clear error, leaving the
  previous avatar in place.

### Avatar rendering

Update Feature 16's `avatar-placeholder` component (or the
component that renders it) to: if `avatarUrl` is present, render an
`<Image>` with that URL; otherwise, fall back to the existing
initials-and-color placeholder exactly as built. Apply this in
conversation rows and New Conversation search results.

### Chat composer

1. Add an attachment/image icon (using the existing
   `@expo/vector-icons` convention) beside the text input.
2. Tapping it opens the image picker. On selection: compress, show
   a removable thumbnail, and allow an optional caption. Nothing
   uploads or sends until the user taps Send.
3. On Send, persist the compressed photo to durable local storage
   and enqueue it through Feature 14's queue, even while offline.
   The flush uploads first and emits `message:send` only with a valid
   URL. Preserve per-conversation order across text and media.
4. On upload failure, keep the message pending for the next reconnect
   or queue-flush opportunity; confirmation deletes the local copy.

### Chat bubble rendering

1. If a message has `mediaUrl`, render the image (reasonably sized,
   rounded per the existing `radius` tokens, with a loading
   placeholder while the image itself loads over the network) above
   or below any caption text.
2. Tapping the image opens a simple full-screen viewer (a modal
   showing the image at full size, dismissible by tapping/swiping
   away) — keep this lightweight, no zoom/pan gesture library
   required for v1 unless one is trivially available already.
3. Existing tick/status icon rendering (Feature 13) continues to
   apply to media messages exactly as it does to text messages — no
   special-casing needed there.

## File organization

```text
backend/
  app/api/
    media/
      upload-auth/route.ts
    users/
      me/route.ts
  lib/
    media.ts               — signature generation, URL validation
                              helper shared by both endpoints/routes
mobile/
  lib/
    media/
      upload.ts             — shared pick/compress/upload helper
  app/
    (app)/
      profile.tsx            — minimal avatar view/change screen
  components/
    media/
      image-viewer-modal.tsx
    conversations/
      avatar.tsx             — updated to support real avatarUrl
```

Adjust to match actual current file names/locations from prior
features; reuse existing avatar/icon components rather than
duplicating them.

## Security Notes

- The ImageKit private key lives only in `backend/.env`, used only
  server-side to generate signatures — never sent to the client in
  any form.
- Every `avatarUrl`/`mediaUrl` accepted by the backend or
  socket-server is validated to start with the configured ImageKit
  URL endpoint — this is the core defense against a client
  submitting an arbitrary external URL.
- Upload credentials (`token`/`expire`/`signature`) are short-lived
  and single-purpose — do not cache or reuse them across multiple
  uploads; request fresh ones per upload.
- Do not log image URLs alongside message content in any way that
  would make sensitive images easier to correlate in logs beyond
  what's already logged (IDs only, consistent with all prior
  features).

## Testing Checklist

Use two real devices/accounts.

1. Set a profile photo on Account A — it appears immediately on A's
   own profile screen, and shortly after (once B fetches/receives
   updated data) on B's view of A in the conversation list/search.
2. Send an image (with no caption) from A to B — it renders as an
   image bubble on both devices, ticks work exactly as they do for
   text.
3. Send an image with a caption — both the image and caption render
   correctly.
4. Tap an image bubble — the full-screen viewer opens and dismisses
   correctly.
5. Select an image while A is offline: it previews before Send, can
   be removed, and can have a caption. Send creates a local image
   bubble with a clock; force-close/reopen preserves it. Restore
   network: it uploads, sends once, reconciles to the server ID,
   and removes its local file.
6. Confirm text and image messages queue in per-conversation order;
   a failed upload pauses later items in that conversation without
   blocking other conversations.
7. The conversation list preview shows "📷 Photo" for a
   media-only message's `lastMessage`.
8. Attempt (via a REST client, not the app) to `PATCH /api/users/me`
   with a non-ImageKit URL — confirm it's rejected with 400.
9. Confirm the ImageKit dashboard shows the uploaded files, and that
   file sizes are meaningfully smaller than the original picked
   photos (proving compression actually ran before upload).
10. `npx tsc --noEmit`, `npm run lint`, and `npx prettier --write .`
    pass in `mobile/`; equivalent checks pass in `backend/` and
    `socket-server/` (socket-server only needs Zod schema/type
    changes here, no new install).

## Before Marking This Feature Complete

Per `ai-workflow-rules.md`:

1. All ten checks above pass on two real devices.
2. No Prisma schema or migration changes were made (both fields
   used here already existed).
3. Backend, socket-server, and mobile TypeScript/lint/Prettier
   checks pass.
4. Update `progress-tracker.md`: mark this feature complete, and set
   **Authentication direction (Email OTP vs. current password login)**
   as a separately numbered future decision point (Feature 18 is now
   the light-theme chat/inbox UI upgrade), per the earlier
   discussion about mobile OTP's real SMS costs.
