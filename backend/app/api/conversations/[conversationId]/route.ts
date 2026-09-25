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

  const deletedAt = new Date();
  const result = await prisma.conversationParticipant.updateMany({
    where: { conversationId, userId },
    data: { clearedAt: deletedAt, deletedAt },
  });
  if (result.count === 0) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    clearedAt: deletedAt.toISOString(),
    deletedAt: deletedAt.toISOString(),
  });
}
