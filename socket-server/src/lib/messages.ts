import type { Prisma } from "../generated/prisma";
import type { Server, Socket } from "socket.io";
import { z } from "zod";

import { isImageKitUrl } from "./media";

export const messageSendSchema = z
  .object({
    conversationId: z.string().trim().min(1),
    content: z.string().trim().min(1).max(2000).nullable().optional(),
    mediaUrl: z
      .string()
      .trim()
      .url()
      .refine(isImageKitUrl, "Invalid media URL")
      .optional(),
    clientMessageId: z.string().trim().min(1).max(100).optional(),
  })
  .superRefine((message, context) => {
    if (!message.content && !message.mediaUrl) {
      context.addIssue({
        code: "custom",
        message: "Message content or media is required",
        path: ["content"],
      });
    }
  })
  .transform((message) => ({ ...message, content: message.content ?? null }));

export interface TextMessagePayload {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  mediaUrl: string | null;
  createdAt: string;
  clientMessageId: string | null;
}

export type MessageSendAcknowledgement =
  { ok: true; message: TextMessagePayload } | { ok: false; error: string };

export type MessageStatusAcknowledgement =
  { success: true; updated: number } | { success: false; error: string };

export interface MessageStatusPayload {
  messageId: string;
  status: "DELIVERED" | "READ";
}

export interface ClientToServerEvents {
  "message:send": (
    payload: unknown,
    acknowledge?: (result: MessageSendAcknowledgement) => void,
  ) => void;
  "message:delivered": (
    payload: unknown,
    acknowledge?: (result: MessageStatusAcknowledgement) => void,
  ) => void;
  "message:read": (
    payload: unknown,
    acknowledge?: (result: MessageStatusAcknowledgement) => void,
  ) => void;
}

export interface ServerToClientEvents {
  "message:new": (message: TextMessagePayload) => void;
  "message:status": (status: MessageStatusPayload) => void;
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
  mediaUrl: true,
  createdAt: true,
  clientMessageId: true,
} satisfies Prisma.MessageSelect;

type SelectedTextMessage = Prisma.MessageGetPayload<{
  select: typeof textMessageSelect;
}>;

export function toTextMessagePayload(
  message: SelectedTextMessage,
): TextMessagePayload {
  if (message.content === null && message.mediaUrl === null) {
    throw new Error("Persisted message has neither content nor media.");
  }

  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    content: message.content,
    mediaUrl: message.mediaUrl,
    createdAt: message.createdAt.toISOString(),
    clientMessageId: message.clientMessageId,
  };
}
