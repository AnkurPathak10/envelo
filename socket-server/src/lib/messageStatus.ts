import { MessageStatusType } from "../generated/prisma";
import { z } from "zod";

import type { EnveloServer, MessageStatusPayload } from "./messages";
import { prisma } from "./prisma";
import { userRoom } from "./rooms";

export const messageDeliveredSchema = z.object({
  messageIds: z.array(z.string().trim().min(1)).min(1).max(100),
});

export const messageReadSchema = z.object({
  conversationId: z.string().trim().min(1),
  upToMessageId: z.string().trim().min(1),
});

export class MessageStatusAuthorizationError extends Error {}

interface ChangedMessageStatus {
  messageId: string;
  senderId: string;
}

export async function markMessagesDelivered(
  userId: string,
  messageIds: string[],
): Promise<ChangedMessageStatus[]> {
  const uniqueMessageIds = [...new Set(messageIds)];

  return prisma.$transaction(async (tx) => {
    const messages = await tx.message.findMany({
      where: { id: { in: uniqueMessageIds } },
      select: {
        id: true,
        senderId: true,
        conversation: {
          select: {
            participants: {
              where: { userId },
              select: { id: true },
            },
          },
        },
      },
    });

    if (
      messages.some((message) => message.conversation.participants.length === 0)
    ) {
      throw new MessageStatusAuthorizationError("Message not found");
    }

    const deliverableIds = messages
      .filter((message) => message.senderId !== userId)
      .map((message) => message.id);

    if (deliverableIds.length === 0) return [];

    const updated = await tx.messageStatus.updateManyAndReturn({
      where: {
        messageId: { in: deliverableIds },
        userId,
        status: MessageStatusType.SENT,
      },
      data: { status: MessageStatusType.DELIVERED },
      select: {
        messageId: true,
        message: { select: { senderId: true } },
      },
    });

    return updated.map((status) => ({
      messageId: status.messageId,
      senderId: status.message.senderId,
    }));
  });
}

export async function markConversationRead(
  userId: string,
  conversationId: string,
  upToMessageId: string,
): Promise<ChangedMessageStatus[]> {
  return prisma.$transaction(async (tx) => {
    const participation = await tx.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { id: true },
    });
    if (!participation) {
      throw new MessageStatusAuthorizationError("Conversation not found");
    }

    const boundaryMessage = await tx.message.findFirst({
      where: { id: upToMessageId, conversationId },
      select: { createdAt: true },
    });
    if (!boundaryMessage) {
      throw new MessageStatusAuthorizationError("Message not found");
    }

    const updated = await tx.messageStatus.updateManyAndReturn({
      where: {
        userId,
        status: { in: [MessageStatusType.SENT, MessageStatusType.DELIVERED] },
        message: {
          conversationId,
          senderId: { not: userId },
          createdAt: { lte: boundaryMessage.createdAt },
        },
      },
      data: { status: MessageStatusType.READ },
      select: {
        messageId: true,
        message: { select: { senderId: true } },
      },
    });

    return updated.map((status) => ({
      messageId: status.messageId,
      senderId: status.message.senderId,
    }));
  });
}

export function broadcastMessageStatuses(
  io: EnveloServer,
  changedStatuses: ChangedMessageStatus[],
  status: MessageStatusPayload["status"],
): void {
  for (const changedStatus of changedStatuses) {
    io.to(userRoom(changedStatus.senderId)).emit("message:status", {
      messageId: changedStatus.messageId,
      status,
    });
  }
}
