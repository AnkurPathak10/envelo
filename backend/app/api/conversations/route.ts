import { NextRequest, NextResponse } from "next/server";

import {
  conversationListSelect,
  hasOtherParticipant,
  isConversationVisible,
  toConversationListItem,
} from "@/lib/conversations";
import { requireAuth } from "@/lib/auth/requireAuth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    ({ userId } = requireAuth(request));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversations = await prisma.conversation.findMany({
    where: { participants: { some: { userId } } },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: conversationListSelect(userId),
  });

  const visibleConversations = conversations.filter(
    (conversation) =>
      hasOtherParticipant(conversation, userId) &&
      isConversationVisible(conversation, userId),
  );
  const unreadCounts = await Promise.all(
    visibleConversations.map((conversation) => {
      const participation = conversation.participants.find(
        ({ user }) => user.id === userId,
      );
      if (!participation?.clearedAt) return conversation._count.messages;
      return prisma.message.count({
        where: {
          conversationId: conversation.id,
          createdAt: { gt: participation.clearedAt },
          statuses: {
            some: {
              userId,
              status: { not: "READ" },
            },
          },
        },
      });
    }),
  );

  return NextResponse.json({
    conversations: visibleConversations.map((conversation, index) =>
      toConversationListItem(conversation, userId, unreadCounts[index]),
    ),
  });
}
