package com.envelo.notifications

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
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
        ConversationMessage(it.optString("id"), it.optString("text"), it.optLong("time"),
          it.optString("senderName"), it.optString("senderId"))
      }
    }
    val messageId = data.optString("messageId").ifEmpty { data.optString("requestId") }
    val sentAt = data.optLong("sentAt", notification.originDate.time).takeIf { it > 0 }
      ?: System.currentTimeMillis()
    val groupName = if (data.isNull("groupName")) null else
      data.optString("groupName").takeIf { it.isNotBlank() }
    val senderName = data.optString("senderName").ifBlank { request.content.title ?: "Someone" }
    val messageText = data.optString("messageText").ifBlank { request.content.text.orEmpty() }
    val retained = ConversationHistory.append(entries, ConversationMessage(messageId, messageText, sentAt,
      senderName, data.optString("senderId")))
    if (retained === entries) return

    val name = groupName ?: senderName
    val avatar = NotificationAvatar.load(
      if (groupName != null) data.optString("groupPhotoUrl") else data.optString("senderAvatarUrl"), name)
    val sender = Person.Builder().setName(senderName).setKey(data.optString("senderId"))
      .setIcon(IconCompat.createWithBitmap(avatar)).build()
    val me = Person.Builder().setName("You").setKey(data.optString("recipientUserId")).build()
    // Android R+ takes the heading from the linked shortcut. The title also
    // covers older/OEM layouts, where MessagingStyle ignores setContentTitle.
    val style = NotificationCompat.MessagingStyle(me)
      .setConversationTitle(name)
      .setGroupConversation(groupName != null)
    retained.forEach { entry ->
      val author = if (groupName == null || entry.senderId == data.optString("senderId")) sender else
        Person.Builder().setName(entry.senderName).setKey(entry.senderId)
          .setIcon(IconCompat.createWithBitmap(avatar)).build()
      style.addMessage(entry.text, entry.timestamp, author)
    }
    val shortcut = runCatching {
      publishChatShortcut(data, name, avatar,
        if (groupName != null) Person.Builder().setName(name).setKey(data.optString("conversationId"))
          .setIcon(IconCompat.createWithBitmap(avatar)).build() else sender)
    }.onFailure { error ->
      Log.w("EnveloNotifications", "Could not publish conversation shortcut", error)
    }.getOrNull()
    // Recover Expo's base card to retain its PendingIntent, marshalled response,
    // channels, sounds and permissions. Only its visual style is replaced.
    val base = super.createNotification(notification, behavior)
    val builder = NotificationCompat.Builder(context, base)
      .setStyle(style)
      .setLargeIcon(avatar)
      .setCategory(if (data.optString("type") == "chat_message") NotificationCompat.CATEGORY_MESSAGE else NotificationCompat.CATEGORY_SOCIAL)
      .setContentTitle(name)
      .setContentText(if (groupName != null) "${retained.last().senderName}: ${retained.last().text}" else retained.last().text)
      .setWhen(retained.last().timestamp)
      .setShowWhen(true)
      .setNumber(retained.size)
      .addExtras(Bundle().apply {
        putString(HISTORY, JSONArray(retained.map {
          JSONObject().put("id", it.id).put("text", it.text).put("time", it.timestamp)
            .put("senderName", it.senderName).put("senderId", it.senderId)
        }).toString())
      })
    if (shortcut != null) builder.setShortcutInfo(shortcut)
    val result = builder.build()
    // The user may have opened the app while the avatar was downloading.
    // Foreground alerts are suppressed by the app's existing notification policy.
    if (!ExpoHandlingDelegate(context).isAppInForeground() || behavior != null) {
      NotificationManagerCompat.from(context).notify(tag, 0, result)
    }
  }

  private fun publishChatShortcut(
    data: JSONObject,
    name: String,
    avatar: android.graphics.Bitmap,
    sender: Person
  ): ShortcutInfoCompat? {
    if (data.optString("type") != "chat_message") return null
    val conversationId = data.optString("conversationId").takeIf { it.isNotBlank() } ?: return null
    val recipientId = data.optString("recipientUserId").takeIf { it.isNotBlank() } ?: return null
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    intent.action = Intent.ACTION_VIEW
    intent.data = Uri.Builder().scheme("envelo").authority("chats")
      .appendPath("conversation").appendPath(conversationId).build()
    intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)

    val shortcut = ShortcutInfoCompat.Builder(context, "envelo:$recipientId:chat:$conversationId")
      .setShortLabel(name)
      .setLongLabel(name)
      .setIcon(IconCompat.createWithAdaptiveBitmap(avatar))
      .setIntent(intent)
      .setPerson(sender)
      .setIsConversation()
      .build()
    return shortcut.takeIf { ShortcutManagerCompat.pushDynamicShortcut(context, it) }
  }
}
