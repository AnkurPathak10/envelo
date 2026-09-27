import { Expo, type ExpoPushMessage } from "expo-server-sdk";

import { prisma } from "@/lib/prisma";

const expo = new Expo();
const RECEIPT_DELAY_MS = 15 * 60 * 1000;

export async function sendFriendRequestPush(
  requestId: string,
  requesterId: string,
  addresseeId: string,
): Promise<void> {
  try {
    const [requester, registrations] = await Promise.all([
      prisma.user.findUnique({
        where: { id: requesterId },
        select: { displayName: true },
      }),
      prisma.pushToken.findMany({
        where: { userId: addresseeId },
        select: { token: true },
      }),
    ]);
    if (!requester || registrations.length === 0) return;

    const messages: ExpoPushMessage[] = registrations
      .filter(({ token }) => Expo.isExpoPushToken(token))
      .map(({ token }) => ({
        to: token,
        title: "New friend request",
        body: `${requester.displayName} sent you a friend request`,
        data: {
          type: "friend_request",
          recipientUserId: addresseeId,
          requestId,
        },
        channelId: "friend-requests",
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
            console.warn("Friend push ticket failed", ticket.details?.error);
          }
        }
        if (receipts.length > 0) {
          await prisma.pushReceipt.createMany({
            data: receipts,
            skipDuplicates: true,
          });
        }
      } catch {
        console.warn("Friend push send or receipt persistence failed");
      }
    }
  } catch {
    // The friend request is already committed; push is best-effort.
    console.warn("Friend push preparation failed");
  }
}
