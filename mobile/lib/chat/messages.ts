import type { MessageStatus, TextMessage } from '@/lib/api/conversations';

export interface RenderableTextMessage extends TextMessage {
  content: string;
}

function isRenderableTextMessage(
  message: TextMessage
): message is RenderableTextMessage {
  return message.content !== null;
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
  current: MessageStatus | null,
  incoming: MessageStatus | null
): MessageStatus | null {
  if (!current) return incoming;
  if (!incoming) return current;
  return statusRank[incoming] > statusRank[current] ? incoming : current;
}

export function mergeTextMessages(
  current: RenderableTextMessage[],
  incoming: TextMessage[]
): RenderableTextMessage[] {
  const byId = new Map<string, RenderableTextMessage>();

  for (const message of current) byId.set(message.id, message);
  for (const message of incoming) {
    if (!isRenderableTextMessage(message)) continue;

    const existing = byId.get(message.id);
    byId.set(
      message.id,
      existing
        ? { ...message, status: newestStatus(existing.status, message.status) }
        : message
    );
  }

  return [...byId.values()].sort(compareMessages);
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
