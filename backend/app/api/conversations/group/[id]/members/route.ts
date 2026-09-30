import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/requireAuth";
import {
  addGroupMembers,
  addGroupMembersSchema,
  groupErrorResponse,
} from "@/lib/groups";

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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = addGroupMembersSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(
      await addGroupMembers(groupId, userId, parsed.data.memberIds),
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
