import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/requireAuth";
import { groupErrorResponse, setGroupRole } from "@/lib/groups";

interface MemberRouteContext {
  params: Promise<{ id: string; userId: string }>;
}

export async function POST(request: NextRequest, context: MemberRouteContext) {
  let userId: string;
  try {
    ({ userId } = requireAuth(request));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const params = await context.params;
  const groupId = params.id.trim();
  const targetUserId = params.userId.trim();
  if (!groupId || !targetUserId) {
    return NextResponse.json(
      { error: "Group id and user id are required" },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(
      await setGroupRole(groupId, userId, targetUserId, "ADMIN"),
    );
  } catch (error) {
    const known = groupErrorResponse(error);
    if (known) {
      return NextResponse.json(
        { error: known.error },
        { status: known.status },
      );
    }
    throw error;
  }
}
