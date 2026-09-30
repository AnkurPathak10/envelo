import { ConversationType, type Prisma } from "../generated/prisma";
import type { Server, Socket } from "socket.io";
import { z } from "zod";

import { isAllowedMediaUrl, isVoiceMediaUrl } from "./media";

export const messageSendSchema = z
  .object({
    conversationId: z.string().trim().min(1),
    content: z.string().trim().min(1).max(2000).nullable().optional(),
    mediaUrl: z
      .string()
      .trim()
      .url()
      .refine(isAllowedMediaUrl, "Invalid media URL")
      .optional(),
    audioDurationMs: z.number().int().min(300).max(300_000).optional(),
    clientMessageId: z.string().trim().min(1).max(100).optional(),
    replyToId: z.string().trim().min(1).max(100).optional(),
  })
  .superRefine((message, context) => {
    if (!message.content && !message.mediaUrl) {
      context.addIssue({
        code: "custom",
        message: "Message content or media is required",
        path: ["content"],
      });
    }
    if (message.audioDurationMs !== undefined && !message.mediaUrl) {
      context.addIssue({
        code: "custom",
        message: "Voice messages require media",
        path: ["audioDurationMs"],
      });
    }
    if (
      message.audioDurationMs !== undefined &&
      message.mediaUrl &&
      !isVoiceMediaUrl(message.mediaUrl)
    ) {
      context.addIssue({
        code: "custom",
        message: "Voice message URL is invalid",
        path: ["mediaUrl"],
      });
    }
    if (
      message.audioDurationMs === undefined &&
      message.mediaUrl &&
      isVoiceMediaUrl(message.mediaUrl)
    ) {
      context.addIssue({
        code: "custom",
        message: "Voice message duration is required",
        path: ["audioDurationMs"],
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
  audioDurationMs: number | null;
  replyTo: {
    id: string;
    senderId: string;
    senderName: string;
    content: string | null;
    mediaUrl: string | null;
    audioDurationMs: number | null;
  } | null;
  createdAt: string;
  clientMessageId: string | null;
  inboxPreview?: string;
}

export type MessageSendAcknowledgement =
  | { ok: true; message: TextMessagePayload }
  | {
      ok: false;
      error: string;
      code?: "REPLY_TARGET_UNAVAILABLE";
    };

export type MessageStatusAcknowledgement =
  { success: true; updated: number } | { success: false; error: string };

export interface MessageStatusPayload {
  messageId: string;
  status: "DELIVERED" | "READ";
}

export interface FriendRequestEvent {
  requestId: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
}

export interface ConversationVisibilityPayload {
  conversationId: string;
  clearedAt: string | null;
  deletedAt: string | null;
}

export type ConversationVisibilityAcknowledgement =
  | { success: true; visibility: ConversationVisibilityPayload }
  | { success: false; error: string };

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
  "conversation:visibility:sync": (
    payload: unknown,
    acknowledge?: (result: ConversationVisibilityAcknowledgement) => void,
  ) => void;
  "conversation:visibility:clear": (
    payload: unknown,
    acknowledge?: (result: ConversationVisibilityAcknowledgement) => void,
  ) => void;
  "conversation:visibility:delete": (
    payload: unknown,
    acknowledge?: (result: ConversationVisibilityAcknowledgement) => void,
  ) => void;
}

export interface ServerToClientEvents {
  "friend:request": (event: FriendRequestEvent) => void;
  "message:new": (message: TextMessagePayload) => void;
  "message:status": (status: MessageStatusPayload) => void;
  "conversation:visibility": (
    visibility: ConversationVisibilityPayload,
  ) => void;
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
  audioDurationMs: true,
  createdAt: true,
  clientMessageId: true,
  sender: { select: { displayName: true } },
  replyTo: {
    select: {
      id: true,
      senderId: true,
      content: true,
      mediaUrl: true,
      audioDurationMs: true,
      createdAt: true,
      sender: { select: { displayName: true } },
    },
  },
} satisfies Prisma.MessageSelect;

type SelectedTextMessage = Prisma.MessageGetPayload<{
  select: typeof textMessageSelect;
}>;

export function toTextMessagePayload(
  message: SelectedTextMessage,
  viewerClearedAt: Date | null = null,
  conversationType: ConversationType = ConversationType.DIRECT,
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
    audioDurationMs: message.audioDurationMs,
    createdAt: message.createdAt.toISOString(),
    clientMessageId: message.clientMessageId,
    ...(conversationType === ConversationType.GROUP
      ? {
          inboxPreview: `${message.sender.displayName}: ${
            message.content ??
            (message.audioDurationMs !== null
              ? "Voice message"
              : message.mediaUrl
                ? "Photo"
                : "Message")
          }`,
        }
      : {}),
    replyTo:
      message.replyTo &&
      (!viewerClearedAt || message.replyTo.createdAt > viewerClearedAt)
        ? {
            id: message.replyTo.id,
            senderId: message.replyTo.senderId,
            senderName: message.replyTo.sender.displayName,
            content: message.replyTo.content,
            mediaUrl: message.replyTo.mediaUrl,
            audioDurationMs: message.replyTo.audioDurationMs,
          }
        : null,
  };
}
