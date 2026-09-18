import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";

import { verifySocketToken } from "./auth/verifySocketToken";
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

io.use(verifySocketToken);
io.on("connection", (socket) => {
  socket.join(userRoom(socket.data.userId));
  registerMessageHandlers(io, socket);
  registerMessageDeliveredHandler(io, socket);
  registerMessageReadHandler(io, socket);

  console.log(`Socket connected: ${socket.id}, user: ${socket.data.userId}`);

  socket.on("disconnect", () => {
    console.log(
      `Socket disconnected: ${socket.id}, user: ${socket.data.userId}`,
    );
  });
});

httpServer.listen(env.port, () => {
  console.log(`Socket server listening on port ${env.port}`);
});
