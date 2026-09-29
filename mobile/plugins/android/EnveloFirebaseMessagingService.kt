package com.envelo.notifications

import android.content.Intent
import expo.modules.notifications.service.ExpoFirebaseMessagingService
import org.json.JSONObject

/**
 * FCM normally renders notification payloads itself when the app is backgrounded.
 * Route only our versioned payloads through Expo instead, so the same native
 * MessagingStyle renderer runs whether JavaScript is running or not.
 * Kept compatible with firebase-messaging 24.0.1 / expo-notifications 0.32.17.
 */
class EnveloFirebaseMessagingService : ExpoFirebaseMessagingService() {
  override fun handleIntent(intent: Intent) {
    val body = runCatching { JSONObject(intent.getStringExtra("body") ?: "") }.getOrNull()
    val type = body?.optString("type")
    val recipient = body?.optString("recipientUserId").orEmpty()
    val chat = body?.optString("conversationId").orEmpty()
    val request = body?.optString("requestId").orEmpty()
    val key = when {
      type == "chat_message" && chat.isNotEmpty() -> "chat:$chat"
      type == "friend_request" && request.isNotEmpty() -> "friend:$request"
      else -> null
    }
    if (body?.optString("notificationStyle") == "conversation-v1" &&
      recipient.isNotEmpty() && key != null) {
      fun value(name: String): String? = intent.getStringExtra("gcm.n.$name")
        ?: intent.getStringExtra("gcm.notification.$name")
      val title = value("title") ?: intent.getStringExtra("title")
      val text = value("body") ?: intent.getStringExtra("message")
      // Preserve Expo's data envelope and presentation fields before disabling
      // FCM's automatic renderer. Do not touch token refresh or unrelated pushes.
      intent.putExtra("title", title ?: body.optString("senderName"))
      intent.putExtra("message", text.orEmpty())
      intent.putExtra("channelId", value("android_channel_id")
        ?: if (type == "chat_message") "messages" else "friend-requests")
      intent.putExtra("tag", "envelo:$recipient:$key")
      intent.putExtra("sound", value("sound2") ?: value("sound") ?: "default")
      intent.removeExtra("gcm.n.e")
      intent.removeExtra("gcm.notification.e")
    }
    // Retains Firebase's duplicate filtering and Expo's token/foreground/tap flow.
    super.handleIntent(intent)
  }
}
