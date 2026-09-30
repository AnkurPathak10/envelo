import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  ConversationListItem,
  ConversationParticipant,
  MessageStatus,
} from '@/lib/api/conversations';

const CONVERSATION_CACHE_PREFIX = 'envelo_conversation_list_v1:';
let cacheMutation = Promise.resolve();

type LegacyDirectConversation = Omit<
  Extract<ConversationListItem, { type: 'DIRECT' }>,
  'type'
> & { type?: undefined };

type StoredConversation = ConversationListItem | LegacyDirectConversation;

interface ConversationListCacheEntry {
  userId: string;
  conversations: StoredConversation[];
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

function isConversationListItem(value: unknown): value is StoredConversation {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ConversationListItem> & {
    participant?: Partial<ConversationParticipant>;
  };
  const lastMessage = candidate.lastMessage;
  const validIdentity =
    candidate.type === 'GROUP'
      ? typeof candidate.name === 'string' &&
        (candidate.photoUrl === null || typeof candidate.photoUrl === 'string')
      : (candidate.type === 'DIRECT' || candidate.type === undefined) &&
        !!candidate.participant &&
        typeof candidate.participant.id === 'string' &&
        typeof candidate.participant.displayName === 'string' &&
        typeof candidate.participant.email === 'string' &&
        (candidate.participant.avatarUrl === undefined ||
          candidate.participant.avatarUrl === null ||
          typeof candidate.participant.avatarUrl === 'string');

  if (
    typeof candidate.id !== 'string' ||
    !isDateString(candidate.createdAt) ||
    !isDateString(candidate.updatedAt) ||
    !(candidate.clearedAt === null || isDateString(candidate.clearedAt)) ||
    !validIdentity ||
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
    (lastMessage.mediaUrl === undefined ||
      lastMessage.mediaUrl === null ||
      typeof lastMessage.mediaUrl === 'string') &&
    (lastMessage.audioDurationMs === undefined ||
      lastMessage.audioDurationMs === null ||
      (typeof lastMessage.audioDurationMs === 'number' &&
        Number.isInteger(lastMessage.audioDurationMs))) &&
    isDateString(lastMessage.createdAt) &&
    (lastMessage.preview === undefined ||
      typeof lastMessage.preview === 'string') &&
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
    if (isCacheEntry(parsed, userId)) {
      return parsed.conversations.map((item) =>
        item.type === undefined ? { ...item, type: 'DIRECT' as const } : item
      );
    }
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
  cacheMutation = cacheMutation
    .catch(() => undefined)
    .then(() => AsyncStorage.setItem(cacheKey(userId), JSON.stringify(entry)));
  return cacheMutation;
}
