import {
  ConversationType,
  MessageStatusType,
  type Prisma,
} from "@prisma/client";

export const directConversationSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  participants: {
    select: {
      clearedAt: true,
      deletedAt: true,
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
          avatarUrl: true,
        },
      },
    },
  },
} satisfies Prisma.ConversationSelect;

type DirectConversation = Prisma.ConversationGetPayload<{
  select: typeof directConversationSelect;
}>;

export function conversationListSelect(currentUserId: string) {
  return {
    id: true,
    type: true,
    name: true,
    photoUrl: true,
    createdAt: true,
    updatedAt: true,
    participants: {
      select: {
        clearedAt: true,
        deletedAt: true,
        leftAt: true,
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    },
    messages: {
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 1,
      select: {
        id: true,
        senderId: true,
        sender: { select: { displayName: true } },
        content: true,
        mediaUrl: true,
        audioDurationMs: true,
        createdAt: true,
        statuses: {
          where: { userId: { not: currentUserId } },
          take: 1,
          select: { status: true },
        },
      },
    },
    _count: {
      select: {
        messages: {
          where: {
            statuses: {
              some: {
                userId: currentUserId,
                status: { not: MessageStatusType.READ },
              },
            },
          },
        },
      },
    },
  } satisfies Prisma.ConversationSelect;
}

type ConversationListConversation = Prisma.ConversationGetPayload<{
  select: ReturnType<typeof conversationListSelect>;
}>;

export function createDirectKey(userId: string, participantId: string): string {
  return [userId, participantId].sort().join(":");
}

function getOtherParticipant(
  conversation: DirectConversation,
  currentUserId: string,
) {
  const participant = conversation.participants.find(
    ({ user }) => user.id !== currentUserId,
  );

  if (!participant) {
    throw new Error("Direct conversation is missing its other participant.");
  }

  return participant.user;
}

function getCurrentParticipation(
  conversation: DirectConversation,
  currentUserId: string,
) {
  const participation = conversation.participants.find(
    ({ user }) => user.id === currentUserId,
  );

  if (!participation) {
    throw new Error("Conversation is missing the current participant.");
  }

  return participation;
}

export function toCreatedDirectConversation(
  conversation: DirectConversation,
  currentUserId: string,
) {
  return {
    id: conversation.id,
    createdAt: conversation.createdAt,
    clearedAt:
      getCurrentParticipation(
        conversation,
        currentUserId,
      ).clearedAt?.toISOString() ?? null,
    participant: getOtherParticipant(conversation, currentUserId),
  };
}

export function toConversationListItem(
  conversation: ConversationListConversation,
  currentUserId: string,
  unreadCount = conversation._count.messages,
) {
  const participation = getCurrentParticipation(conversation, currentUserId);
  const latestMessage = conversation.messages[0];
  const lastMessage =
    latestMessage &&
    (!participation.clearedAt ||
      latestMessage.createdAt > participation.clearedAt)
      ? latestMessage
      : undefined;

  return {
    id: conversation.id,
    type: conversation.type,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    ...(conversation.type === ConversationType.GROUP
      ? { name: conversation.name, photoUrl: conversation.photoUrl }
      : { participant: getOtherParticipant(conversation, currentUserId) }),
    lastMessage: lastMessage
      ? {
          id: lastMessage.id,
          senderId: lastMessage.senderId,
          content: lastMessage.content,
          mediaUrl: lastMessage.mediaUrl,
          audioDurationMs: lastMessage.audioDurationMs,
          createdAt: lastMessage.createdAt.toISOString(),
          status:
            conversation.type === ConversationType.GROUP
              ? null
              : (lastMessage.statuses[0]?.status ?? null),
          ...(conversation.type === ConversationType.GROUP
            ? {
                preview: `${lastMessage.sender.displayName}: ${
                  lastMessage.content ??
                  (lastMessage.audioDurationMs
                    ? "Voice message"
                    : lastMessage.mediaUrl
                      ? "Photo"
                      : "Message")
                }`,
              }
            : {}),
        }
      : null,
    clearedAt: participation.clearedAt?.toISOString() ?? null,
    unreadCount: lastMessage ? unreadCount : 0,
  };
}

export function isConversationVisible(
  conversation: ConversationListConversation,
  currentUserId: string,
): boolean {
  const participation = getCurrentParticipation(conversation, currentUserId);
  if (!participation.deletedAt) return true;
  const latestMessage = conversation.messages[0];
  return Boolean(
    latestMessage && latestMessage.createdAt > participation.deletedAt,
  );
}

export function hasOtherParticipant(
  conversation: ConversationListConversation,
  currentUserId: string,
): boolean {
  return conversation.participants.some(
    ({ user }) => user.id !== currentUserId,
  );
}

export function isActiveGroupMember(
  conversation: ConversationListConversation,
  currentUserId: string,
): boolean {
  return conversation.participants.some(
    ({ user, leftAt }) => user.id === currentUserId && leftAt === null,
  );
}
