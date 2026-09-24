import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/requireAuth";
import { prisma } from "@/lib/prisma";

interface ConversationRouteContext {
  params: Promise<{ conversationId: string }>;
}

export async function DELETE(
  request: NextRequest,
  context: ConversationRouteContext,
) {
  const { conversationId: untrimmedConversationId } = await context.params;
  const conversationId = untrimmedConversationId.trim();
  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId is required" },
      { status: 400 },
    );
  }

  let userId: string;
  try {
    ({ userId } = requireAuth(request));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const participation = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true },
  });
  if (!participation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  await prisma.conversation.delete({ where: { id: conversationId } });
  return NextResponse.json({ deleted: true });
}
