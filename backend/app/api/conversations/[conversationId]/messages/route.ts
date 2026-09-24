import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/requireAuth";
import {
  MESSAGE_PAGE_SIZE,
  messageHistorySelect,
  toMessageHistoryItem,
} from "@/lib/messages";
import { prisma } from "@/lib/prisma";

interface MessageRouteContext {
  params: Promise<{ conversationId: string }>;
}

export async function GET(request: NextRequest, context: MessageRouteContext) {
  const { conversationId: untrimmedConversationId } = await context.params;
  const conversationId = untrimmedConversationId.trim();
  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId is required" },
      { status: 400 },
    );
  }

  const cursorParameter = request.nextUrl.searchParams.get("cursor");
  const cursor = cursorParameter?.trim();
  if (cursorParameter !== null && !cursor) {
    return NextResponse.json(
      { error: "cursor cannot be empty" },
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

  const queryParameter = request.nextUrl.searchParams.get("query");
  const query = queryParameter?.trim();
  if (queryParameter !== null) {
    if (!query || query.length > 100 || cursorParameter !== null) {
      return NextResponse.json(
        { error: "query must contain 1 to 100 characters" },
        { status: 400 },
      );
    }

    const matches = await prisma.message.findMany({
      where: {
        conversationId,
        content: { contains: query, mode: "insensitive" },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100,
      select: messageHistorySelect(userId),
    });

    return NextResponse.json({
      messages: matches.map(toMessageHistoryItem),
      nextCursor: null,
    });
  }

  if (cursor) {
    const cursorMessage = await prisma.message.findFirst({
      where: { id: cursor, conversationId },
      select: { id: true },
    });
    if (!cursorMessage) {
      return NextResponse.json(
        { error: "Invalid message cursor" },
        { status: 400 },
      );
    }
  }

  const records = await prisma.message.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    cursor: cursor ? { id: cursor } : undefined,
    skip: cursor ? 1 : undefined,
    take: MESSAGE_PAGE_SIZE + 1,
    select: messageHistorySelect(userId),
  });

  const hasNextPage = records.length > MESSAGE_PAGE_SIZE;
  const page = hasNextPage ? records.slice(0, MESSAGE_PAGE_SIZE) : records;
  const nextCursor = hasNextPage ? page[page.length - 1].id : null;

  return NextResponse.json({
    messages: page.reverse().map(toMessageHistoryItem),
    nextCursor,
  });
}

export async function DELETE(
  request: NextRequest,
  context: MessageRouteContext,
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

  const cleared = await prisma.$transaction(async (transaction) => {
    const result = await transaction.message.deleteMany({
      where: { conversationId },
    });
    await transaction.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
      select: { id: true },
    });
    return result.count;
  });

  return NextResponse.json({ cleared });
}
