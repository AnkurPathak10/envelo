import type { TextMessage } from '@/lib/api/conversations';

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

export function mergeTextMessages(
  current: RenderableTextMessage[],
  incoming: TextMessage[]
): RenderableTextMessage[] {
  const byId = new Map<string, RenderableTextMessage>();

  for (const message of current) byId.set(message.id, message);
  for (const message of incoming) {
    if (isRenderableTextMessage(message)) byId.set(message.id, message);
  }

  return [...byId.values()].sort(compareMessages);
}
