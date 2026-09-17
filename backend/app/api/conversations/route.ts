import { NextRequest, NextResponse } from "next/server";

import {
  directConversationSelect,
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
    orderBy: { updatedAt: "desc" },
    select: directConversationSelect,
  });

  return NextResponse.json({
    conversations: conversations.map((conversation) =>
      toConversationListItem(conversation, userId),
    ),
  });
}
