# Android conversation notifications

`with-conversation-notifications.js` installs native Android sources during Expo
prebuild. These source files must remain in the EAS archive. No database migration,
new Firebase credentials, or change to the Expo push-token format is needed.

The backend and socket server send ordinary Expo pushes with additional versioned
metadata in `data`. Older installed apps continue receiving plain notifications.
The new Android build recognizes `notificationStyle: conversation-v1`, converts
the FCM intent to Expo's data presentation fields before Firebase auto-renders it,
and uses Android `MessagingStyle` through a custom Expo presentation delegate.
This preserves Expo permission handling, channels, foreground suppression, and
notification-tap routing. Other notification payloads use the standard Expo path.

Each chat uses a stable tag scoped to the recipient account and conversation ID.
Messages are deduplicated by message ID, sorted by send time and retained in the
active notification's extras (up to Android's 25-message limit). Updating the same
tag produces one expandable card per chat. Native presentation is serialized to
prevent rapid incoming messages overwriting each other's history. Dismissing or
tapping the card, or opening its chat in the app, resets that card's history.

Avatars are circular Person icons with a large-icon fallback, never image
attachments. HTTPS image fetching has time/size limits, an in-memory cache, and an
initials fallback. Android controls the exact placement, app badge, truncation,
and app-level group heading; those differ across OS versions/manufacturers.
Chat pushes also publish a long-lived conversation shortcut with the sender's
avatar, name, and a deep link to that chat. Android 11+ uses the linked shortcut
for its conversation layout (sender avatar with the app's small badge) and its
expanded heading. A one-to-one conversation title remains as a fallback for
older/OEM layouts; the notification is explicitly marked as non-group. Friend
requests are not conversation shortcuts. Publishing a shortcut is best-effort:
if the OS rejects it, the push still appears and retains its message history.

Group pushes carry the group name/photo separately from the author. The native
renderer uses the group photo for the card and conversation shortcut, the group
name as its title, and a group `MessagingStyle` with each message's own sender
name retained in history. The plain push fallback reads `Sender: message`.
This native presentation requires a rebuilt Android app; server changes alone
cannot replace the existing installed renderer.

This integration targets Expo SDK 54, expo-notifications 0.32.17 and
firebase-messaging 24.0.1. When upgrading, check `FirebaseMessagingService.handleIntent`,
Expo's `body` data envelope and presentation delegate APIs. Notification delegation
is disabled so Google Play Services does not bypass the custom renderer.

## Verification and device test

- `node --test plugins/tests/conversation-plugin.test.js` checks native registration
  and idempotence. `ConversationHistoryTest.kt` is a standalone Kotlin/JVM test of
  five-message accumulation, emoji, duplicate deliveries, ordering, limits and reset.
- Expo prebuild must succeed and include the custom service/receiver, Firebase
  delegation metadata, and notification icon resources in the generated project.
- Build/install a **new APK** with `npx eas-cli@latest build --platform android --profile development`.
  Reloading Metro does not update these native components.
- Restart/update backend and socket server. Start Metro with `npx expo start --dev-client`.
- Clear notifications created by an old APK, background the app, then send five
  messages from one sender, including an emoji. Expect one card with message history.
- Send from a second sender: expect a separate card. Test a sender with a photo and
  a sender without one. Expanding either card must never show an enlarged photo.
- Send from two members of the same group: expect one group card headed by the
  group name, with the group photo (or group initials), and each expanded message
  labeled with its own sender and that sender's profile image, not the group photo.
  Sender avatar URLs are retained in card history across process restarts. Entries
  from an old APK without an avatar URL fall back to author initials; clear old
  notifications before verifying the new build. Direct-chat cards still use sender avatars.
- For chat messages, check the collapsed card for the sender avatar with Envelo's
  app badge, then expand it and confirm the sender name remains visible above the
  accumulated messages. The exact badge placement is controlled by Android/OEM.
- Long-press the chat notification to confirm Android recognizes it as a
  conversation, and test that its launcher shortcut opens the correct chat.
- Tap the card, then background and send another message from the same sender.
  The next tap must reopen the chat. Check the same behavior after normal process
  termination (not Android Settings > Force stop), and check friend-request routing.
- Open a chat from the chat list: its card should clear. Dismiss a card then send
  another message: previously dismissed messages should not reappear.

The native APK compilation and final device appearance must be verified with the
new build. Prebuild and TypeScript checks alone do not verify Android runtime UI.
