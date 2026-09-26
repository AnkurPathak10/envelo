# Feature 21: Hold-to-Record Voice Messages

## Implementation Status (2026-09-26)

Implemented across the Expo app, Socket.IO service, shared offline queue, message history API, conversation inbox, and PostgreSQL schema. The migration is applied to the configured Neon development database and TypeScript verification passes for all three applications. Final acceptance still requires real-device microphone, gesture, playback, interruption, and two-account testing.

## Goal

Let a user hold the chat microphone to record a voice note, release to send it immediately, or slide left while still holding and release over the delete state to discard it. Voice notes use the same optimistic, durable, ordered message pipeline as text, photos, and GIFs and appear on every device signed into either participant's account.

Voice and video calls are explicitly outside this feature. They will use a separately designed signaling/media feature after voice notes are accepted.

## Recording Interaction

- The composer shows the microphone only while there is no sendable text or prepared photo.
- Holding the microphone for 320 ms checks/requests microphone permission, starts recording, dismisses the keyboard and accessory panels, and changes the composer into a recording strip. Releasing before that threshold never starts the native recorder and shows the neutral guidance **Press and hold to record audio**.
- The strip shows a red recording indicator, a live metering-driven waveform, a live `m:ss` timer, a delete target, and **Slide to cancel** guidance.
- Sliding at least 88 logical pixels left arms cancellation and changes the guidance to **Release to delete**. Releasing in this state deletes the temporary recording without queueing or uploading it.
- Releasing anywhere else sends the recording immediately through the durable queue.
- Recordings shorter than 300 ms are discarded with neutral hold guidance rather than a red error. Android stop is delayed until the native recorder has had a safe initialization window, preventing empty clips and `stop failed`/already-prepared retry loops.
- Recording stops automatically at five minutes. This bounds upload size and server metadata while remaining long enough for normal voice notes.
- The light-theme mic glyph is white on the rose action button. The dark-theme mic glyph is black, preserving the requested contrast.

## Permissions and Audio Session

Use Expo SDK 54's official `expo-audio` package.

- Read the current permission first with `getRecordingPermissionsAsync`.
- Call `requestRecordingPermissionsAsync` only when necessary, allowing Android/iOS to display the native system prompt.
- If permission is denied, explain that microphone access is required. If the OS no longer allows another prompt, direct the user to device settings.
- Configure the `expo-audio` plugin with Envelo-specific microphone copy so development/production builds include the required native permission declaration.
- Enable the recording audio session only while preparing/recording and restore playback mode after stop, cancel, failure, maximum duration, or unmount.
- Use the SDK 54 `HIGH_QUALITY` AAC/MPEG-4 preset on native and the Expo web recorder format in browsers.

## Message Contract and Persistence

Voice notes reuse `Message.mediaUrl` and add an explicit nullable duration:

```prisma
model Message {
  // Existing fields remain unchanged.
  mediaUrl        String?
  audioDurationMs Int?
}
```

`audioDurationMs` is present only for voice notes. It must be an integer from 300 through 300,000 and requires an allowed media URL. Images and GIFs leave it null. The field is included in:

- socket send validation, idempotent persistence, acknowledgement, and live events;
- REST history, reply previews, conversation last-message metadata, and search;
- mobile API types, optimistic render models, caches, and inbox updates;
- reply previews, where voice notes are described as **Voice message** without trying to embed a player.

The server remains authoritative. A recording is never considered sent merely because it exists on the device.

## Durable Upload and Offline Behavior

- The completed temporary recording is copied into the existing per-user pending-media store before it appears as a queued message.
- Native uses app document storage; web uses IndexedDB. Temporary recorder output is removed after the durable copy succeeds or after cancellation/failure.
- Pending voice entries retain file name, MIME type, duration, sender, conversation, reply target, client message ID, and creation time.
- Queue flushing uploads the audio directly to ImageKit with fresh backend-signed credentials under `/voice-notes`, then sends the returned URL and duration through the existing idempotent socket path.
- A failed upload/send remains queued and preserves ordering within its conversation. Reconnect or app restart retries it.
- Confirmation, Clear chat, and Delete chat remove the durable local audio copy for the current account.
- No audio bytes are placed in PostgreSQL, Socket.IO payloads, REST JSON, or AsyncStorage.

## Playback UI

Every voice bubble contains:

- the sender's profile photo (or deterministic initials fallback) while idle;
- Play/Pause;
- a deterministic waveform-style progress display;
- elapsed time while playing and recorded duration while idle;
- the ordinary message timestamp and outgoing delivery/read receipt on the same compact footer line as the duration, directly below the waveform;
- a speed control while playing. Tapping it cycles `0.5× → 1× → 1.5× → 2× → 0.5×` with pitch correction.

Playback explicitly disables looping. Reaching the end pauses once and resets the position to zero for an intentional replay.

Remote and locally queued file URLs use the same player. Image viewer behavior must never open for a voice message.

## Failure and Privacy Rules

- Permission rejection, recorder initialization failure, interruption, missing output, local persistence failure, upload timeout, and socket failure produce recoverable UI errors without creating a corrupt server message.
- Cancelling a recording does not upload it or disclose it to the other participant.
- The existing participant-specific Clear/Delete cutoffs apply unchanged to voice notes and their reply previews.
- The microphone is never activated from login/signup, in the background, or without a direct hold gesture in an open conversation.

## Acceptance Checklist

1. On a fresh Android/iOS install, holding Mic shows the native permission prompt; denial is handled without a crash and granting access allows a later hold to record.
2. Hold, speak for several seconds, and release: one optimistic voice bubble appears and reconciles to the server message/tick without duplication.
3. Hold, slide left until **Release to delete**, and release: no bubble, upload, or message appears on either account.
4. A short tap never prepares/stops the native recorder, displays non-red **Press and hold to record audio** guidance, and sends no accidental noise.
5. The recording strip reacts to speech with a live waveform. Idle voice notes show the sender avatar; Play/Pause and waveform progress work; completion stops after one play and returns to the beginning.
6. While playing, speed cycles through exactly 0.5×, 1×, 1.5×, and 2× and changes actual playback rate.
7. The other participant and a second device on the same account receive/play the recording after history refresh or live delivery.
8. Airplane-mode recording survives force-close/reopen, uploads on reconnect, keeps conversation order, and removes its durable local file only after acknowledgement.
9. Replying to a voice note shows **Voice message** in composer/sent preview. Clear/Delete continue to affect only the acting account across all its devices.
10. Test recording interruption, revoked permission, stalled upload, and five-minute auto-stop; the composer always returns to a usable state.
11. Verify the inner mic is white in light mode and black in dark mode.
12. Re-run text, photo, GIF, emoji, attachment, keyboard, and delivery/read receipt regressions.
