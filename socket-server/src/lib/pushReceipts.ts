import { Expo } from "expo-server-sdk";

import { prisma } from "./prisma";

const expo = new Expo();
const POLL_INTERVAL_MS = 60_000;
const RETRY_DELAY_MS = 5 * 60_000;
const RECEIPT_LIFETIME_MS = 24 * 60 * 60_000;
let running = false;

async function processDueReceipts(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const expired = await prisma.pushReceipt.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - RECEIPT_LIFETIME_MS) } },
    });
    if (expired.count > 0) {
      console.warn(`${expired.count} Expo push receipts expired before confirmation`);
    }

    const due = await prisma.pushReceipt.findMany({
      where: { checkAfter: { lte: new Date() } },
      orderBy: { checkAfter: "asc" },
      take: 100,
    });
    if (due.length === 0) return;

    for (const chunk of expo.chunkPushNotificationReceiptIds(
      due.map(({ id }) => id),
    )) {
      const retryAt = new Date(Date.now() + RETRY_DELAY_MS);
      let received;
      try {
        received = await expo.getPushNotificationReceiptsAsync(chunk);
      } catch (error) {
        console.warn("Unable to fetch Expo push receipts", error);
        await prisma.pushReceipt.updateMany({
          where: { id: { in: chunk } },
          data: { checkAfter: retryAt, attempts: { increment: 1 } },
        });
        continue;
      }

      for (const id of chunk) {
        const stored = due.find((entry) => entry.id === id);
        if (!stored) continue;
        const receipt = received[id];
        if (!receipt) {
          await prisma.pushReceipt.update({
            where: { id },
            data: { checkAfter: retryAt, attempts: { increment: 1 } },
          });
          continue;
        }
        if (receipt.status === "error") {
          if (receipt.details?.error === "DeviceNotRegistered") {
            await prisma.pushToken.deleteMany({
              where: { token: stored.token },
            });
          } else {
            console.warn("Expo push receipt failed", receipt.details?.error);
          }
        }
        await prisma.pushReceipt.delete({ where: { id } });
      }
    }
  } finally {
    running = false;
  }
}

export function startPushReceiptWorker(): void {
  const run = (): void => {
    void processDueReceipts().catch((error) => {
      console.warn("Push receipt processing failed", error);
    });
  };
  run();
  setInterval(run, POLL_INTERVAL_MS).unref();
}
