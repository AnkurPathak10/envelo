import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/requireAuth";
import { CallError, startViaSocket } from "@/lib/callBridge";

export async function POST(request: NextRequest, context: { params: Promise<{ conversationId: string }> }) {
  let userId: string;
  try { ({ userId } = requireAuth(request)); }
  catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const { conversationId } = await context.params;
  if (!conversationId.trim() || conversationId.length > 100)
    return NextResponse.json({ error: "Invalid conversationId" }, { status: 400 });
  try {
    return NextResponse.json(await startViaSocket(userId, conversationId.trim()),
      { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof CallError ? error.message : "Unable to start call" },
      { status: error instanceof CallError ? error.status : 500 });
  }
}
