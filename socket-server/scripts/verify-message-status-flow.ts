import "dotenv/config";

import { randomUUID } from "node:crypto";

import jwt from "jsonwebtoken";
import { io, type Socket } from "socket.io-client";

import { MessageStatusType, PrismaClient } from "../src/generated/prisma";
import type {
  ClientToServerEvents,
  MessageSendAcknowledgement,
  MessageStatusAcknowledgement,
  MessageStatusPayload,
  ServerToClientEvents,
} from "../src/lib/messages";

type VerificationSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SOCKET_URL = process.env.TEST_SOCKET_URL ?? "http://localhost:4000";
const API_URL = process.env.TEST_API_URL ?? "http://localhost:3000";
const ACK_TIMEOUT_MS = 10_000;

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set.`);
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function accessToken(userId: string, secret: string): string {
  return jwt.sign({ sub: userId }, secret, { expiresIn: "15m" });
}

function connectSocket(token: string): Promise<VerificationSocket> {
  return new Promise((resolve, reject) => {
    const socket: VerificationSocket = io(SOCKET_URL, {
      auth: { token },
      reconnection: false,
    });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", (error) => {
      socket.disconnect();
      reject(error);
    });
  });
}

function sendMessage(
  socket: VerificationSocket,
  conversationId: string,
  content: string,
): Promise<MessageSendAcknowledgement> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for message:send.")),
      ACK_TIMEOUT_MS,
    );
    socket.emit(
      "message:send",
      { conversationId, content },
      (acknowledgement) => {
        clearTimeout(timeout);
        resolve(acknowledgement);
      },
    );
  });
}

function markDelivered(
  socket: VerificationSocket,
  messageIds: string[],
): Promise<MessageStatusAcknowledgement> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for message:delivered.")),
      ACK_TIMEOUT_MS,
    );
    socket.emit("message:delivered", { messageIds }, (acknowledgement) => {
      clearTimeout(timeout);
      resolve(acknowledgement);
    });
  });
}

function markRead(
  socket: VerificationSocket,
  conversationId: string,
  upToMessageId: string,
): Promise<MessageStatusAcknowledgement> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for message:read.")),
      ACK_TIMEOUT_MS,
    );
    socket.emit(
      "message:read",
      { conversationId, upToMessageId },
      (acknowledgement) => {
        clearTimeout(timeout);
        resolve(acknowledgement);
      },
    );
  });
}

function receiveStatus(
  socket: VerificationSocket,
  expectedMessageId: string,
  expectedStatus: MessageStatusPayload["status"],
): Promise<MessageStatusPayload> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timeout);
      socket.off("message:status", handleStatus);
    };
    const handleStatus = (status: MessageStatusPayload): void => {
      if (
        status.messageId !== expectedMessageId ||
        status.status !== expectedStatus
      ) {
        return;
      }
      cleanup();
      resolve(status);
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${expectedStatus} status.`));
    }, ACK_TIMEOUT_MS);
    socket.on("message:status", handleStatus);
  });
}

async function getJson(path: string, token: string): Promise<unknown> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(response.ok, `GET ${path} returned ${response.status}.`);
  return response.json();
}

async function main(): Promise<void> {
  const databaseUrl = requiredEnvironmentValue("DATABASE_URL");
  const jwtSecret = requiredEnvironmentValue("JWT_ACCESS_SECRET");
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  const suffix = `${Date.now()}-${randomUUID()}`;
  const userIds: string[] = [];
  const conversationIds: string[] = [];
  const sockets: VerificationSocket[] = [];

  try {
    const [sender, recipient, outsider] = await Promise.all(
      ["sender", "recipient", "outsider"].map((role) =>
        prisma.user.create({
          data: {
            email: `feature12-${role}-${suffix}@example.com`,
            displayName: `Feature 12 ${role}`,
            passwordHash: "verification-only",
          },
          select: { id: true },
        }),
      ),
    );
    userIds.push(sender.id, recipient.id, outsider.id);

    const conversation = await prisma.conversation.create({
      data: {
        directKey: [sender.id, recipient.id].sort().join(":"),
        participants: {
          create: [{ userId: sender.id }, { userId: recipient.id }],
        },
      },
      select: { id: true },
    });
    conversationIds.push(conversation.id);

    const otherConversation = await prisma.conversation.create({
      data: {
        directKey: [sender.id, outsider.id].sort().join(":"),
        participants: {
          create: [{ userId: sender.id }, { userId: outsider.id }],
        },
        messages: {
          create: {
            senderId: sender.id,
            content: "Different conversation boundary",
            statuses: {
              create: {
                userId: outsider.id,
                status: MessageStatusType.SENT,
              },
            },
          },
        },
      },
      select: { id: true, messages: { select: { id: true } } },
    });
    conversationIds.push(otherConversation.id);

    const senderToken = accessToken(sender.id, jwtSecret);
    const recipientToken = accessToken(recipient.id, jwtSecret);
    const outsiderToken = accessToken(outsider.id, jwtSecret);
    const senderSocket = await connectSocket(senderToken);
    sockets.push(senderSocket);

    const sent = await sendMessage(
      senderSocket,
      conversation.id,
      `Feature 12 status verification ${suffix}`,
    );
    if (!sent.ok) throw new Error(`message:send failed: ${sent.error}`);
    const persistedSent = await prisma.messageStatus.findUnique({
      where: {
        messageId_userId: {
          messageId: sent.message.id,
          userId: recipient.id,
        },
      },
      select: { status: true },
    });
    assert(
      persistedSent?.status === MessageStatusType.SENT,
      "Disconnected recipient status was not SENT.",
    );

    const recipientSocket = await connectSocket(recipientToken);
    const outsiderSocket = await connectSocket(outsiderToken);
    sockets.push(recipientSocket, outsiderSocket);

    const deliveredEvent = receiveStatus(
      senderSocket,
      sent.message.id,
      "DELIVERED",
    );
    const delivered = await markDelivered(recipientSocket, [sent.message.id]);
    assert(
      delivered.success && delivered.updated === 1,
      "Delivery update failed.",
    );
    await deliveredEvent;

    const readEvent = receiveStatus(senderSocket, sent.message.id, "READ");
    const read = await markRead(
      recipientSocket,
      conversation.id,
      sent.message.id,
    );
    assert(read.success && read.updated === 1, "Read update failed.");
    await readEvent;

    const ownDelivery = await markDelivered(senderSocket, [sent.message.id]);
    assert(
      ownDelivery.success && ownDelivery.updated === 0,
      "Sender was able to deliver their own message.",
    );

    const outsiderDelivery = await markDelivered(outsiderSocket, [
      sent.message.id,
    ]);
    assert(!outsiderDelivery.success, "Outsider delivery was not rejected.");
    const outsiderRead = await markRead(
      outsiderSocket,
      conversation.id,
      sent.message.id,
    );
    assert(!outsiderRead.success, "Outsider read was not rejected.");

    const wrongBoundary = await markRead(
      recipientSocket,
      conversation.id,
      otherConversation.messages[0].id,
    );
    assert(!wrongBoundary.success, "Foreign read boundary was not rejected.");

    const noDowngrade = await markDelivered(recipientSocket, [sent.message.id]);
    assert(
      noDowngrade.success && noDowngrade.updated === 0,
      "READ message was downgraded by delivery.",
    );

    const history = (await getJson(
      `/api/conversations/${conversation.id}/messages`,
      senderToken,
    )) as {
      messages: Array<{ id: string; status: string | null }>;
    };
    assert(
      history.messages.find((message) => message.id === sent.message.id)
        ?.status === "READ",
      "History response did not expose READ.",
    );

    const inbox = (await getJson("/api/conversations", senderToken)) as {
      conversations: Array<{
        id: string;
        lastMessage: { id: string; status: string | null } | null;
      }>;
    };
    assert(
      inbox.conversations.find((item) => item.id === conversation.id)
        ?.lastMessage?.status === "READ",
      "Conversation response did not expose READ.",
    );

    console.log(
      "Feature 12 verification passed: SENT, DELIVERED, READ, authorization, no-downgrade, broadcasts, and REST status fields.",
    );
  } finally {
    for (const socket of sockets) socket.disconnect();
    if (conversationIds.length > 0) {
      await prisma.conversation.deleteMany({
        where: { id: { in: conversationIds } },
      });
    }
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Feature 12 verification failed.",
  );
  process.exitCode = 1;
});
