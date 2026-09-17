import "dotenv/config";

import { randomUUID } from "node:crypto";

import { io, type Socket } from "socket.io-client";

import { MessageStatusType, PrismaClient } from "../src/generated/prisma";
import type {
  ClientToServerEvents,
  MessageSendAcknowledgement,
  ServerToClientEvents,
  TextMessagePayload,
} from "../src/lib/messages";

type VerificationSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set.`);
  return value;
}

function connectSocket(token: string): Promise<VerificationSocket> {
  return new Promise((resolve, reject) => {
    const socket: VerificationSocket = io("http://localhost:4000", {
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

function receiveOneMessage(
  socket: VerificationSocket,
): Promise<TextMessagePayload> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timeout);
      socket.off("message:new", handleMessage);
      socket.off("disconnect", handleDisconnect);
    };

    const handleMessage = (message: TextMessagePayload): void => {
      cleanup();
      resolve(message);
    };

    const handleDisconnect = (): void => {
      cleanup();
      reject(new Error("Socket disconnected while waiting for message:new."));
    };

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for message:new."));
    }, 10_000);

    socket.once("message:new", handleMessage);
    socket.once("disconnect", handleDisconnect);
  });
}

function sendMessage(
  socket: VerificationSocket,
  conversationId: string,
  content: string,
): Promise<MessageSendAcknowledgement> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for message acknowledgement.")),
      10_000,
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const senderToken = requiredEnvironmentValue("TEST_SENDER_TOKEN");
  const recipientToken = requiredEnvironmentValue("TEST_RECIPIENT_TOKEN");
  const conversationId = requiredEnvironmentValue("TEST_CONVERSATION_ID");
  const databaseUrl = requiredEnvironmentValue("DATABASE_URL");
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  let sender: VerificationSocket | undefined;
  let recipient: VerificationSocket | undefined;

  try {
    sender = await connectSocket(senderToken);
    recipient = await connectSocket(recipientToken);

    const uniqueContent = `Feature 08 verification ${Date.now()} ${randomUUID()}`;
    const senderEvent = receiveOneMessage(sender);
    const recipientEvent = receiveOneMessage(recipient);
    void senderEvent.catch(() => undefined);
    void recipientEvent.catch(() => undefined);
    const acknowledgement = await sendMessage(
      sender,
      conversationId,
      uniqueContent,
    );

    assert(acknowledgement.ok, `Send failed: ${acknowledgement.error}`);
    const [senderMessage, recipientMessage] = await Promise.all([
      senderEvent,
      recipientEvent,
    ]);
    assert(
      JSON.stringify(senderMessage) === JSON.stringify(acknowledgement.message),
      "Sender broadcast does not match acknowledgement.",
    );
    assert(
      JSON.stringify(recipientMessage) ===
        JSON.stringify(acknowledgement.message),
      "Recipient broadcast does not match acknowledgement.",
    );

    const matchingMessages = await prisma.message.findMany({
      where: {
        id: acknowledgement.message.id,
        conversationId,
        senderId: acknowledgement.message.senderId,
        content: uniqueContent,
        mediaUrl: null,
      },
      select: {
        id: true,
        statuses: { select: { status: true, userId: true } },
      },
    });

    assert(
      matchingMessages.length === 1,
      "Expected exactly one durable message.",
    );
    assert(
      matchingMessages[0].statuses.length === 1 &&
        matchingMessages[0].statuses[0].status === MessageStatusType.SENT &&
        matchingMessages[0].statuses[0].userId !==
          acknowledgement.message.senderId,
      "Expected one SENT status for the recipient.",
    );

    console.log(
      `Verified one durable message (${acknowledgement.message.id}) on both sockets with recipient SENT status.`,
    );
  } finally {
    sender?.disconnect();
    recipient?.disconnect();
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Message verification failed.",
  );
  process.exitCode = 1;
});
