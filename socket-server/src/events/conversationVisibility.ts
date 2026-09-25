import { z } from "zod";

import type { EnveloServer, EnveloSocket } from "../lib/messages";
import { prisma } from "../lib/prisma";
import { userRoom } from "../lib/rooms";

const conversationVisibilitySchema = z.object({
  conversationId: z.string().trim().min(1),
});

export function registerConversationVisibilityHandler(
  _io: EnveloServer,
  socket: EnveloSocket,
): void {
  const emitVisibility = (visibility: {
    conversationId: string;
    clearedAt: string | null;
    deletedAt: string | null;
  }): void => {
    socket
      .to(userRoom(socket.data.userId))
      .emit("conversation:visibility", visibility);
  };

  socket.on("conversation:visibility:sync", async (payload, acknowledge) => {
    const parsed = conversationVisibilitySchema.safeParse(payload);
    if (!parsed.success) {
      acknowledge?.({ success: false, error: "Invalid conversation" });
      return;
    }

    try {
      const participation = await prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId: parsed.data.conversationId,
            userId: socket.data.userId,
          },
        },
        select: { conversationId: true, clearedAt: true, deletedAt: true },
      });
      if (!participation) {
        acknowledge?.({ success: false, error: "Conversation not found" });
        return;
      }

      const visibility = {
        conversationId: participation.conversationId,
        clearedAt: participation.clearedAt?.toISOString() ?? null,
        deletedAt: participation.deletedAt?.toISOString() ?? null,
      };
      emitVisibility(visibility);
      acknowledge?.({ success: true, visibility });
    } catch {
      acknowledge?.({
        success: false,
        error: "Unable to synchronize conversation",
      });
    }
  });

  socket.on("conversation:visibility:clear", async (payload, acknowledge) => {
    const parsed = conversationVisibilitySchema.safeParse(payload);
    if (!parsed.success) {
      acknowledge?.({ success: false, error: "Invalid conversation" });
      return;
    }

    try {
      const clearedAt = new Date();
      const participation = await prisma.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId: parsed.data.conversationId,
            userId: socket.data.userId,
          },
        },
        data: { clearedAt, deletedAt: null },
        select: { conversationId: true, clearedAt: true, deletedAt: true },
      });
      const visibility = {
        conversationId: participation.conversationId,
        clearedAt: participation.clearedAt?.toISOString() ?? null,
        deletedAt: participation.deletedAt?.toISOString() ?? null,
      };
      emitVisibility(visibility);
      acknowledge?.({ success: true, visibility });
    } catch {
      acknowledge?.({ success: false, error: "Unable to clear conversation" });
    }
  });

  socket.on("conversation:visibility:delete", async (payload, acknowledge) => {
    const parsed = conversationVisibilitySchema.safeParse(payload);
    if (!parsed.success) {
      acknowledge?.({ success: false, error: "Invalid conversation" });
      return;
    }

    try {
      const deletedAt = new Date();
      const participation = await prisma.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId: parsed.data.conversationId,
            userId: socket.data.userId,
          },
        },
        data: { clearedAt: deletedAt, deletedAt },
        select: { conversationId: true, clearedAt: true, deletedAt: true },
      });
      const visibility = {
        conversationId: participation.conversationId,
        clearedAt: participation.clearedAt?.toISOString() ?? null,
        deletedAt: participation.deletedAt?.toISOString() ?? null,
      };
      emitVisibility(visibility);
      acknowledge?.({ success: true, visibility });
    } catch {
      acknowledge?.({ success: false, error: "Unable to delete conversation" });
    }
  });
}
