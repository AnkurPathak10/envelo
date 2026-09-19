import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  ConversationListItem,
  MessageStatus,
} from '@/lib/api/conversations';

const CONVERSATION_CACHE_PREFIX = 'envelo_conversation_list_v1:';

interface ConversationListCacheEntry {
  userId: string;
  conversations: ConversationListItem[];
  cachedAt: string;
}

function cacheKey(userId: string): string {
  return `${CONVERSATION_CACHE_PREFIX}${encodeURIComponent(userId)}`;
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isMessageStatus(value: unknown): value is MessageStatus {
  return value === 'SENT' || value === 'DELIVERED' || value === 'READ';
}

function isConversationListItem(value: unknown): value is ConversationListItem {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ConversationListItem>;
  const participant = candidate.participant;
  const lastMessage = candidate.lastMessage;

  if (
    typeof candidate.id !== 'string' ||
    !isDateString(candidate.createdAt) ||
    !isDateString(candidate.updatedAt) ||
    !participant ||
    typeof participant.id !== 'string' ||
    typeof participant.displayName !== 'string' ||
    typeof participant.email !== 'string' ||
    typeof candidate.unreadCount !== 'number' ||
    !Number.isInteger(candidate.unreadCount) ||
    candidate.unreadCount < 0
  ) {
    return false;
  }

  if (lastMessage === null) return true;
  return (
    !!lastMessage &&
    typeof lastMessage.id === 'string' &&
    typeof lastMessage.senderId === 'string' &&
    (typeof lastMessage.content === 'string' || lastMessage.content === null) &&
    isDateString(lastMessage.createdAt) &&
    (lastMessage.status === null || isMessageStatus(lastMessage.status))
  );
}

function isCacheEntry(
  value: unknown,
  userId: string
): value is ConversationListCacheEntry {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ConversationListCacheEntry>;
  return (
    candidate.userId === userId &&
    isDateString(candidate.cachedAt) &&
    Array.isArray(candidate.conversations) &&
    candidate.conversations.every(isConversationListItem)
  );
}

export async function getCachedConversations(
  userId: string
): Promise<ConversationListItem[] | null> {
  const key = cacheKey(userId);
  const stored = await AsyncStorage.getItem(key);
  if (!stored) return null;

  try {
    const parsed: unknown = JSON.parse(stored);
    if (isCacheEntry(parsed, userId)) return parsed.conversations;
  } catch {
    // Invalid cache entries are discarded below.
  }

  await AsyncStorage.removeItem(key);
  return null;
}

export function saveCachedConversations(
  userId: string,
  conversations: ConversationListItem[]
): Promise<void> {
  const entry: ConversationListCacheEntry = {
    userId,
    conversations,
    cachedAt: new Date().toISOString(),
  };
  return AsyncStorage.setItem(cacheKey(userId), JSON.stringify(entry));
}
