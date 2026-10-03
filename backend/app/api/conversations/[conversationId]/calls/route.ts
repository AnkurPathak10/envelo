import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/requireAuth";
import { callHistoryItem } from "@/lib/calls";
import { prisma } from "@/lib/prisma";

// Independent cursor stream: Feature 31 merges call rows and messages by
// (createdAt, id) without changing existing message/cache contracts.
export async function GET(request: NextRequest, context: { params: Promise<{ conversationId: string }> }) {
  let userId: string;
  try { ({ userId } = requireAuth(request)); }
  catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const { conversationId } = await context.params;
  const participation = await prisma.conversationParticipant.findFirst({
    where: { conversationId, userId, leftAt: null }, select: { clearedAt: true },
  });
  if (!participation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  const where = { conversationId, startedAt: participation.clearedAt ? { gt: participation.clearedAt } : undefined };
  const cursor = request.nextUrl.searchParams.get("cursor");
  if (cursor !== null && (!cursor.trim() || !(await prisma.callLog.findFirst({ where: { ...where, id: cursor } }))))
    return NextResponse.json({ error: "Invalid call cursor" }, { status: 400 });
  const records = await prisma.callLog.findMany({
    where, orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    cursor: cursor ? { id: cursor } : undefined, skip: cursor ? 1 : undefined, take: 51,
  });
  const page = records.slice(0, 50);
  return NextResponse.json({
    clearedAt: participation.clearedAt?.toISOString() ?? null,
    calls: [...page].reverse().map(callHistoryItem), nextCursor: records.length > 50 ? page[49].id : null,
  });
}
