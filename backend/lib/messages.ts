import { MessageStatusType, type Prisma } from "@prisma/client";

export const MESSAGE_PAGE_SIZE = 50;

export function messageHistorySelect(currentUserId: string) {
  return {
    id: true,
    conversationId: true,
    senderId: true,
    content: true,
    mediaUrl: true,
    replyTo: {
      select: {
        id: true,
        senderId: true,
        content: true,
        mediaUrl: true,
        sender: { select: { displayName: true } },
      },
    },
    createdAt: true,
    statuses: {
      where: { userId: { not: currentUserId } },
      take: 1,
      select: { status: true },
    },
  } satisfies Prisma.MessageSelect;
}

type SelectedHistoryMessage = Prisma.MessageGetPayload<{
  select: ReturnType<typeof messageHistorySelect>;
}>;

export interface MessageHistoryItem {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  mediaUrl: string | null;
  replyTo: {
    id: string;
    senderId: string;
    senderName: string;
    content: string | null;
    mediaUrl: string | null;
  } | null;
  createdAt: string;
  status: MessageStatusType | null;
}

export function toMessageHistoryItem(
  message: SelectedHistoryMessage,
): MessageHistoryItem {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    content: message.content,
    mediaUrl: message.mediaUrl,
    replyTo: message.replyTo
      ? {
          id: message.replyTo.id,
          senderId: message.replyTo.senderId,
          senderName: message.replyTo.sender.displayName,
          content: message.replyTo.content,
          mediaUrl: message.replyTo.mediaUrl,
        }
      : null,
    createdAt: message.createdAt.toISOString(),
    status: message.statuses[0]?.status ?? null,
  };
}
