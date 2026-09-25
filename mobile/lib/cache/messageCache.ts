import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  MessageHistoryPage,
  MessageStatus,
  TextMessage,
} from '@/lib/api/conversations';
import { mergeTextMessages } from '@/lib/chat/messages';

const MESSAGE_CACHE_PREFIX = 'envelo_message_history_v1:';
const MESSAGE_CACHE_INDEX_PREFIX = 'envelo_message_history_index_v1:';
const MAX_CACHED_CONVERSATIONS = 20;
const MAX_CACHED_MESSAGES = 100;

interface MessageCacheEntry extends MessageHistoryPage {
  userId: string;
  conversationId: string;
  cachedAt: string;
}

interface MessageCacheIndexEntry {
  conversationId: string;
  lastOpenedAt: string;
}

let storageMutation = Promise.resolve();

function mutateStorage<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageMutation.then(operation, operation);
  storageMutation = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function userKeyPart(userId: string): string {
  return encodeURIComponent(userId);
}

function messageKeyPrefix(userId: string): string {
  return `${MESSAGE_CACHE_PREFIX}${userKeyPart(userId)}:`;
}

function messageKey(userId: string, conversationId: string): string {
  return `${messageKeyPrefix(userId)}${encodeURIComponent(conversationId)}`;
}

function indexKey(userId: string): string {
  return `${MESSAGE_CACHE_INDEX_PREFIX}${userKeyPart(userId)}`;
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isMessageStatus(value: unknown): value is MessageStatus {
  return value === 'SENT' || value === 'DELIVERED' || value === 'READ';
}

function isReplyPreview(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (!value || typeof value !== 'object') return false;
  const reply = value as Partial<NonNullable<TextMessage['replyTo']>>;
  return (
    typeof reply.id === 'string' &&
    typeof reply.senderId === 'string' &&
    typeof reply.senderName === 'string' &&
    (typeof reply.content === 'string' || reply.content === null) &&
    (typeof reply.mediaUrl === 'string' || reply.mediaUrl === null)
  );
}

function isTextMessage(value: unknown): value is TextMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TextMessage>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.conversationId === 'string' &&
    typeof candidate.senderId === 'string' &&
    (typeof candidate.content === 'string' || candidate.content === null) &&
    (candidate.mediaUrl === undefined ||
      candidate.mediaUrl === null ||
      typeof candidate.mediaUrl === 'string') &&
    isReplyPreview(candidate.replyTo) &&
    isDateString(candidate.createdAt) &&
    (candidate.status === null || isMessageStatus(candidate.status)) &&
    (candidate.clientMessageId === undefined ||
      candidate.clientMessageId === null ||
      typeof candidate.clientMessageId === 'string')
  );
}

function isMessageCacheEntry(
  value: unknown,
  userId: string,
  conversationId: string
): value is MessageCacheEntry {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MessageCacheEntry>;
  return (
    candidate.userId === userId &&
    candidate.conversationId === conversationId &&
    isDateString(candidate.cachedAt) &&
    (candidate.clearedAt === null || isDateString(candidate.clearedAt)) &&
    (candidate.nextCursor === null ||
      typeof candidate.nextCursor === 'string') &&
    Array.isArray(candidate.messages) &&
    candidate.messages.length <= MAX_CACHED_MESSAGES &&
    candidate.messages.every(
      (message) =>
        isTextMessage(message) && message.conversationId === conversationId
    )
  );
}

function isIndexEntry(value: unknown): value is MessageCacheIndexEntry {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MessageCacheIndexEntry>;
  return (
    typeof candidate.conversationId === 'string' &&
    isDateString(candidate.lastOpenedAt)
  );
}

async function readIndex(userId: string): Promise<MessageCacheIndexEntry[]> {
  const stored = await AsyncStorage.getItem(indexKey(userId));
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isIndexEntry) : [];
  } catch {
    return [];
  }
}

async function writeIndex(
  userId: string,
  entries: MessageCacheIndexEntry[]
): Promise<void> {
  if (entries.length === 0) {
    await AsyncStorage.removeItem(indexKey(userId));
    return;
  }
  await AsyncStorage.setItem(indexKey(userId), JSON.stringify(entries));
}

async function touchConversation(
  userId: string,
  conversationId: string
): Promise<void> {
  const current = await readIndex(userId);
  const next = [
    { conversationId, lastOpenedAt: new Date().toISOString() },
    ...current.filter((entry) => entry.conversationId !== conversationId),
  ];
  const evicted = next.slice(MAX_CACHED_CONVERSATIONS);
  await Promise.all(
    evicted.map((entry) =>
      AsyncStorage.removeItem(messageKey(userId, entry.conversationId))
    )
  );
  await writeIndex(userId, next.slice(0, MAX_CACHED_CONVERSATIONS));
}

async function readEntry(
  userId: string,
  conversationId: string
): Promise<MessageCacheEntry | null> {
  const key = messageKey(userId, conversationId);
  const stored = await AsyncStorage.getItem(key);
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (isMessageCacheEntry(parsed, userId, conversationId)) return parsed;
  } catch {
    // Invalid cache entries are discarded below.
  }
  await AsyncStorage.removeItem(key);
  return null;
}

export function getCachedMessageHistory(
  userId: string,
  conversationId: string
): Promise<MessageHistoryPage | null> {
  return mutateStorage(async () => {
    const entry = await readEntry(userId, conversationId);
    if (!entry) return null;
    await touchConversation(userId, conversationId);
    return {
      clearedAt: entry.clearedAt,
      messages: entry.messages,
      nextCursor: entry.nextCursor,
    };
  });
}

export function cacheMessageHistoryPage(
  userId: string,
  conversationId: string,
  page: MessageHistoryPage,
  cursor?: string
): Promise<void> {
  return mutateStorage(async () => {
    const existing = await readEntry(userId, conversationId);
    const hasSameCutoff = existing?.clearedAt === page.clearedAt;
    const existingMessages = mergeTextMessages(
      [],
      hasSameCutoff ? (existing?.messages ?? []) : []
    );
    const merged =
      !cursor && page.nextCursor === null
        ? mergeTextMessages([], page.messages)
        : mergeTextMessages(existingMessages, page.messages);
    const messages: TextMessage[] = merged
      .slice(-MAX_CACHED_MESSAGES)
      .map((message) => ({
        ...message,
        status: message.status === 'PENDING' ? null : message.status,
      }));
    const discardedMessages = merged.length > messages.length;
    const existingCoversInitialRemainder =
      !cursor &&
      page.nextCursor !== null &&
      existing?.nextCursor === null &&
      hasSameCutoff &&
      existing.messages.some((message) => message.id === page.nextCursor);
    const hasEarlierMessages =
      discardedMessages ||
      (page.nextCursor !== null && !existingCoversInitialRemainder);
    const nextCursor =
      hasEarlierMessages && messages.length > 0 ? messages[0].id : null;
    const entry: MessageCacheEntry = {
      userId,
      conversationId,
      clearedAt: page.clearedAt,
      messages,
      nextCursor,
      cachedAt: new Date().toISOString(),
    };

    await AsyncStorage.setItem(
      messageKey(userId, conversationId),
      JSON.stringify(entry)
    );
    await touchConversation(userId, conversationId);
  });
}

export function removeCachedMessageHistory(
  userId: string,
  conversationId: string
): Promise<void> {
  return mutateStorage(async () => {
    await AsyncStorage.removeItem(messageKey(userId, conversationId));
    const index = await readIndex(userId);
    await writeIndex(
      userId,
      index.filter((entry) => entry.conversationId !== conversationId)
    );
  });
}

export function retainCachedMessageHistories(
  userId: string,
  conversationIds: string[]
): Promise<void> {
  return mutateStorage(async () => {
    const allowed = new Set(conversationIds);
    const prefix = messageKeyPrefix(userId);
    const storedKeys = (await AsyncStorage.getAllKeys()).filter((key) =>
      key.startsWith(prefix)
    );
    const keyByConversationId = new Map<string, string>();
    const malformedKeys: string[] = [];
    for (const key of storedKeys) {
      try {
        const conversationId = decodeURIComponent(key.slice(prefix.length));
        if (!conversationId) {
          malformedKeys.push(key);
          continue;
        }
        keyByConversationId.set(conversationId, key);
      } catch {
        malformedKeys.push(key);
      }
    }

    const unauthorizedKeys = [...keyByConversationId]
      .filter(([conversationId]) => !allowed.has(conversationId))
      .map(([, key]) => key);
    await Promise.all(
      [...malformedKeys, ...unauthorizedKeys].map((key) =>
        AsyncStorage.removeItem(key)
      )
    );

    const index = await readIndex(userId);
    const normalizedIndex: MessageCacheIndexEntry[] = [];
    const indexedConversationIds = new Set<string>();
    for (const entry of index) {
      if (
        allowed.has(entry.conversationId) &&
        keyByConversationId.has(entry.conversationId) &&
        !indexedConversationIds.has(entry.conversationId)
      ) {
        normalizedIndex.push(entry);
        indexedConversationIds.add(entry.conversationId);
      }
    }
    for (const conversationId of keyByConversationId.keys()) {
      if (
        allowed.has(conversationId) &&
        !indexedConversationIds.has(conversationId)
      ) {
        normalizedIndex.push({
          conversationId,
          lastOpenedAt: new Date(0).toISOString(),
        });
      }
    }

    const evicted = normalizedIndex.slice(MAX_CACHED_CONVERSATIONS);
    await Promise.all(
      evicted.map((entry) =>
        AsyncStorage.removeItem(messageKey(userId, entry.conversationId))
      )
    );
    await writeIndex(
      userId,
      normalizedIndex.slice(0, MAX_CACHED_CONVERSATIONS)
    );
  });
}
