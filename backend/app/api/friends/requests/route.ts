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
    where: { addresseeId: userId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      requester: {
        select: { id: true, displayName: true, email: true, avatarUrl: true },
      },
    },
  });
  return NextResponse.json({ requests: rows });
}
