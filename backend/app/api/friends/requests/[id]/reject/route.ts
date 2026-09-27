import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/requireAuth";
import { friendErrorResponse, respondToFriendRequest } from "@/lib/friends";
import { notifyFriendEvent } from "@/lib/friendsNotify";

interface Context {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: Context) {
  let userId: string;
  try {
    ({ userId } = requireAuth(request));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  try {
    const friendship = await respondToFriendRequest(id, userId, "REJECTED");
    await notifyFriendEvent(friendship.id, friendship.status, [
      friendship.requesterId,
      friendship.addresseeId,
    ]);
    return NextResponse.json({ friendship });
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
