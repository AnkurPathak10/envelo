import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/requireAuth";
import { groupErrorResponse, setGroupMuted } from "@/lib/groups";

interface GroupRouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: GroupRouteContext) {
  let userId: string;
  try {
    ({ userId } = requireAuth(request));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const groupId = (await context.params).id.trim();
  if (!groupId) {
    return NextResponse.json(
      { error: "Group id is required" },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await setGroupMuted(groupId, userId, false));
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
