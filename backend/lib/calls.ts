import { CallStatus, Prisma, type CallLog } from "@prisma/client";
import { CallError } from "./callBridge";
import { prisma } from "./prisma";
import {
  addCallParticipant,
  createMeeting,
  revokeCallParticipants,
} from "./realtimeKit";

const userSelect = { id: true, displayName: true, avatarUrl: true } as const;
export const ACTIVE_CALL_STATUSES: CallStatus[] = [
  CallStatus.RINGING,
  CallStatus.ONGOING,
];

export async function directCallMembers(
  conversationId: string,
  userId: string,
) {
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      participants: { some: { userId, leftAt: null } },
    },
    select: {
      type: true,
      realtimeMeetingId: true,
      participants: {
        where: { leftAt: null },
        select: { user: { select: userSelect } },
      },
    },
  });
  if (!conversation) throw new CallError("Conversation not found", 404);
  if (conversation.type !== "DIRECT" || conversation.participants.length !== 2)
    throw new CallError("Only two-person direct calls are supported", 400);
  return {
    meetingId: conversation.realtimeMeetingId,
    members: conversation.participants.map((p) => p.user),
  };
}

export function callHistoryItem(call: CallLog) {
  const durationSeconds =
    call.connectedAt && call.endedAt
      ? Math.max(
          0,
          Math.floor(
            (call.endedAt.getTime() - call.connectedAt.getTime()) / 1000,
          ),
        )
      : 0;
  return {
    type: "call" as const,
    id: call.id,
    conversationId: call.conversationId,
    initiatorId: call.initiatorId,
    status: call.status,
    hadVideo: call.hadVideo,
    createdAt: call.startedAt.toISOString(),
    connectedAt: call.connectedAt?.toISOString() ?? null,
    endedAt: call.endedAt?.toISOString() ?? null,
    durationSeconds,
  };
}

export async function startCall(conversationId: string, userId: string) {
  const detail = await directCallMembers(conversationId, userId);
  if (
    await prisma.callLog.findFirst({
      where: { conversationId, status: { in: ACTIVE_CALL_STATUSES } },
    })
  )
    throw new CallError("This conversation already has an active call", 409);
  let meetingId = detail.meetingId;
  if (!meetingId) {
    meetingId = await createMeeting(conversationId);
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { realtimeMeetingId: meetingId },
    });
  }
  // Revoke any credentials left behind by an earlier failed cleanup before reuse.
  await revokeCallParticipants(meetingId);
  let call: CallLog;
  try {
    call = await prisma.callLog.create({
      data: { conversationId, initiatorId: userId, status: "RINGING" },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new CallError("This conversation already has an active call", 409);
    throw error;
  }
  const caller = detail.members.find((u) => u.id === userId)!;
  const callee = detail.members.find((u) => u.id !== userId)!;
  try {
    const participant = await addCallParticipant(meetingId, call.id, caller);
    return {
      call: callHistoryItem(call),
      meetingId,
      participantId: participant.id,
      authToken: participant.token,
      caller,
      callee,
    };
  } catch (error) {
    await prisma.callLog.updateMany({
      where: { id: call.id, status: "RINGING" },
      data: { status: "DECLINED", endedAt: new Date() },
    });
    await revokeCallParticipants(meetingId, call.id).catch(() =>
      console.warn("Call setup cleanup requires retry"),
    );
    throw error;
  }
}

export async function acceptCall(callId: string, userId: string) {
  const call = await prisma.callLog.findUnique({ where: { id: callId } });
  if (!call) throw new CallError("Call not found", 404);
  const detail = await directCallMembers(call.conversationId, userId);
  if (call.initiatorId === userId)
    throw new CallError("Only the invited user may accept", 403);
  if (
    call.status !== "RINGING" ||
    Date.now() - call.startedAt.getTime() >= 45_000
  )
    throw new CallError("Call is no longer ringing", 409);
  const participant = await addCallParticipant(
    detail.meetingId!,
    call.id,
    detail.members.find((u) => u.id === userId)!,
  );
  if (Date.now() - call.startedAt.getTime() >= 45_000) {
    await revokeCallParticipants(detail.meetingId!, call.id, userId);
    throw new CallError("Call is no longer ringing", 409);
  }
  const { count } = await prisma.callLog.updateMany({
    where: { id: call.id, status: "RINGING" },
    data: { status: "ONGOING", connectedAt: new Date() },
  });
  if (count === 0) {
    await revokeCallParticipants(detail.meetingId!, call.id, userId);
    throw new CallError("Call is no longer ringing", 409);
  }
  const updated = await prisma.callLog.findUniqueOrThrow({
    where: { id: call.id },
  });
  if (updated.status !== "ONGOING") {
    await revokeCallParticipants(detail.meetingId!, call.id, userId);
    throw new CallError("Call has ended", 409);
  }
  return {
    call: callHistoryItem(updated),
    meetingId: detail.meetingId!,
    participantId: participant.id,
    authToken: participant.token,
  };
}

export async function finishCall(
  callId: string,
  userId: string | undefined,
  action: "end" | "decline" | "timeout",
) {
  const call = await prisma.callLog.findUnique({
    where: { id: callId },
    include: { conversation: { select: { realtimeMeetingId: true } } },
  });
  if (!call) throw new CallError("Call not found", 404);
  if (userId) await directCallMembers(call.conversationId, userId);
  if (
    action === "decline" &&
    (call.initiatorId === userId || call.status === "ONGOING")
  )
    throw new CallError(
      "Only the invited user may decline a ringing call",
      403,
    );
  if (
    action === "timeout" &&
    (call.status === "ONGOING" ||
      (call.status === "RINGING" &&
        Date.now() - call.startedAt.getTime() < 45_000))
  )
    throw new CallError("Call has not timed out", 409);
  if (ACTIVE_CALL_STATUSES.includes(call.status)) {
    const { count } = await prisma.callLog.updateMany({
      where: { id: callId, status: call.status },
      data: {
        status:
          call.status === "ONGOING"
            ? "COMPLETED"
            : action === "decline"
              ? "DECLINED"
              : "MISSED",
        endedAt: new Date(),
      },
    });
    // A concurrent accept/end won. Re-read and revalidate the action before
    // changing status or revoking credentials belonging to the winning state.
    if (count === 0) return finishCall(callId, userId, action);
  }
  const updated = await prisma.callLog.findUniqueOrThrow({
    where: { id: callId },
  });
  if (call.conversation.realtimeMeetingId)
    await revokeCallParticipants(call.conversation.realtimeMeetingId, callId);
  return callHistoryItem(updated);
}

export async function markCallVideo(callId: string, userId?: string) {
  const call = await prisma.callLog.findUnique({ where: { id: callId } });
  if (!call) throw new CallError("Call not found", 404);
  if (userId) await directCallMembers(call.conversationId, userId);
  if (!ACTIVE_CALL_STATUSES.includes(call.status))
    throw new CallError("Call has ended", 409);
  return callHistoryItem(
    await prisma.callLog.update({
      where: { id: callId },
      data: { hadVideo: true },
    }),
  );
}

// These helpers are reachable only through the authenticated internal bridge.
// The socket coordinator owns admission; guests never become chat members.
export async function callFriend(inviterId: string, userId: string) {
  if (
    inviterId === userId ||
    !(await prisma.friendship.findFirst({
      where: {
        status: "ACCEPTED",
        OR: [
          { requesterId: inviterId, addresseeId: userId },
          { requesterId: userId, addresseeId: inviterId },
        ],
      },
    }))
  )
    throw new CallError("You can only invite your accepted friends", 403);
  const friend = await prisma.user.findUnique({
    where: { id: userId },
    select: userSelect,
  });
  if (!friend) throw new CallError("Friend not found", 404);
  return friend;
}

export async function joinCallGuest(
  callId: string,
  userId: string,
  inviterId: string,
) {
  const friend = await callFriend(inviterId, userId);
  const call = await prisma.callLog.findUnique({
    where: { id: callId },
    include: { conversation: { select: { realtimeMeetingId: true } } },
  });
  if (
    !call ||
    call.status !== "ONGOING" ||
    !call.conversation.realtimeMeetingId
  )
    throw new CallError("Call is no longer active", 409);
  const meetingId = call.conversation.realtimeMeetingId;
  // A failed provisioning response may have left an unacknowledged credential.
  await revokeCallParticipants(meetingId, callId, userId);
  const participant = await addCallParticipant(meetingId, call.id, friend);
  return {
    call: callHistoryItem(call),
    meetingId,
    participantId: participant.id,
    authToken: participant.token,
  };
}

export async function leaveCallParticipant(callId: string, userId: string) {
  const call = await prisma.callLog.findUnique({
    where: { id: callId },
    include: { conversation: { select: { realtimeMeetingId: true } } },
  });
  if (!call) throw new CallError("Call not found", 404);
  if (call.conversation.realtimeMeetingId)
    await revokeCallParticipants(
      call.conversation.realtimeMeetingId,
      callId,
      userId,
    );
  return callHistoryItem(call);
}

export async function recoverCalls() {
  const active = await prisma.callLog.findMany({
    where: { status: { in: ACTIVE_CALL_STATUSES } },
  });
  for (const call of active) await finishCall(call.id, undefined, "end");
  // Terminal logs can still have provider credentials after a process died
  // between persisting endedAt and revoking participants. Sweep owned meetings.
  const conversations = await prisma.conversation.findMany({
    where: { realtimeMeetingId: { not: null }, callLogs: { some: {} } },
    select: { realtimeMeetingId: true },
  });
  for (const conversation of conversations)
    await revokeCallParticipants(conversation.realtimeMeetingId!);
  return { recovered: active.length };
}
