import type { MessageStatus, TextMessage } from '@/lib/api/conversations';
import type { PendingMessage } from '@/lib/offline/pendingMessagesStore';

export type LocalMessageStatus = MessageStatus | 'PENDING';

export interface RenderableTextMessage extends Omit<TextMessage, 'status'> {
  content: string | null;
  status: LocalMessageStatus | null;
}

function isRenderableTextMessage(
  message: TextMessage | RenderableTextMessage
): message is RenderableTextMessage {
  return message.content !== null || message.mediaUrl !== null;
}

function compareMessages(
  first: RenderableTextMessage,
  second: RenderableTextMessage
): number {
  const timestampDifference =
    Date.parse(first.createdAt) - Date.parse(second.createdAt);
  return timestampDifference || first.id.localeCompare(second.id);
}

const statusRank: Record<MessageStatus, number> = {
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
};

function newestStatus(
  current: LocalMessageStatus | null,
  incoming: LocalMessageStatus | null
): LocalMessageStatus | null {
  if (!current) return incoming;
  if (!incoming) return current;
  if (current === 'PENDING') return incoming;
  if (incoming === 'PENDING') return current;
  return statusRank[incoming] > statusRank[current] ? incoming : current;
}

export function mergeTextMessages(
  current: RenderableTextMessage[],
  incoming: Array<TextMessage | RenderableTextMessage>
): RenderableTextMessage[] {
  const byId = new Map<string, RenderableTextMessage>();
  const idByClientMessageId = new Map<string, string>();

  for (const message of current) {
    byId.set(message.id, message);
    if (message.clientMessageId) {
      idByClientMessageId.set(message.clientMessageId, message.id);
    }
  }
  for (const message of incoming) {
    if (!isRenderableTextMessage(message)) continue;

    const matchingClientId = message.clientMessageId
      ? idByClientMessageId.get(message.clientMessageId)
      : undefined;
    if (matchingClientId && matchingClientId !== message.id) {
      const matchingMessage = byId.get(matchingClientId);
      if (
        message.status === 'PENDING' &&
        matchingMessage?.status !== 'PENDING'
      ) {
        continue;
      }
      byId.delete(matchingClientId);
    }

    const existing = byId.get(message.id);
    byId.set(
      message.id,
      existing
        ? { ...message, status: newestStatus(existing.status, message.status) }
        : message
    );
    if (message.clientMessageId) {
      idByClientMessageId.set(message.clientMessageId, message.id);
    }
  }

  return [...byId.values()].sort(compareMessages);
}

export function toPendingTextMessage(
  message: PendingMessage
): RenderableTextMessage {
  return {
    id: message.clientMessageId,
    clientMessageId: message.clientMessageId,
    conversationId: message.conversationId,
    senderId: message.senderId,
    content: message.content,
    mediaUrl: null,
    createdAt: message.createdAt,
    status: 'PENDING',
  };
}

export function updateMessageStatus(
  messages: RenderableTextMessage[],
  messageId: string,
  status: MessageStatus
): RenderableTextMessage[] {
  let changed = false;
  const updated = messages.map((message) => {
    if (message.id !== messageId) return message;

    const nextStatus = newestStatus(message.status, status);
    if (nextStatus === message.status) return message;
    changed = true;
    return { ...message, status: nextStatus };
  });

  return changed ? updated : messages;
}
