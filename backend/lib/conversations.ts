import { MessageStatusType, type Prisma } from "@prisma/client";

export const directConversationSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  participants: {
    select: {
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
    createdAt: true,
    updatedAt: true,
    participants: {
      select: {
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
        content: true,
        mediaUrl: true,
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

export function toCreatedDirectConversation(
  conversation: DirectConversation,
  currentUserId: string,
) {
  return {
    id: conversation.id,
    createdAt: conversation.createdAt,
    participant: getOtherParticipant(conversation, currentUserId),
  };
}

export function toConversationListItem(
  conversation: ConversationListConversation,
  currentUserId: string,
) {
  const lastMessage = conversation.messages[0];

  return {
    id: conversation.id,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    participant: getOtherParticipant(conversation, currentUserId),
    lastMessage: lastMessage
      ? {
          id: lastMessage.id,
          senderId: lastMessage.senderId,
          content: lastMessage.content,
          mediaUrl: lastMessage.mediaUrl,
          createdAt: lastMessage.createdAt.toISOString(),
          status: lastMessage.statuses[0]?.status ?? null,
        }
      : null,
    unreadCount: conversation._count.messages,
  };
}

export function hasOtherParticipant(
  conversation: ConversationListConversation,
  currentUserId: string,
): boolean {
  return conversation.participants.some(
    ({ user }) => user.id !== currentUserId,
  );
}
