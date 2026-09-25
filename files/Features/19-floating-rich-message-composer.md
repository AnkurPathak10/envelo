# Feature 19: Floating Rich Message Composer

## Goal

Replace the full-width, separated chat composer with a floating Telegram-inspired composer. Messages can scroll behind its translucent glass surface, the composer has capsule-shaped ends, and there is no top divider. The right action changes from a microphone to Send whenever text or a prepared attachment is present.

This feature also defines the safe implementation path for emoji, GIF, sticker, voice, file, location, and contact messages. Those types must not be disguised as text or image messages merely to avoid extending the data contract.

## Milestone 1 — composer shell and existing message types

- Render the composer after the message list so `BlurView` can blur dynamic list content correctly.
- Keep the composer background transparent outside its rounded glass capsule. Do not paint a full-width footer or top separator.
- Keep enough list bottom padding that the newest message can be scrolled above the floating controls while still allowing messages to remain visible behind the translucent area.
- Add a left expression button, multiline text field, paperclip attachment button, and contextual microphone/Send action.
- Show the microphone only while both text and attachments are empty. Show Send as soon as trimmed text or an attachment exists.
- Preserve the existing keyboard-controller integration, offline text/photo queue, image compression, preview, removal, optional caption, and send behavior.
- Add an emoji panel that inserts Unicode emoji into the current draft without sending it immediately.
- Move the existing gallery/photo action into a compact attachment menu.
- Show the intended File, Location, and Contact destinations in that menu. Until typed persistence exists, Location and Contact add an explicit, readable text draft that the user reviews and sends. After delivery, only these strictly recognized compatibility formats are enhanced into a linked map or contact card; the underlying payload remains readable text and does not masquerade as another media type. File remains disabled.

## Milestone 2 — typed non-image attachments

Before enabling these controls, extend the persisted and live message contract with an explicit message kind and validated metadata. Additive fields should distinguish at least `IMAGE`, `AUDIO`, `FILE`, `LOCATION`, `CONTACT`, `GIF`, and `STICKER`.

Required work:

1. Add the message kind and validated metadata to Prisma, the socket `message:send` schema, message history, inbox previews, live events, and mobile types. Add and apply a migration rather than encoding hidden prefixes into `content`.
2. Generalize ImageKit upload helpers and the Feature 14 offline queue from JPEG-only `PreparedImage` entries to typed local media. Preserve stable local files, per-conversation ordering, retries, idempotent `clientMessageId`, and post-confirmation cleanup.
3. Enforce MIME type and file-size allow-lists on both the client and socket/backend boundary. Image URLs, arbitrary file URLs, and voice URLs must remain on the configured media endpoint.
4. Add message renderers and accessible viewers/players for each type. Inbox previews must say Photo, Voice message, File, Location, Contact, GIF, or Sticker rather than trying to render every media URL as an image.

### Voice messages

- Use Expo SDK 54 `expo-audio`, request microphone permission only when the user starts recording, and add the required config-plugin permission text.
- Press or long-press the microphone to record, show duration/cancel/send states, stop safely on blur/unmount, and reject empty or oversized recordings.
- Store recordings in the durable offline queue, upload before socket emission, and render an audio player with duration and playback state.

### Files

- Use `expo-document-picker` with immediate cache access, an explicit size ceiling, filename/MIME validation, durable queue storage, upload progress/error state, and a file bubble that opens through the platform safely.

### Location

- Use foreground-only `expo-location` permission requested on demand.
- Let the user confirm a static coordinate before sending. Store structured latitude/longitude metadata and render a location card that opens the installed maps application. Do not enable background tracking.

### Contacts

- Use `expo-contacts` permission requested on demand.
- Present a contact selection UI, allow the user to choose which supported fields are shared, persist only that selected snapshot in message metadata, and never upload the address book.

### GIFs and stickers

- Choose and document a provider, licensing/attribution rules, moderation behavior, search rate limits, and API-key handling before enabling remote search.
- Persist a typed result containing a stable media URL and dimensions. GIF and sticker tabs must not imply working delivery until the provider and typed renderer are complete.

## Acceptance checklist

1. The composer floats above chat content with no full-width background or top line and has fully rounded ends in light and dark modes.
2. Underlying messages remain visible through the translucent/blurred composer region. Android uses Expo BlurView's documented experimental blur method with a safe translucent fallback.
3. Emoji selection updates the draft, and the icon changes from microphone to Send as soon as draft text or a photo exists.
4. Send continues to queue text and compressed photos through the existing Feature 14/17 path. Empty drafts cannot be sent.
5. The attachment menu opens from the paperclip and Gallery continues to show the existing removable preview instead of sending immediately.
6. File, Voice, GIF, and Sticker controls are enabled only after their typed persistence, validation, offline queue, and renderer milestones are complete. Location and Contact may create transparent text drafts as an interim compatibility path. Their strict compatibility payloads render as linked cards, while first-class typed metadata and arbitrary structured cards still require Milestone 2.
7. Initial latest-message positioning, Load earlier messages, Android keyboard movement, pending ticks, status reconciliation, image captions, and offline recovery do not regress.
8. Run mobile TypeScript, Expo lint, web export, and repository whitespace checks. Complete real-device Android visual, keyboard, emoji, attachment, offline, and accessibility testing before marking the feature complete.

## First real-device follow-up (keyboard approach superseded)

Testing on Android exposed four problems in the first floating-composer implementation:

1. The composer was absolutely positioned. `KeyboardStickyView` could translate the composer, but the message list no longer participated in the keyboard-resized layout, so the conversation appeared stationary behind the keyboard.
2. Messages remained too legible below and immediately behind the translucent capsule. Blur alone did not provide the visual fade shown in the reference.
3. The absolute sticky transform could survive navigation/layout timing and leave the composer stranded in the middle of a newly opened chat.
4. The attachment control showed only a compact action row rather than the requested recent-gallery sheet with a camera entry and attachment categories along the bottom.

The first corrective implementation attempted to:

- Keep `KeyboardStickyView` in normal layout flow with only a controlled negative overlap. The second real-device correction below replaces this approach because it still did not resize the message viewport on the tested Android device.
- Re-anchor the list to the newest message on conversation focus and after keyboard opening. Reset pending scroll work when the conversation ID changes, remount the list per conversation, wait for navigation interactions, and repeat the non-animated initial scroll across enough layout frames to cover navigation and media measurement.
- Add a theme-aware fade beneath the composer: transparent-to-near-black in dark mode and transparent-to-near-white in light mode. It sits behind controls and reduces message visibility below the capsule without adding a hard divider.
- Replace the compact attachment actions with a sheet that requests photo access on demand, loads recent photos newest-first, displays a camera tile first, allows direct selection/compression into the existing preview state, and retains a system-picker fallback. The bottom category bar contains Gallery, File, Location, and Contact, with Gallery selected until the later typed-message milestones enable the other categories.
- Use Expo ImagePicker for camera capture and the same immediate JPEG resize/compression pipeline already used for gallery photos. Request camera permission only after the user taps the camera tile.
- Keep video selection disabled until Feature 19's typed media kind, video upload validation, offline queue, and renderer are implemented; the embedded gallery currently requests photos only.

### Follow-up verification

1. Open a long conversation: it lands at the newest message every time with no visible animated jump.
2. Focus the empty input: the composer and newest conversation content rise with the keyboard, remain above it, and return to the bottom after dismissal.
3. Navigate back while the keyboard is open, then open another conversation: the composer starts at the bottom rather than retaining its previous translated position.
4. In light and dark themes, content below the composer fades toward the screen background and is not sharply readable beneath it.
5. Open the paperclip: the sheet shows Camera first, followed by recent photos, and Gallery/File/Location/Contact along the bottom. Selecting or capturing a photo closes the sheet and shows the existing removable compressed preview without sending immediately.

## Second real-device correction: Expo Go permissions and full viewport avoidance

The next Android pass showed that keeping only `KeyboardStickyView` around the composer was insufficient: it translated the input but did not resize the `FlatList`, leaving the conversation stationary. It also exposed Expo Go's Android restriction on full `expo-media-library` access, duplicate asset keys from some device providers, a fade that stopped above the system inset, and an initial bottom inset that could leave the newest bubble under the floating controls.

The corrected implementation:

- Wraps the complete loaded chat viewport in the keyboard controller's `KeyboardAvoidingView`. Android uses height avoidance and iOS uses padding avoidance, so the list and floating composer respond to the same keyboard transition.
- Keeps the composer absolutely overlaid for the glass effect, measures its actual rendered height, and uses that measurement as the list's bottom content inset. Initial `scrollToEnd` therefore places the newest bubble fully above the capsule and microphone instead of behind them.
- Extends the theme-aware gradient through the bottom safe-area region so no clear strip remains between the fade and the bottom edge.
- Catches media-library permission/runtime failures. Assets are de-duplicated by ID before rendering, preventing duplicate React keys. When Android Expo Go cannot expose the embedded recent-photo grid, the sheet remains usable through Camera and ImagePicker's system-gallery fallback instead of throwing an unhandled promise rejection.
- Requests camera, system-gallery, foreground-location, and Android contact permissions only after their corresponding action is tapped. Location inserts coordinates plus a Google Maps link into the visible draft; Contact opens the native single-contact picker and inserts only the selected contact's name and first available phone/email into the visible draft. Neither action sends automatically, uploads the address book, nor enables background location. First-class typed location/contact persistence remains Milestone 2 work.
- Registers SDK 54's `expo-location` and `expo-contacts` config plugins with purpose-specific permission text. Because these are native modules/config changes, a development build is the authoritative environment for the embedded recent-photo grid; Expo Go uses the fallback described above.
- Fixes the React key collision found in the Expo terminal: the conversation's `FlatList` and composer wrapper are siblings, so they now use distinct `messages-<conversationId>` and `composer-<conversationId>` keys. The previous identical conversation-ID keys could cause React to duplicate, omit, or incorrectly reuse either subtree during layout updates.
- Replaces `contentContainerStyle.paddingBottom` with a real `ListFooterComponent` spacer whose height is the measured composer plus separation. Android `FlatList.scrollToEnd()` can anchor to the last row without consistently treating container padding as scrollable content; a real footer makes the clearance part of the list's measured content. The first composer measurement triggers one additional non-animated anchor pass, placing the newest bubble completely above the capsule when a conversation opens while still allowing content to pass behind it during manual scrolling.
- Prevents the initial mid-history flash by keeping the list and composer mounted but visually hidden during their first measurement and non-animated anchor pass. A neutral loading surface remains visible until the final initial `scrollToEnd()` frame completes, then the already-positioned newest-message layout is revealed in one render. Later live messages and user scrolling are unaffected.

## Third real-device correction: keyboard-open clearance

The full-viewport `KeyboardAvoidingView` did not move the absolutely positioned composer on the tested Android/Expo Go combination. That approach is superseded as follows:

- `KeyboardStickyView` once again owns the composer's keyboard animation, which is the controller component specifically designed to translate a view to the keyboard edge.
- Keyboard Controller `willShow`/`didShow` events provide the keyboard height to React state. The real list footer is now `composer height + keyboard height + separation`, so the list has measurable room for both obstructions.
- Keyboard show requests a new bottom anchor. As the footer grows, `onContentSizeChange` completes that request, placing the latest bubble above the sticky composer instead of halfway behind the keyboard. Hide events remove the keyboard portion and restore the closed layout.
- The smooth initial reveal and fixed closed-keyboard latest-message clearance remain unchanged.

## Location and contact link-card follow-up

The compatibility drafts now remain human-readable in storage and over the socket, but their message bubbles recognize only the exact Envelo-generated formats and present them as richer controls:

- Location messages render a non-interactive native map preview with a pin through the Expo SDK 54-compatible `react-native-maps` package. The full card has link semantics and opens the coordinate with the universal Google Maps search URL. Existing messages using the earlier `maps.google.com/?q=` URL are recognized too, so previously sent locations are upgraded without a migration. Web uses a lightweight map-style fallback card and the same link.
- Contact messages render a dedicated contact card. The shared phone number is an underlined link with an accessible call label and opens the device dialer through the `tel:` scheme. A selected email remains visible, but only the phone number initiates a dial action.
- Ordinary text containing coordinates, URLs, or phone numbers is not auto-converted. Both parsers require the complete Envelo-generated two/three-line structure, validate coordinate ranges, and reject mismatched map-link coordinates.
- The send flow, offline text queue, socket contract, and database schema are unchanged. A future Milestone 2 migration will replace this compatibility encoding with explicit location/contact kinds and validated metadata.
- Expo Go can render `react-native-maps` without additional setup. Store/development binaries that force the Google provider must supply platform-restricted Google Maps API keys as described by the Expo SDK 54 deployment guide; keys must stay out of source control.

## Fourth real-device correction: route reveal and inline metadata

- Disable the native stack animation specifically for the conversation route. Android's default push transition briefly composited the still-mounted inbox underneath the incoming conversation scene, producing a visible ghost of the Envelo header, search field, and conversation row. Opening a conversation is now immediate and opaque; message loading, initial bottom anchoring, keyboard behavior, and back navigation remain unchanged.
- Render one real metadata row absolutely at the bubble's lower-right and reserve its footprint with explicit text padding rather than duplicated or hidden timestamp text. Short messages keep their timestamp and outgoing status icon on the same line, and wrapped text cannot collide with the anchored metadata.
- Keep block metadata below media-only, location-card, and contact-card messages, where inline placement would overlap or compress the rich content.

## Emoji catalog and GIPHY expansion

- Replace the original 24-item placeholder with the maintained Unicode 15 native dataset from `@emoji-mart/data`. The picker exposes all dataset categories, category switching, emoji name/keyword search, and accessible insertion into the unsent draft. It uses virtualized rows rather than mounting the entire catalog at once.
- Stickers remain deliberately absent until their later milestone; the expression switcher now advertises only Emoji and GIFs.
- GIPHY is the selected GIF provider. The mobile client calls GIPHY's client-side Trending and Search endpoints, caps queries at 50 characters, requests 24 PG-rated results, and displays visible `Powered by GIPHY` attribution in the provider panel. `EXPO_PUBLIC_GIPHY_API_KEY` is required and documented in `mobile/.env.example`; no API key is committed.
- Selecting a GIF queues it immediately as remote media through the existing durable optimistic/offline pipeline. The socket server accepts only HTTPS media URLs on the existing ImageKit endpoint or exact GIPHY CDN hosts, preventing arbitrary remote-media injection. Pending GIPHY media retains its remote URL and needs no local file copy.
- `expo-image` renders animated GIF/WebP content in bubbles and the fullscreen viewer. GIPHY messages show a provider badge in addition to picker attribution. Text/photo/location/contact behavior, message status reconciliation, keyboard clearance, and newest-message anchoring are unchanged.
- GIPHY activation requires a development/production key from the provider and must retain the provider's attribution. Before store release, upgrade the key according to GIPHY's production policy and complete real-device search, send, offline queue, animation, moderation-rating, and accessibility checks.

## Reply messages and adaptive composer shape

- The composer remains a compact capsule for a one-line draft. As a draft grows beyond one line, or while a reply preview is present, its border radius changes to a 24-point rounded rectangle. The input row keeps the expression, attachment, and microphone/Send action at fixed usable sizes rather than allowing a fully rounded capsule to crowd them.
- Swiping a delivered incoming or outgoing bubble left opens a reply preview above the draft. It identifies the original sender, shows a one-line content/media glimpse, and can be cancelled without changing the draft.
- Sending a reply stores the target message ID in `Message.replyToId`. The socket server validates that the target belongs to the same conversation before persisting it, and history, socket broadcasts/acknowledgements, cache entries, and offline pending messages carry the immutable reply preview needed to render it on every signed-in device.
- Reply bubbles render a compact quoted card with the original sender and message/media preview before the new content. Replies are deliberately unavailable for an optimistic pending bubble because its durable target ID does not yet exist.
- This is a real persisted relationship rather than copying an untrusted reply caption into the message body. If the quoted target is later removed by retention or deletion, PostgreSQL sets `replyToId` to null and the reply message remains intact.
- If an offline reply reconnects after its target has become unavailable, the server returns a typed terminal reply-target failure. The client removes only the stale reply association from durable queue storage, immediately retries the original body/media as a normal message with the same idempotency key, and continues flushing later messages after confirmation.
- Every replyable message also exposes a screen-reader-only Reply button with a bounded message preview. It opens the same reply composer as the gesture without taking over the bubble's existing image, map, contact, or other nested controls.

### Reply gesture and compact-metadata visual correction

- The reply affordance is fully transparent and translated beyond the right screen edge while a bubble is idle. A left drag moves it inward and interpolates its opacity from zero to full visibility; releasing or cancelling the gesture springs both the bubble and affordance back out. No reply icon remains visible behind untouched messages.
- Plain-text bubbles reserve their metadata footprint with deterministic right padding; no hidden or duplicate timestamp/receipt text exists in the content tree. The reserve includes a readable gap between the final word and the lower-right metadata. Short text therefore expands just enough to keep content, timestamp, and receipt on one line, while longer content still leaves a correctly sized lower-right area for the absolutely anchored metadata. The animated bubble owns its sizing directly and every full-width message row anchors outgoing bubbles to the same right edge.
- The pan responder belongs to the full-width message row rather than the bubble alone. A left swipe that starts anywhere across that row moves only the bubble, reveals the reply affordance from outside the right edge, and triggers at a compact threshold so short messages are as easy to reply to as long messages.
