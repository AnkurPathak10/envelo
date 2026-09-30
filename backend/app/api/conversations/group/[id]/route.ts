import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/requireAuth";
import {
  dissolveGroup,
  getGroup,
  groupErrorResponse,
  updateGroup,
  updateGroupSchema,
} from "@/lib/groups";

interface GroupRouteContext {
  params: Promise<{ id: string }>;
}

async function groupIdentity(request: NextRequest, context: GroupRouteContext) {
  const groupId = (await context.params).id.trim();
  if (!groupId) return { error: "Group id is required", status: 400 } as const;
  try {
    const { userId } = requireAuth(request);
    return { groupId, userId } as const;
  } catch {
    return { error: "Unauthorized", status: 401 } as const;
  }
}

function handleGroupError(error: unknown) {
  const known = groupErrorResponse(error);
  if (known) {
    return NextResponse.json({ error: known.error }, { status: known.status });
  }
  throw error;
}

export async function GET(request: NextRequest, context: GroupRouteContext) {
  const identity = await groupIdentity(request, context);
  if ("error" in identity) {
    return NextResponse.json(
      { error: identity.error },
      { status: identity.status },
    );
  }
  try {
    return NextResponse.json(await getGroup(identity.groupId, identity.userId));
  } catch (error) {
    return handleGroupError(error);
  }
}

export async function PATCH(request: NextRequest, context: GroupRouteContext) {
  const identity = await groupIdentity(request, context);
  if ("error" in identity) {
    return NextResponse.json(
      { error: identity.error },
      { status: identity.status },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = updateGroupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(
      await updateGroup(identity.groupId, identity.userId, parsed.data),
    );
  } catch (error) {
    return handleGroupError(error);
  }
}

export async function DELETE(request: NextRequest, context: GroupRouteContext) {
  const identity = await groupIdentity(request, context);
  if ("error" in identity) {
    return NextResponse.json(
      { error: identity.error },
      { status: identity.status },
    );
  }
  try {
    return NextResponse.json(
      await dissolveGroup(identity.groupId, identity.userId),
    );
  } catch (error) {
    return handleGroupError(error);
  }
}
