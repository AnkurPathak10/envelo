import {
  broadcastMessageStatuses,
  markMessagesDelivered,
  messageDeliveredSchema,
  MessageStatusAuthorizationError,
} from "../lib/messageStatus";
import type { EnveloServer, EnveloSocket } from "../lib/messages";

export function registerMessageDeliveredHandler(
  io: EnveloServer,
  socket: EnveloSocket,
): void {
  socket.on("message:delivered", async (payload, acknowledge) => {
    const userId = socket.data.userId;
    const parsed = messageDeliveredSchema.safeParse(payload);
    if (!parsed.success) {
      acknowledge?.({ success: false, error: "Invalid delivered message" });
      return;
    }

    try {
      const changedStatuses = await markMessagesDelivered(
        userId,
        parsed.data.messageIds,
      );
      broadcastMessageStatuses(io, changedStatuses, "DELIVERED");
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
