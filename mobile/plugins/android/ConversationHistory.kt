package com.envelo.notifications

internal data class ConversationMessage(
  val id: String,
  val text: String,
  val timestamp: Long,
  val senderName: String = "",
  val senderId: String = ""
)

internal object ConversationHistory {
  // Android MessagingStyle retains at most 25 messages in a card.
  fun append(history: List<ConversationMessage>, incoming: ConversationMessage): List<ConversationMessage> {
    if (incoming.id.isNotEmpty() && history.any { it.id == incoming.id }) return history
    return (history + incoming).sortedBy { it.timestamp }.takeLast(25)
  }
}
