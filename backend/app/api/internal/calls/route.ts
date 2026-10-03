import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CallError, verifyCallBridge } from "@/lib/callBridge";
import {
  acceptCall,
  callFriend,
  directCallMembers,
  finishCall,
  joinCallGuest,
  leaveCallParticipant,
  markCallVideo,
  recoverCalls,
  startCall,
} from "@/lib/calls";

const id = z.string().trim().min(1).max(100);
const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("members"), userId: id, conversationId: id }),
  z.object({ action: z.literal("start"), userId: id, conversationId: id }),
  z.object({ action: z.literal("accept"), userId: id, callId: id }),
  z.object({ action: z.literal("video"), userId: id, callId: id }),
  z.object({ action: z.enum(["end", "decline"]), userId: id, callId: id }),
  z.object({ action: z.literal("timeout"), callId: id }),
  z.object({ action: z.literal("recover") }),
  z.object({ action: z.literal("friend"), inviterId: id, userId: id }),
  z.object({
    action: z.literal("join-guest"),
    inviterId: id,
    userId: id,
    callId: id,
  }),
  z.object({ action: z.literal("leave-participant"), userId: id, callId: id }),
  z.object({ action: z.literal("group-video"), callId: id }),
  z.object({ action: z.literal("group-end"), callId: id }),
]);

export async function POST(request: NextRequest) {
  const body = await request.text();
  if (
    body.length > 4096 ||
    !verifyCallBridge(request.headers, "/api/internal/calls", body)
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: "Invalid call command" },
      { status: 400 },
    );
  }
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid call command" },
      { status: 400 },
    );
  const command = parsed.data;
  try {
    let result: unknown;
    switch (command.action) {
      case "members":
        result = await directCallMembers(
          command.conversationId,
          command.userId,
        );
        break;
      case "start":
        result = await startCall(command.conversationId, command.userId);
        break;
      case "accept":
        result = await acceptCall(command.callId, command.userId);
        break;
      case "video":
        result = await markCallVideo(command.callId, command.userId);
        break;
      case "recover":
        result = await recoverCalls();
        break;
      case "friend":
        result = await callFriend(command.inviterId, command.userId);
        break;
      case "join-guest":
        result = await joinCallGuest(
          command.callId,
          command.userId,
          command.inviterId,
        );
        break;
      case "leave-participant":
        result = await leaveCallParticipant(command.callId, command.userId);
        break;
      case "group-video":
        result = await markCallVideo(command.callId);
        break;
      case "group-end":
        result = await finishCall(command.callId, undefined, "end");
        break;
      case "timeout":
        result = await finishCall(command.callId, undefined, command.action);
        break;
      default:
        result = await finishCall(
          command.callId,
          command.userId,
          command.action,
        );
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof CallError ? error.message : "Unable to process call",
      },
      { status: error instanceof CallError ? error.status : 500 },
    );
  }
}
