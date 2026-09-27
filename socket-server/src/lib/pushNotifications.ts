import { Expo, type ExpoPushMessage } from "expo-server-sdk";

import type { TextMessagePayload } from "./messages";
import { prisma } from "./prisma";

const expo = new Expo();
const RECEIPT_DELAY_MS = 15 * 60 * 1000;

function preview(message: TextMessagePayload): string {
  const content = message.content?.replace(/\s+/g, " ").trim();
  if (content) return content.slice(0, 140);
  if (message.audioDurationMs !== null) return "Voice message";
  return "Photo or GIF";
}

export async function sendMessagePush(
  senderId: string,
  recipientIds: string[],
  message: TextMessagePayload,
): Promise<void> {
  if (recipientIds.length === 0) return;
  try {
    const [sender, registrations] = await Promise.all([
      prisma.user.findUnique({
        where: { id: senderId },
        select: { displayName: true },
      }),
      prisma.pushToken.findMany({
        where: { userId: { in: recipientIds } },
        select: { token: true, userId: true },
      }),
    ]);
    if (!sender || registrations.length === 0) return;

    const messages: ExpoPushMessage[] = registrations
      .filter(({ token }) => Expo.isExpoPushToken(token))
      .map(({ token, userId }) => ({
        to: token,
        title: sender.displayName,
        body: preview(message),
        data: {
          type: "chat_message",
          recipientUserId: userId,
          conversationId: message.conversationId,
          messageId: message.id,
        },
        channelId: "messages",
        sound: "default",
      }));

    for (const chunk of expo.chunkPushNotifications(messages)) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        const receipts: { id: string; token: string; checkAfter: Date }[] = [];
        for (const [index, ticket] of tickets.entries()) {
          if (ticket.status === "ok") {
            receipts.push({
              id: ticket.id,
              token: chunk[index].to as string,
              checkAfter: new Date(Date.now() + RECEIPT_DELAY_MS),
            });
            continue;
          }
          if (ticket.details?.error === "DeviceNotRegistered") {
            await prisma.pushToken.deleteMany({
              where: { token: chunk[index].to as string },
            });
          } else {
            console.warn("Message push ticket failed", ticket.details?.error);
          }
        }
        if (receipts.length > 0) {
          await prisma.pushReceipt.createMany({
            data: receipts,
            skipDuplicates: true,
          });
        }
      } catch {
        console.warn("Message push send or receipt persistence failed");
      }
    }
  } catch {
    // Message persistence and socket acknowledgement must not depend on push.
    console.warn("Message push preparation failed");
  }
}
