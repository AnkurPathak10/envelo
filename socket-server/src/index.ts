import cors from "cors";
import crypto from "node:crypto";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { z } from "zod";

import { verifySocketToken } from "./auth/verifySocketToken";
import { registerCallHandlers, registerCallStartRoute } from "./events/calls";
import { CallCoordinator } from "./lib/calls";
import { registerConversationVisibilityHandler } from "./events/conversationVisibility";
import { registerMessageDeliveredHandler } from "./events/messageDelivered";
import { registerMessageReadHandler } from "./events/messageRead";
import { registerMessageHandlers } from "./events/messages";
import { env } from "./lib/env";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./lib/messages";
import { startPushReceiptWorker } from "./lib/pushReceipts";
import { userRoom } from "./lib/rooms";

const app = express();
app.use(cors());
app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

const httpServer = createServer(app);
const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(httpServer, { cors: { origin: "*" } });

const callCoordinator = new CallCoordinator(io);
registerCallStartRoute(app, callCoordinator);

const friendEventSchema = z.object({
  requestId: z.string().min(1),
  status: z.enum(["PENDING", "ACCEPTED", "REJECTED"]),
  userIds: z.array(z.string().min(1)).min(1).max(2),
});

app.post(
  "/internal/friend-event",
  express.json({ limit: "2kb" }),
  (request, response) => {
    const parsed = friendEventSchema.safeParse(request.body);
    const timestamp = request.header("x-envelo-timestamp");
    const signature = request.header("x-envelo-signature");
    if (
      !parsed.success ||
      !timestamp ||
      !signature ||
      !/^\d+$/.test(timestamp) ||
      Math.abs(Date.now() - Number(timestamp)) > 30_000
    ) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { requestId, status } = parsed.data;
    const userIds = [...new Set(parsed.data.userIds)].sort();
    const payload = `${timestamp}.${requestId}.${status}.${userIds.join(",")}`;
    const expected = crypto
      .createHmac("sha256", env.jwtAccessSecret)
      .update(payload)
      .digest();
    const received = /^[a-f0-9]{64}$/i.test(signature)
      ? Buffer.from(signature, "hex")
      : Buffer.alloc(0);
    if (
      received.length !== expected.length ||
      !crypto.timingSafeEqual(received, expected)
    ) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }
    for (const userId of userIds) {
      io.to(userRoom(userId)).emit("friend:request", { requestId, status });
    }
    response.status(202).json({ ok: true });
  },
);

io.use(verifySocketToken);
io.on("connection", (socket) => {
  socket.join(userRoom(socket.data.userId));
  registerMessageHandlers(io, socket);
  registerMessageDeliveredHandler(io, socket);
  registerMessageReadHandler(io, socket);
  registerConversationVisibilityHandler(io, socket);
  registerCallHandlers(callCoordinator, socket);

  console.log(`Socket connected: ${socket.id}, user: ${socket.data.userId}`);

  socket.on("disconnect", () => {
    console.log(
      `Socket disconnected: ${socket.id}, user: ${socket.data.userId}`,
    );
  });
});

httpServer.listen(env.port, () => {
  console.log(`Socket server listening on port ${env.port}`);
  startPushReceiptWorker();
  const initializeCalls = () => {
    void callCoordinator.initialize().catch(() => {
      console.warn("Call backend startup recovery unavailable; retrying in 5 seconds");
      setTimeout(initializeCalls, 5_000).unref();
    });
  };
  initializeCalls();
});
