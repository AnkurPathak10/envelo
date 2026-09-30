import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/requireAuth";
import {
  createGroup,
  createGroupSchema,
  groupErrorResponse,
} from "@/lib/groups";

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    ({ userId } = requireAuth(request));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = createGroupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await createGroup(userId, parsed.data), {
      status: 201,
    });
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
