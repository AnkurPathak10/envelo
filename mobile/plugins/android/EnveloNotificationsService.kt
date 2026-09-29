package com.envelo.notifications

import android.app.NotificationManager
import android.content.Context
import android.os.Bundle
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.graphics.drawable.IconCompat
import expo.modules.notifications.notifications.model.Notification
import expo.modules.notifications.notifications.model.NotificationBehaviorRecord
import expo.modules.notifications.service.NotificationsService
import expo.modules.notifications.service.delegates.ExpoPresentationDelegate
import expo.modules.notifications.service.delegates.ExpoHandlingDelegate
import expo.modules.notifications.service.interfaces.PresentationDelegate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject

class EnveloNotificationsService : NotificationsService() {
  override fun getPresentationDelegate(context: Context): PresentationDelegate =
    ConversationPresentationDelegate(context)
}

private class ConversationPresentationDelegate(context: Context) : ExpoPresentationDelegate(context) {
  companion object {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val queue = Mutex()
    private const val HISTORY = "envelo.conversation.history"
  }

  override fun presentNotification(notification: Notification, behavior: NotificationBehaviorRecord?) {
    val data = notification.notificationRequest.content.body
    if (data?.optString("notificationStyle") != "conversation-v1" ||
      behavior?.shouldPresentAlert == false) {
      super.presentNotification(notification, behavior)
      return
    }
    scope.launch {
      // Reading history, appending and posting must be atomic across rapid pushes.
      queue.withLock {
        try {
          presentConversation(notification, behavior, data)
        } catch (error: Exception) {
          Log.w("EnveloNotifications", "Conversation rendering failed; using text notification", error)
          super.presentNotification(notification, behavior)
        }
      }
    }
  }

  private suspend fun presentConversation(
    notification: Notification,
    behavior: NotificationBehaviorRecord?,
    data: JSONObject
  ) {
    val request = notification.notificationRequest
    val tag = request.identifier
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val existing = manager.activeNotifications.firstOrNull { it.tag == tag && it.id == 0 }
    // History lives in the active card's extras, so process restarts preserve it;
    // dismissing/tapping a card automatically starts a fresh history next time.
    val history = runCatching {
      JSONArray(existing?.notification?.extras?.getString(HISTORY) ?: "[]")
    }.getOrDefault(JSONArray())
    val entries = (0 until history.length()).mapNotNull { index ->
      history.optJSONObject(index)?.let {
        ConversationMessage(it.optString("id"), it.optString("text"), it.optLong("time"))
      }
    }
    val messageId = data.optString("messageId").ifEmpty { data.optString("requestId") }
    val sentAt = data.optLong("sentAt", notification.originDate.time).takeIf { it > 0 }
      ?: System.currentTimeMillis()
    val retained = ConversationHistory.append(entries, ConversationMessage(messageId, request.content.text.orEmpty(), sentAt))
    if (retained === entries) return

    val name = data.optString("senderName").ifBlank { request.content.title ?: "Someone" }
    val avatar = NotificationAvatar.load(data.optString("senderAvatarUrl"), name)
    val sender = Person.Builder().setName(name).setKey(data.optString("senderId"))
      .setIcon(IconCompat.createWithBitmap(avatar)).build()
    val me = Person.Builder().setName("You").setKey(data.optString("recipientUserId")).build()
    val style = NotificationCompat.MessagingStyle(me).setGroupConversation(false)
    retained.forEach { entry ->
      style.addMessage(entry.text, entry.timestamp, sender)
    }
    // Recover Expo's base card to retain its PendingIntent, marshalled response,
    // channels, sounds and permissions. Only its visual style is replaced.
    val base = super.createNotification(notification, behavior)
    val result = NotificationCompat.Builder(context, base)
      .setStyle(style)
      .setLargeIcon(avatar)
      .setCategory(if (data.optString("type") == "chat_message") NotificationCompat.CATEGORY_MESSAGE else NotificationCompat.CATEGORY_SOCIAL)
      .setContentTitle(name)
      .setContentText(retained.last().text)
      .setWhen(retained.last().timestamp)
      .setShowWhen(true)
      .setNumber(retained.size)
      .addExtras(Bundle().apply {
        putString(HISTORY, JSONArray(retained.map {
          JSONObject().put("id", it.id).put("text", it.text).put("time", it.timestamp)
        }).toString())
      })
      .build()
    // The user may have opened the app while the avatar was downloading.
    // Foreground alerts are suppressed by the app's existing notification policy.
    if (!ExpoHandlingDelegate(context).isAppInForeground() || behavior != null) {
      NotificationManagerCompat.from(context).notify(tag, 0, result)
    }
  }
}
