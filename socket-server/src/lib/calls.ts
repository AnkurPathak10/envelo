import { z } from "zod";
import {
  callBackend,
  CallError,
  callSchema,
  callUserSchema,
  credentialsSchema,
  type CallCredentials,
  type CallItem,
  type CallUser,
} from "./callBackend";
import type { EnveloServer } from "./messages";
import { sendCallPush } from "./pushNotifications";
import { userRoom } from "./rooms";

interface Invitation {
  user: CallUser;
  inviter: CallUser;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
}
export interface ActiveCall {
  call: CallItem;
  caller: CallUser;
  callee: CallUser;
  participants: Map<string, CallUser>;
  invitations: Map<string, Invitation>;
  credentials: Map<string, CallCredentials>;
  guests: Set<string>;
  groupCall: boolean;
  timer: ReturnType<typeof setTimeout>;
}
export class CallCoordinator {
  private calls = new Map<string, ActiveCall>();
  private users = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();
  private ready = false;
  constructor(private io: EnveloServer) {}
  // Admission, provider provisioning, leaving and deadlines share one owner.
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => undefined);
    return next;
  }
  initialize() {
    return this.serial(async () => {
      if (this.ready) return;
      await callBackend(
        { action: "recover" },
        z.object({ recovered: z.number() }),
      );
      this.ready = true;
    });
  }
  private snapshot(active: ActiveCall) {
    return {
      call: active.call,
      participants: [...active.participants.values()],
      invitedUserIds: [...active.invitations.keys()],
      groupCall: active.groupCall,
    };
  }
  private broadcast(active: ActiveCall, participantUserId?: string) {
    const payload = { ...this.snapshot(active), participantUserId };
    for (const id of active.participants.keys())
      this.io.to(userRoom(id)).emit("call:accepted", payload);
  }
  private ring(
    active: ActiveCall,
    user: CallUser,
    inviter: CallUser,
    expiresAt: number,
    guest: boolean,
  ) {
    const incoming = {
      ...this.snapshot(active),
      caller: inviter,
      guest,
      expiresAt: new Date(expiresAt).toISOString(),
    };
    this.io.to(userRoom(user.id)).emit("call:incoming", incoming);
    if ((this.io.sockets.adapter.rooms.get(userRoom(user.id))?.size ?? 0) === 0)
      void sendCallPush(
        inviter,
        user.id,
        active.call.id,
        active.call.conversationId,
        incoming.expiresAt,
      );
    return incoming;
  }
  start(userId: string, conversationId: string) {
    return this.serial(async () => {
      if (!this.ready)
        throw new CallError("Calling is starting up; try again shortly", 503);
      if (this.users.has(userId))
        throw new CallError("You're already on a call", 409);
      const detail = await callBackend(
        { action: "members", userId, conversationId },
        z.object({
          members: z.array(callUserSchema),
          meetingId: z.string().nullable(),
        }),
      );
      const callee = detail.members.find((u) => u.id !== userId)!;
      if (this.users.has(callee.id))
        throw new CallError("This user is already on a call", 409);
      const started = await callBackend(
        { action: "start", userId, conversationId },
        credentialsSchema.extend({
          caller: callUserSchema,
          callee: callUserSchema,
        }),
      );
      const expiresAt = Date.parse(started.call.createdAt) + 45_000;
      const timer = setTimeout(
        () => {
          void this.timeout(started.call.id).catch(() =>
            console.warn("Call timeout will retry"),
          );
        },
        Math.max(0, expiresAt - Date.now()),
      );
      const active: ActiveCall = {
        call: started.call,
        caller: started.caller,
        callee: started.callee,
        participants: new Map([[userId, started.caller]]),
        invitations: new Map(),
        credentials: new Map([[userId, credentialsSchema.parse(started)]]),
        guests: new Set(),
        groupCall: false,
        timer,
      };
      active.invitations.set(callee.id, {
        user: callee,
        inviter: started.caller,
        expiresAt,
        timer,
      });
      this.calls.set(active.call.id, active);
      this.users.set(userId, active.call.id);
      this.users.set(callee.id, active.call.id);
      const incoming = this.ring(
        active,
        callee,
        started.caller,
        expiresAt,
        false,
      );
      return {
        ...credentialsSchema.parse(started),
        ...this.snapshot(active),
        expiresAt: incoming.expiresAt,
      };
    });
  }
  private authorized(callId: string, userId: string, joinedOnly = false) {
    const active = this.calls.get(callId);
    if (
      !active ||
      (!active.participants.has(userId) &&
        (joinedOnly || !active.invitations.has(userId)))
    )
      throw new CallError("Call not found", 404);
    return active;
  }
  invite(userId: string, callId: string, targetUserId: string) {
    return this.serial(async () => {
      const active = this.authorized(callId, userId, true);
      if (active.call.status !== "ONGOING")
        throw new CallError("Connect the call before adding friends", 409);
      if (this.users.has(targetUserId))
        throw new CallError("This friend is already on a call or ringing", 409);
      const friend = await callBackend(
        { action: "friend", inviterId: userId, userId: targetUserId },
        callUserSchema,
      );
      const expiresAt = Date.now() + 45_000;
      const timer = setTimeout(() => {
        void this.expireGuest(callId, targetUserId).catch(() => undefined);
      }, 45_000);
      active.invitations.set(targetUserId, {
        user: friend,
        inviter: active.participants.get(userId)!,
        expiresAt,
        timer,
      });
      active.guests.add(targetUserId);
      this.users.set(targetUserId, callId);
      const incoming = this.ring(
        active,
        friend,
        active.participants.get(userId)!,
        expiresAt,
        true,
      );
      this.broadcast(active);
      return { ...this.snapshot(active), expiresAt: incoming.expiresAt };
    });
  }
  accept(userId: string, callId: string) {
    return this.serial(async () => {
      const active = this.authorized(callId, userId);
      const invitation = active.invitations.get(userId);
      if (!invitation || invitation.expiresAt <= Date.now())
        throw new CallError("Call is no longer ringing", 409);
      const initial = active.call.status === "RINGING";
      const joined = await callBackend(
        initial
          ? { action: "accept", userId, callId }
          : {
              action: "join-guest",
              userId,
              callId,
              inviterId: invitation.inviter.id,
            },
        credentialsSchema,
      );
      if (!initial && invitation.expiresAt <= Date.now()) {
        await callBackend(
          { action: "leave-participant", userId, callId },
          callSchema,
        );
        await this.dropInvitation(active, userId, "call:missed");
        throw new CallError("Call is no longer ringing", 409);
      }
      clearTimeout(invitation.timer);
      active.invitations.delete(userId);
      active.call = joined.call;
      active.participants.set(userId, invitation.user);
      active.credentials.set(userId, joined);
      if (active.participants.size >= 3) active.groupCall = true;
      this.broadcast(active, userId);
      return { ...joined, ...this.snapshot(active) };
    });
  }
  private async dropInvitation(
    active: ActiveCall,
    userId: string,
    event: "call:declined" | "call:missed",
  ) {
    // A provider may have created a credential even if its response was lost.
    // Revoke before releasing admission, without touching anybody else's token.
    await callBackend(
      { action: "leave-participant", callId: active.call.id, userId },
      callSchema,
    );
    clearTimeout(active.invitations.get(userId)?.timer);
    active.invitations.delete(userId);
    active.guests.delete(userId);
    if (this.users.get(userId) === active.call.id) this.users.delete(userId);
    this.io.to(userRoom(userId)).emit(event, {
      ...this.snapshot(active),
      participantUserId: userId,
      invitationEnded: true,
    });
    this.broadcast(active);
    return this.snapshot(active);
  }
  private async finish(
    active: ActiveCall,
    action: "end" | "decline" | "timeout",
    userId?: string,
  ) {
    const call = await callBackend(
      {
        action: active.groupCall ? "group-end" : action,
        callId: active.call.id,
        ...(!active.groupCall && userId ? { userId } : {}),
      },
      callSchema,
    );
    clearTimeout(active.timer);
    const recipients = new Set([
      active.caller.id,
      active.callee.id,
      ...active.participants.keys(),
      ...active.invitations.keys(),
    ]);
    for (const invitation of active.invitations.values())
      clearTimeout(invitation.timer);
    this.calls.delete(call.id);
    for (const id of recipients) {
      if (this.users.get(id) === call.id) this.users.delete(id);
      const room = this.io.to(userRoom(id));
      if (call.status === "MISSED") room.emit("call:missed", { call });
      if (call.status === "DECLINED") room.emit("call:declined", { call });
      if (action === "timeout") room.emit("call:ringing-timeout", { call });
      room.emit("call:ended", { call });
    }
    return { call };
  }
  private async leave(
    active: ActiveCall,
    userId: string,
    action: "end" | "decline",
  ) {
    if (active.call.status === "RINGING")
      return this.finish(active, action, userId);
    if (active.invitations.has(userId))
      return this.dropInvitation(active, userId, "call:declined");
    if (action === "decline")
      throw new CallError("Only an invited user may decline", 403);
    // Ordinary direct calls still end together. Once a third person joins,
    // leaving is individual, even after the call shrinks back to one person.
    if (!active.groupCall || active.participants.size === 1)
      return this.finish(active, "end", userId);
    await callBackend(
      { action: "leave-participant", callId: active.call.id, userId },
      callSchema,
    );
    active.participants.delete(userId);
    active.credentials.delete(userId);
    active.guests.delete(userId);
    if (this.users.get(userId) === active.call.id) this.users.delete(userId);
    this.io.to(userRoom(userId)).emit("call:ended", {
      ...this.snapshot(active),
      participantUserId: userId,
      left: true,
    });
    this.broadcast(active, userId);
    return this.snapshot(active);
  }
  end(userId: string, callId: string, action: "end" | "decline") {
    return this.serial(() =>
      this.leave(this.authorized(callId, userId), userId, action),
    );
  }
  private expireGuest(callId: string, userId: string) {
    return this.serial(async () => {
      const active = this.calls.get(callId);
      const invitation = active?.invitations.get(userId);
      if (!active || !invitation) return;
      if (invitation.expiresAt > Date.now()) {
        invitation.timer = setTimeout(() => {
          void this.expireGuest(callId, userId).catch(() => undefined);
        }, invitation.expiresAt - Date.now());
        return;
      }
      try {
        return await this.dropInvitation(active, userId, "call:missed");
      } catch (error) {
        invitation.timer = setTimeout(() => {
          void this.expireGuest(callId, userId).catch(() => undefined);
        }, 5_000);
        throw error;
      }
    });
  }
  private timeout(callId: string): Promise<unknown> {
    return this.serial(async () => {
      const active = this.calls.get(callId);
      if (!active || active.call.status !== "RINGING") return;
      try {
        return await this.finish(active, "timeout");
      } catch (error) {
        active.timer = setTimeout(() => {
          void this.timeout(callId).catch(() => undefined);
        }, 5_000);
        throw error;
      }
    });
  }
  video(userId: string, callId: string) {
    return this.serial(async () => {
      const active = this.authorized(callId, userId, true);
      active.call = await callBackend(
        { action: "group-video", callId },
        callSchema,
      );
      this.broadcast(active);
      return this.snapshot(active);
    });
  }
  sync(userId: string) {
    return this.serial(async () => {
      const id = this.users.get(userId);
      if (!id) return { call: null };
      const active = this.authorized(id, userId);
      const invitation = active.invitations.get(userId);
      return {
        ...(active.credentials.get(userId) ?? {}),
        ...this.snapshot(active),
        caller: invitation?.inviter ?? active.caller,
        guest: active.guests.has(userId),
        ...(invitation
          ? { expiresAt: new Date(invitation.expiresAt).toISOString() }
          : {}),
      };
    });
  }
  disconnected(userId: string) {
    const callId = this.users.get(userId);
    if (!callId) return;
    const participantId = this.calls
      .get(callId)
      ?.credentials.get(userId)?.participantId;
    const timer = setTimeout(() => {
      void this.serial(async () => {
        if (
          this.io.sockets.adapter.rooms.get(userRoom(userId))?.size ||
          this.users.get(userId) !== callId
        )
          return;
        const active = this.calls.get(callId);
        if (!active || active.invitations.has(userId)) return;
        if (active.credentials.get(userId)?.participantId !== participantId)
          return;
        await this.leave(active, userId, "end");
      }).catch(() =>
        console.warn(
          "Disconnected call cleanup failed; explicit end or restart will retry",
        ),
      );
    }, 15_000);
    timer.unref();
  }
}
