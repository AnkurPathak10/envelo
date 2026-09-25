import { MessageStatusType, Prisma } from "../generated/prisma";

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

async function findExistingClientMessage(
  senderId: string,
  clientMessageId: string,
) {
  return prisma.message.findUnique({
    where: {
      senderId_clientMessageId: { senderId, clientMessageId },
    },
    select: textMessageSelect,
  });
}

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

    const { clientMessageId } = parsed.data;
    try {
      if (clientMessageId) {
        const existingMessage = await findExistingClientMessage(
          senderId,
          clientMessageId,
        );
        if (existingMessage) {
          acknowledge?.({
            ok: true,
            message: toTextMessagePayload(existingMessage),
          });
          return;
        }
      }

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

        if (parsed.data.replyToId) {
          const replyTarget = await tx.message.findFirst({
            where: {
              id: parsed.data.replyToId,
              conversationId: parsed.data.conversationId,
            },
            select: { id: true },
          });
          if (!replyTarget) return { invalidReply: true };
        }

        const recipientIds = senderParticipant.conversation.participants
          .map((participant) => participant.userId)
          .filter((userId) => userId !== senderId);

        const message = await tx.message.create({
          data: {
            conversationId: parsed.data.conversationId,
            senderId,
            content: parsed.data.content,
            clientMessageId: clientMessageId ?? null,
            mediaUrl: parsed.data.mediaUrl ?? null,
            replyToId: parsed.data.replyToId ?? null,
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

      if (!transactionResult || "invalidReply" in transactionResult) {
        console.warn(
          `message:send authorization failure, socket: ${socket.id}, user: ${senderId}`,
        );
        acknowledge?.({
          ok: false,
          error:
            transactionResult && "invalidReply" in transactionResult
              ? "Reply target is unavailable"
              : "Conversation not found",
        });
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
      if (
        clientMessageId &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existingMessage = await findExistingClientMessage(
          senderId,
          clientMessageId,
        );
        if (existingMessage) {
          acknowledge?.({
            ok: true,
            message: toTextMessagePayload(existingMessage),
          });
          return;
        }
      }

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
