import { MessageStatusType } from "../generated/prisma";

import {
  messageSendSchema,
  textMessageSelect,
  toTextMessagePayload,
  type EnveloServer,
  type EnveloSocket,
  type MessageSendAcknowledgement,
} from "../lib/messages";
import { prisma } from "../lib/prisma";
import { userRoom } from "../lib/rooms";

export function registerMessageHandlers(
  io: EnveloServer,
  socket: EnveloSocket,
): void {
  socket.on("message:send", async (payload, acknowledge) => {
    const senderId = socket.data.userId;
    const parsed = messageSendSchema.safeParse(payload);

    if (!parsed.success) {
      console.warn(
        `message:send validation failure, socket: ${socket.id}, user: ${senderId}`,
      );
      acknowledge?.({ ok: false, error: "Invalid message" });
      return;
    }

    try {
      const transactionResult = await prisma.$transaction(async (tx) => {
        const senderParticipant = await tx.conversationParticipant.findUnique({
          where: {
            conversationId_userId: {
              conversationId: parsed.data.conversationId,
              userId: senderId,
            },
          },
          select: {
            conversation: {
              select: {
                participants: { select: { userId: true } },
              },
            },
          },
        });

        if (!senderParticipant) return null;

        const recipientIds = senderParticipant.conversation.participants
          .map((participant) => participant.userId)
          .filter((userId) => userId !== senderId);

        const message = await tx.message.create({
          data: {
            conversationId: parsed.data.conversationId,
            senderId,
            content: parsed.data.content,
            mediaUrl: null,
          },
          select: textMessageSelect,
        });

        if (recipientIds.length > 0) {
          await tx.messageStatus.createMany({
            data: recipientIds.map((userId) => ({
              messageId: message.id,
              userId,
              status: MessageStatusType.SENT,
            })),
          });
        }

        await tx.conversation.update({
          where: { id: parsed.data.conversationId },
          data: { updatedAt: new Date() },
          select: { id: true },
        });

        return { message, recipientIds };
      });

      if (!transactionResult) {
        console.warn(
          `message:send authorization failure, socket: ${socket.id}, user: ${senderId}`,
        );
        acknowledge?.({ ok: false, error: "Conversation not found" });
        return;
      }

      const message = toTextMessagePayload(transactionResult.message);
      const rooms = [
        userRoom(senderId),
        ...transactionResult.recipientIds.map(userRoom),
      ];

      io.to(rooms).emit("message:new", message);
      acknowledge?.({ ok: true, message });
    } catch (error: unknown) {
      console.error(
        `message:send persistence failure, socket: ${socket.id}, user: ${senderId}`,
      );
      const result: MessageSendAcknowledgement = {
        ok: false,
        error: "Unable to send message",
      };
      acknowledge?.(result);
    }
  });
}
