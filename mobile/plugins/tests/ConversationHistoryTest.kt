package com.envelo.notifications

fun main() {
  var history = emptyList<ConversationMessage>()
  val texts = listOf("Hi", "\uD83D\uDE1B", "How are you?", "Fourth", "Fifth")
  texts.forEachIndexed { index, text ->
    history = ConversationHistory.append(history, ConversationMessage("m$index", text, index.toLong()))
  }
  check(history.map { it.text } == texts) { "Five pushes must retain five messages in one history" }
  check(ConversationHistory.append(history, history[1]) === history) { "Duplicate delivery must not add or alert again" }
  val outOfOrder = ConversationHistory.append(history, ConversationMessage("early", "First", -1))
  check(outOfOrder.first().id == "early") { "Delayed messages must sort by send time" }
  repeat(30) { history = ConversationHistory.append(history, ConversationMessage("new$it", "$it", 100L + it)) }
  check(history.size == 25 && history.first().id == "new5" && history.last().id == "new29")
  val afterDismiss = ConversationHistory.append(emptyList(), ConversationMessage("fresh", "New", 500))
  check(afterDismiss.size == 1) { "Dismissed notification must not resurrect its old history" }
  val group = ConversationHistory.append(
    listOf(ConversationMessage("g1", "First", 1, "Ankur", "ankur", "https://example.com/ankur.jpg")),
    ConversationMessage("g2", "Second", 2, "Ravi", "ravi", "https://example.com/ravi.jpg")
  )
  check(group.map { it.senderName } == listOf("Ankur", "Ravi")) {
    "Group history must retain the author of each message"
  }
  check(group.map { it.senderAvatarUrl } == listOf("https://example.com/ankur.jpg", "https://example.com/ravi.jpg")) {
    "Group message history must retain each author's own avatar, not the group photo"
  }
  println("Conversation history: five-message grouping, emoji, deduplication, ordering, cap and dismissal passed")
}
