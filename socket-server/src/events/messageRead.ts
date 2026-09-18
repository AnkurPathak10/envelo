import {
  broadcastMessageStatuses,
  markConversationRead,
  messageReadSchema,
  MessageStatusAuthorizationError,
} from "../lib/messageStatus";
import type { EnveloServer, EnveloSocket } from "../lib/messages";

export function registerMessageReadHandler(
  io: EnveloServer,
  socket: EnveloSocket,
): void {
  socket.on("message:read", async (payload, acknowledge) => {
    const userId = socket.data.userId;
    const parsed = messageReadSchema.safeParse(payload);
    if (!parsed.success) {
      acknowledge?.({ success: false, error: "Invalid read request" });
      return;
    }

    try {
      const changedStatuses = await markConversationRead(
        userId,
        parsed.data.conversationId,
        parsed.data.upToMessageId,
      );
      broadcastMessageStatuses(io, changedStatuses, "READ");
      acknowledge?.({ success: true, updated: changedStatuses.length });
    } catch (error: unknown) {
      const message =
        error instanceof MessageStatusAuthorizationError
          ? error.message
          : "Unable to update message status";
      acknowledge?.({ success: false, error: message });
    }
  });
}
