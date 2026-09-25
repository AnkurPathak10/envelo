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
    select: { clearedAt: true },
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
        createdAt: participation.clearedAt
          ? { gt: participation.clearedAt }
          : undefined,
        content: { contains: query, mode: "insensitive" },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100,
      select: messageHistorySelect(userId),
    });

    return NextResponse.json({
      clearedAt: participation.clearedAt?.toISOString() ?? null,
      messages: matches.map((message) =>
        toMessageHistoryItem(message, participation.clearedAt),
      ),
      nextCursor: null,
    });
  }

  if (cursor) {
    const cursorMessage = await prisma.message.findFirst({
      where: {
        id: cursor,
        conversationId,
        createdAt: participation.clearedAt
          ? { gt: participation.clearedAt }
          : undefined,
      },
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
    where: {
      conversationId,
      createdAt: participation.clearedAt
        ? { gt: participation.clearedAt }
        : undefined,
    },
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
    clearedAt: participation.clearedAt?.toISOString() ?? null,
    messages: page
      .reverse()
      .map((message) => toMessageHistoryItem(message, participation.clearedAt)),
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

  const clearedAt = new Date();
  const result = await prisma.conversationParticipant.updateMany({
    where: { conversationId, userId },
    data: { clearedAt, deletedAt: null },
  });
  if (result.count === 0) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ clearedAt: clearedAt.toISOString() });
}
