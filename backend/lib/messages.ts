import { type Prisma } from "@prisma/client";

export const MESSAGE_PAGE_SIZE = 50;

export const messageHistorySelect = {
  id: true,
  conversationId: true,
  senderId: true,
  content: true,
  createdAt: true,
} satisfies Prisma.MessageSelect;

export type MessageHistoryItem = Prisma.MessageGetPayload<{
  select: typeof messageHistorySelect;
}>;

export function toMessageHistoryItem(
  message: MessageHistoryItem,
): MessageHistoryItem {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    content: message.content,
    createdAt: message.createdAt,
  };
}
