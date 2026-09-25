import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_MESSAGES_KEY = 'envelo_pending_messages_v1';

export interface PendingReplyPreview {
  id: string;
  senderId: string;
  senderName: string;
  content: string | null;
  mediaUrl: string | null;
}

interface PendingMessageBase {
  clientMessageId: string;
  conversationId: string;
  senderId: string;
  createdAt: string;
  replyTo: PendingReplyPreview | null;
}

export type PendingMessage = PendingMessageBase &
  (
    | { kind?: 'text'; content: string }
    | {
        kind: 'media';
        content: string | null;
        mediaLocalUri: string;
        mediaFileName: string;
        mediaMimeType: 'image/jpeg';
      }
    | {
        kind: 'remote-media';
        content: null;
        mediaUrl: string;
      }
  );

export function isPendingMediaMessage(
  message: PendingMessage
): message is Extract<PendingMessage, { kind: 'media' }> {
  return message.kind === 'media';
}

export function isPendingRemoteMediaMessage(
  message: PendingMessage
): message is Extract<PendingMessage, { kind: 'remote-media' }> {
  return message.kind === 'remote-media';
}

let storageMutation = Promise.resolve();

function isPendingMessage(value: unknown): value is PendingMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PendingMessage>;
  return (
    typeof candidate.clientMessageId === 'string' &&
    candidate.clientMessageId.length > 0 &&
    candidate.clientMessageId.length <= 100 &&
    typeof candidate.conversationId === 'string' &&
    candidate.conversationId.length > 0 &&
    typeof candidate.senderId === 'string' &&
    candidate.senderId.length > 0 &&
    (candidate.replyTo === undefined ||
      candidate.replyTo === null ||
      (typeof candidate.replyTo === 'object' &&
        typeof candidate.replyTo.id === 'string' &&
        typeof candidate.replyTo.senderId === 'string' &&
        typeof candidate.replyTo.senderName === 'string' &&
        (typeof candidate.replyTo.content === 'string' ||
          candidate.replyTo.content === null) &&
        (typeof candidate.replyTo.mediaUrl === 'string' ||
          candidate.replyTo.mediaUrl === null))) &&
    (candidate.kind === 'media'
      ? (candidate.content === null ||
          (typeof candidate.content === 'string' &&
            candidate.content.length <= 2000)) &&
        typeof candidate.mediaLocalUri === 'string' &&
        candidate.mediaLocalUri.length > 0 &&
        typeof candidate.mediaFileName === 'string' &&
        candidate.mediaFileName.length > 0 &&
        candidate.mediaMimeType === 'image/jpeg'
      : candidate.kind === 'remote-media'
        ? candidate.content === null &&
          typeof candidate.mediaUrl === 'string' &&
          candidate.mediaUrl.startsWith('https://') &&
          candidate.mediaUrl.length <= 2048
        : (candidate.kind === undefined || candidate.kind === 'text') &&
          typeof candidate.content === 'string' &&
          candidate.content.length > 0 &&
          candidate.content.length <= 2000) &&
    typeof candidate.createdAt === 'string' &&
    Number.isFinite(Date.parse(candidate.createdAt))
  );
}

async function readAll(): Promise<PendingMessage[]> {
  const stored = await AsyncStorage.getItem(PENDING_MESSAGES_KEY);
  if (!stored) return [];

  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isPendingMessage) : [];
  } catch {
    return [];
  }
}

async function writeAll(messages: PendingMessage[]): Promise<void> {
  if (messages.length === 0) {
    await AsyncStorage.removeItem(PENDING_MESSAGES_KEY);
    return;
  }
  await AsyncStorage.setItem(PENDING_MESSAGES_KEY, JSON.stringify(messages));
}

function mutateStorage<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageMutation.then(operation, operation);
  storageMutation = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export async function getPendingMessages(
  senderId: string
): Promise<PendingMessage[]> {
  return mutateStorage(async () =>
    (await readAll()).filter((message) => message.senderId === senderId)
  );
}

export function addPendingMessage(message: PendingMessage): Promise<void> {
  return mutateStorage(async () => {
    const messages = await readAll();
    if (
      messages.some(
        (stored) => stored.clientMessageId === message.clientMessageId
      )
    ) {
      return;
    }
    await writeAll([...messages, message]);
  });
}

export function removePendingMessage(
  senderId: string,
  clientMessageId: string
): Promise<void> {
  return mutateStorage(async () => {
    const messages = await readAll();
    const remaining = messages.filter(
      (message) =>
        message.senderId !== senderId ||
        message.clientMessageId !== clientMessageId
    );
    if (remaining.length !== messages.length) await writeAll(remaining);
  });
}

export function removePendingMessagesForConversation(
  senderId: string,
  conversationId: string
): Promise<PendingMessage[]> {
  return mutateStorage(async () => {
    const messages = await readAll();
    const removed = messages.filter(
      (message) =>
        message.senderId === senderId &&
        message.conversationId === conversationId
    );
    await writeAll(
      messages.filter(
        (message) =>
          message.senderId !== senderId ||
          message.conversationId !== conversationId
      )
    );
    return removed;
  });
}

export function createClientMessageId(): string {
  const randomUUID = (
    globalThis.crypto as { randomUUID?: () => string } | undefined
  )?.randomUUID;
  if (randomUUID) return randomUUID.call(globalThis.crypto);

  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
