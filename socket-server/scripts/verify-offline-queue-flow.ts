import "dotenv/config";

import { randomUUID } from "node:crypto";

import jwt from "jsonwebtoken";
import { io, type Socket } from "socket.io-client";

import { PrismaClient } from "../src/generated/prisma";
import type {
  ClientToServerEvents,
  MessageSendAcknowledgement,
  ServerToClientEvents,
  TextMessagePayload,
} from "../src/lib/messages";

type VerificationSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SOCKET_URL = process.env.TEST_SOCKET_URL ?? "http://localhost:4000";
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
  clientMessageId?: string,
): Promise<MessageSendAcknowledgement> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for message:send.")),
      ACK_TIMEOUT_MS,
    );
    socket.emit(
      "message:send",
      { conversationId, content, clientMessageId },
      (acknowledgement) => {
        clearTimeout(timeout);
        resolve(acknowledgement);
      },
    );
  });
}

function waitForMessageCount(
  messages: TextMessagePayload[],
  expectedCount: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const interval = setInterval(() => {
      if (messages.length >= expectedCount) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - startedAt >= ACK_TIMEOUT_MS) {
        clearInterval(interval);
        reject(new Error(`Expected ${expectedCount} recipient broadcasts.`));
      }
    }, 25);
  });
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
    const [sender, recipient] = await Promise.all(
      ["sender", "recipient"].map((role) =>
        prisma.user.create({
          data: {
            email: `feature14-${role}-${suffix}@example.com`,
            displayName: `Feature 14 ${role}`,
            passwordHash: "verification-only",
          },
          select: { id: true },
        }),
      ),
    );
    userIds.push(sender.id, recipient.id);

    const conversation = await prisma.conversation.create({
      data: {
        participants: {
          create: [{ userId: sender.id }, { userId: recipient.id }],
        },
      },
      select: { id: true },
    });
    conversationIds.push(conversation.id);

    const [senderSocket, duplicateSenderSocket, recipientSocket] =
      await Promise.all([
        connectSocket(accessToken(sender.id, jwtSecret)),
        connectSocket(accessToken(sender.id, jwtSecret)),
        connectSocket(accessToken(recipient.id, jwtSecret)),
      ]);
    sockets.push(senderSocket, duplicateSenderSocket, recipientSocket);

    const recipientMessages: TextMessagePayload[] = [];
    recipientSocket.on("message:new", (message) => {
      recipientMessages.push(message);
    });

    const firstClientId = `feature14-first-${randomUUID()}`;
    const firstAcknowledgement = await sendMessage(
      senderSocket,
      conversation.id,
      "First idempotent message",
      firstClientId,
    );
    assert(firstAcknowledgement.ok, "Initial idempotent send failed.");
    assert(
      firstAcknowledgement.message.clientMessageId === firstClientId,
      "Initial acknowledgement omitted the client message ID.",
    );
    await waitForMessageCount(recipientMessages, 1);

    const retryAcknowledgement = await sendMessage(
      senderSocket,
      conversation.id,
      "First idempotent message",
      firstClientId,
    );
    assert(retryAcknowledgement.ok, "Idempotent retry failed.");
    assert(
      retryAcknowledgement.message.id === firstAcknowledgement.message.id,
      "Idempotent retry returned a different durable message.",
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert(
      Number(recipientMessages.length) === 1,
      "Idempotent retry was incorrectly rebroadcast to the recipient.",
    );

    const racingClientId = `feature14-race-${randomUUID()}`;
    const racingAcknowledgements = await Promise.all([
      sendMessage(
        senderSocket,
        conversation.id,
        "Concurrent duplicate message",
        racingClientId,
      ),
      sendMessage(
        duplicateSenderSocket,
        conversation.id,
        "Concurrent duplicate message",
        racingClientId,
      ),
    ]);
    assert(
      racingAcknowledgements.every((acknowledgement) => acknowledgement.ok),
      "A concurrent duplicate request failed.",
    );
    assert(
      racingAcknowledgements[0].ok &&
        racingAcknowledgements[1].ok &&
        racingAcknowledgements[0].message.id ===
          racingAcknowledgements[1].message.id,
      "Concurrent duplicate requests did not reconcile to one message.",
    );
    await waitForMessageCount(recipientMessages, 2);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert(
      Number(recipientMessages.length) === 2,
      "Concurrent duplicate requests produced duplicate broadcasts.",
    );

    const storedMessages = await prisma.message.findMany({
      where: { clientMessageId: { in: [firstClientId, racingClientId] } },
      select: { id: true, clientMessageId: true },
    });
    assert(
      storedMessages.length === 2,
      "Expected exactly two durable messages.",
    );

    const invalidAcknowledgement = await sendMessage(
      senderSocket,
      conversation.id,
      "Invalid client ID",
      "x".repeat(101),
    );
    assert(
      !invalidAcknowledgement.ok,
      "An overlong client message ID was accepted.",
    );

    console.log(
      "Verified clientMessageId acknowledgement, sequential idempotency, concurrent unique-race recovery, no retry rebroadcast, and length validation.",
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
    error instanceof Error
      ? error.message
      : "Offline queue verification failed.",
  );
  process.exitCode = 1;
});
