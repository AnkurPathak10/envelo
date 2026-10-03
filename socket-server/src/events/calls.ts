import express from "express";
import { z } from "zod";
import { CallError, verifyCallBridge } from "../lib/callBackend";
import { CallCoordinator } from "../lib/calls";
import type { CallAcknowledgement, EnveloSocket } from "../lib/messages";

const id = z.string().trim().min(1).max(100);
const startSchema = z.object({ conversationId: id });
const inviteSchema = z.union([
  startSchema,
  z.object({ callId: id, userId: id }),
]);
const actionSchema = z.object({ callId: id });

export function registerCallHandlers(
  coordinator: CallCoordinator,
  socket: EnveloSocket,
) {
  async function respond(
    operation: () => Promise<
      Extract<CallAcknowledgement, { ok: true }>["data"]
    >,
    acknowledge?: (result: CallAcknowledgement) => void,
  ) {
    try {
      const data = await operation();
      acknowledge?.({ ok: true, data });
    } catch (error) {
      acknowledge?.({
        ok: false,
        error:
          error instanceof CallError ? error.message : "Unable to process call",
      });
    }
  }
  socket.on("call:invite", (payload, ack) => {
    const parsed = inviteSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: "Invalid call invitation" });
      return;
    }
    // Without an acknowledgement, the caller cannot receive their credentials.
    if (typeof ack !== "function") return;
    void respond(
      () =>
        "callId" in parsed.data
          ? coordinator.invite(
              socket.data.userId,
              parsed.data.callId,
              parsed.data.userId,
            )
          : coordinator.start(socket.data.userId, parsed.data.conversationId),
      ack,
    );
  });
  for (const action of ["accept", "decline", "end", "video-enabled"] as const) {
    socket.on(`call:${action}`, (payload, ack) => {
      const parsed = actionSchema.safeParse(payload);
      if (!parsed.success) {
        ack?.({ ok: false, error: "Invalid call action" });
        return;
      }
      if (action === "accept" && typeof ack !== "function") return;
      void respond(
        () =>
          action === "accept"
            ? coordinator.accept(socket.data.userId, parsed.data.callId)
            : action === "video-enabled"
              ? coordinator.video(socket.data.userId, parsed.data.callId)
              : coordinator.end(socket.data.userId, parsed.data.callId, action),
        ack,
      );
    });
  }
  socket.on("call:sync", (_payload, ack) => {
    void respond(() => coordinator.sync(socket.data.userId), ack);
  });
  socket.on("disconnect", () => coordinator.disconnected(socket.data.userId));
}

export function registerCallStartRoute(
  app: express.Express,
  coordinator: CallCoordinator,
) {
  const path = "/internal/calls/start";
  app.post(
    path,
    express.text({ type: "application/json", limit: "4kb" }),
    async (request, response) => {
      const raw: unknown = request.body;
      if (
        typeof raw !== "string" ||
        !verifyCallBridge(
          request.header("x-envelo-timestamp") ?? "",
          request.header("x-envelo-nonce") ?? "",
          request.header("x-envelo-signature") ?? "",
          path,
          raw,
        )
      ) {
        response.status(401).json({ error: "Unauthorized" });
        return;
      }
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        response.status(400).json({ error: "Invalid call request" });
        return;
      }
      const parsed = startSchema.extend({ userId: id }).safeParse(body);
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid call request" });
        return;
      }
      try {
        response
          .set("Cache-Control", "no-store")
          .status(201)
          .json(
            await coordinator.start(
              parsed.data.userId,
              parsed.data.conversationId,
            ),
          );
      } catch (error) {
        response.status(error instanceof CallError ? error.status : 500).json({
          error:
            error instanceof CallError ? error.message : "Unable to start call",
        });
      }
    },
  );
}
