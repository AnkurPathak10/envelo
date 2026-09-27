import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/requireAuth";
import { friendErrorResponse, requestFriend } from "@/lib/friends";
import { notifyFriendEvent } from "@/lib/friendsNotify";
import { sendFriendRequestPush } from "@/lib/pushNotifications";

const requestSchema = z.object({ addresseeId: z.string().trim().min(1) });

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
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  try {
    const result = await requestFriend(userId, parsed.data.addresseeId);
    await Promise.all([
      notifyFriendEvent(result.friendship.id, result.friendship.status, [
        result.friendship.requesterId,
        result.friendship.addresseeId,
      ]),
      result.action === "requested"
        ? sendFriendRequestPush(
            result.friendship.id,
            result.friendship.requesterId,
            result.friendship.addresseeId,
          )
        : Promise.resolve(),
    ]);
    return NextResponse.json(result);
  } catch (error) {
    const response = friendErrorResponse(error);
    if (response)
      return NextResponse.json(
        { error: response.error },
        { status: response.status },
      );
    throw error;
  }
}
