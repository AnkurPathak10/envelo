import jwt, { type JwtPayload } from "jsonwebtoken";

import { env } from "../lib/env";
import type { EnveloSocket } from "../lib/messages";

function getUserId(decoded: string | JwtPayload): string | null {
  if (typeof decoded === "string" || typeof decoded.sub !== "string")
    return null;
  return decoded.sub;
}

export function verifySocketToken(
  socket: EnveloSocket,
  next: (error?: Error) => void,
): void {
  const token = socket.handshake.auth.token;
  if (typeof token !== "string" || !token) {
    next(new Error("Unauthorized"));
    return;
  }

  try {
    const userId = getUserId(jwt.verify(token, env.jwtAccessSecret));
    if (!userId) {
      next(new Error("Unauthorized"));
      return;
    }

    socket.data.userId = userId;
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
}
