import { type Prisma } from "@prisma/client";

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
        },
      },
    },
  },
} satisfies Prisma.ConversationSelect;

type DirectConversation = Prisma.ConversationGetPayload<{
  select: typeof directConversationSelect;
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
  conversation: DirectConversation,
  currentUserId: string,
) {
  return {
    id: conversation.id,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    participant: getOtherParticipant(conversation, currentUserId),
  };
}
