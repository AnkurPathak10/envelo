import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/requireAuth";
import { FRIEND_REQUEST_COOLDOWN_MS } from "@/lib/friends";
import { prisma } from "@/lib/prisma";

const searchSchema = z.object({
  query: z
    .string({ required_error: "Query is required" })
    .trim()
    .min(1, "Query must contain at least 1 character")
    .max(100, "Query must not exceed 100 characters"),
});

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    ({ userId } = requireAuth(request));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = searchSchema.safeParse({
    query: request.nextUrl.searchParams.get("query"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const { query } = parsed.data;
  const users = await prisma.user.findMany({
    where: {
      id: { not: userId },
      OR: [
        { displayName: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true, email: true, avatarUrl: true },
    take: 20,
  });

  const userIds = users.map((user) => user.id);
  const friendships = userIds.length
    ? await prisma.friendship.findMany({
        where: {
          OR: [
            { requesterId: userId, addresseeId: { in: userIds } },
            { addresseeId: userId, requesterId: { in: userIds } },
          ],
        },
      })
    : [];
  const now = Date.now();
  const usersWithStatus = users.map((user) => {
    const rows = friendships.filter(
      (row) => row.requesterId === user.id || row.addresseeId === user.id,
    );
    if (rows.some((row) => row.status === "ACCEPTED")) {
      return { ...user, friendStatus: "FRIENDS" as const };
    }
    const incoming = rows.find(
      (row) => row.status === "PENDING" && row.addresseeId === userId,
    );
    if (incoming) {
      return {
        ...user,
        friendStatus: "PENDING_INCOMING" as const,
        incomingRequestId: incoming.id,
      };
    }
    if (
      rows.some((row) => row.status === "PENDING" && row.requesterId === userId)
    ) {
      return { ...user, friendStatus: "PENDING_OUTGOING" as const };
    }
    const rejected = rows.find(
      (row) =>
        row.status === "REJECTED" &&
        row.requesterId === userId &&
        row.respondedAt,
    );
    if (rejected?.respondedAt) {
      const cooldownEndsAt = new Date(
        rejected.respondedAt.getTime() + FRIEND_REQUEST_COOLDOWN_MS,
      );
      if (cooldownEndsAt.getTime() > now) {
        return {
          ...user,
          friendStatus: "COOLDOWN" as const,
          cooldownEndsAt: cooldownEndsAt.toISOString(),
        };
      }
    }
    return { ...user, friendStatus: "NONE" as const };
  });

  return NextResponse.json({ users: usersWithStatus });
}
