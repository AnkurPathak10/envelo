import { Expo, type ExpoPushMessage } from "expo-server-sdk";

import type { TextMessagePayload } from "./messages";
import type { CallUser } from "./callBackend";
import { prisma } from "./prisma";

const expo = new Expo();
const RECEIPT_DELAY_MS = 15 * 60 * 1000;

export async function sendCallPush(caller: CallUser, recipientId: string,
  callId: string, conversationId: string, expiresAt: string): Promise<void> {
  try {
    const registrations = await prisma.pushToken.findMany({ where: { userId: recipientId }, select: { token: true } });
    const secondsLeft = Math.floor((Date.parse(expiresAt) - Date.now()) / 1000);
    if (secondsLeft <= 0) return;
    const messages: ExpoPushMessage[] = registrations.filter(r => Expo.isExpoPushToken(r.token)).map(r => ({
      to: r.token, title: caller.displayName, body: "Incoming call", sound: "default",
      channelId: "messages", priority: "high", ttl: secondsLeft,
      data: { type: "incoming_call", callId, conversationId, recipientUserId: recipientId,
        callerId: caller.id, callerName: caller.displayName, callerAvatarUrl: caller.avatarUrl, expiresAt },
    }));
    for (const chunk of expo.chunkPushNotifications(messages)) {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      for (const [index, ticket] of tickets.entries()) {
        const token = chunk[index].to as string;
        if (ticket.status === "ok") await prisma.pushReceipt.create({ data: {
          id: ticket.id, token, checkAfter: new Date(Date.now() + RECEIPT_DELAY_MS),
        } });
        else if (ticket.details?.error === "DeviceNotRegistered")
          await prisma.pushToken.deleteMany({ where: { token } });
      }
    }
  } catch { console.warn("Incoming call push failed; ringing continues via sockets"); }
}

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
    const [sender, registrations, conversation] = await Promise.all([
      prisma.user.findUnique({
        where: { id: senderId },
        select: { displayName: true, avatarUrl: true },
      }),
      prisma.pushToken.findMany({
        where: { userId: { in: recipientIds } },
        select: { token: true, userId: true },
      }),
      prisma.conversation.findUnique({
        where: { id: message.conversationId },
        select: { type: true, name: true, photoUrl: true },
      }),
    ]);
    if (!sender || registrations.length === 0) return;
    const parsedSentAt = Date.parse(message.createdAt);
    const sentAt = Number.isFinite(parsedSentAt) ? parsedSentAt : Date.now();
    const group = conversation?.type === "GROUP" ? conversation : null;
    const messageText = preview(message);

    const messages: ExpoPushMessage[] = registrations
      .filter(({ token }) => Expo.isExpoPushToken(token))
      .map(({ token, userId }) => ({
        to: token,
        title: group?.name ?? sender.displayName,
        body: group ? `${sender.displayName}: ${messageText}` : messageText,
        // richContent.image becomes an expanded photo attachment on Android,
        // not the small circular sender avatar used by conversation notifications.
        data: {
          notificationStyle: "conversation-v1",
          type: "chat_message",
          senderId,
          senderName: sender.displayName,
          senderAvatarUrl: sender.avatarUrl,
          ...(group
            ? { groupName: group.name, groupPhotoUrl: group.photoUrl }
            : {}),
          messageText,
          sentAt,
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
