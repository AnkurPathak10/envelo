import type { Prisma } from "../generated/prisma";
import type { Server, Socket } from "socket.io";
import { z } from "zod";

export const messageSendSchema = z.object({
  conversationId: z.string().trim().min(1),
  content: z.string().trim().min(1).max(2000),
});

export interface TextMessagePayload {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
}

export type MessageSendAcknowledgement =
  { ok: true; message: TextMessagePayload } | { ok: false; error: string };

export interface ClientToServerEvents {
  "message:send": (
    payload: unknown,
    acknowledge?: (result: MessageSendAcknowledgement) => void,
  ) => void;
}

export interface ServerToClientEvents {
  "message:new": (message: TextMessagePayload) => void;
}

export interface InterServerEvents {}

export interface SocketData {
  userId: string;
}

export type EnveloServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type EnveloSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export const textMessageSelect = {
  id: true,
  conversationId: true,
  senderId: true,
  content: true,
  createdAt: true,
} satisfies Prisma.MessageSelect;

type SelectedTextMessage = Prisma.MessageGetPayload<{
  select: typeof textMessageSelect;
}>;

export function toTextMessagePayload(
  message: SelectedTextMessage,
): TextMessagePayload {
  if (message.content === null) {
    throw new Error("Persisted text message has no content.");
  }

  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}
