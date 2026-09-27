import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/requireAuth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    ({ userId } = requireAuth(request));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    include: {
      requester: {
        select: { id: true, displayName: true, email: true, avatarUrl: true },
      },
      addressee: {
        select: { id: true, displayName: true, email: true, avatarUrl: true },
      },
    },
  });
  const byId = new Map(
    rows.map((row) => {
      const friend = row.requesterId === userId ? row.addressee : row.requester;
      return [friend.id, friend] as const;
    }),
  );
  return NextResponse.json({
    friends: [...byId.values()].sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    ),
  });
}
