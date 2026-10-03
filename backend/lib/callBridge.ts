import crypto from "node:crypto";

export class CallError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function bridgeHeaders(path: string, body: string) {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new CallError("Calling is not configured", 503);
  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();
  return {
    "Content-Type": "application/json",
    "X-Envelo-Timestamp": timestamp,
    "X-Envelo-Nonce": nonce,
    "X-Envelo-Signature": crypto.createHmac("sha256", secret)
      .update(`calls.${path}.${timestamp}.${nonce}.${body}`).digest("hex"),
  };
}

const nonces = new Map<string, number>();
export function verifyCallBridge(headers: Headers, path: string, body: string) {
  const timestamp = headers.get("x-envelo-timestamp") ?? "";
  const nonce = headers.get("x-envelo-nonce") ?? "";
  const signature = headers.get("x-envelo-signature") ?? "";
  const secret = process.env.JWT_ACCESS_SECRET;
  const now = Date.now();
  for (const [key, expires] of nonces) if (expires < now) nonces.delete(key);
  if (!secret || !/^\d+$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 30_000 ||
    !/^[a-f0-9-]{36}$/i.test(nonce) || nonces.has(nonce) || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac("sha256", secret)
    .update(`calls.${path}.${timestamp}.${nonce}.${body}`).digest();
  if (!crypto.timingSafeEqual(expected, Buffer.from(signature, "hex"))) return false;
  nonces.set(nonce, now + 60_000);
  return true;
}

export async function startViaSocket(userId: string, conversationId: string) {
  const base = process.env.CALL_SOCKET_URL ?? process.env.FRIEND_SOCKET_URL ??
    (process.env.NODE_ENV !== "production" ? "http://127.0.0.1:4000" : "");
  if (!base) throw new CallError("Call signaling is not configured", 503);
  const path = "/internal/calls/start";
  const body = JSON.stringify({ userId, conversationId });
  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      method: "POST", headers: bridgeHeaders(path, body), body,
      signal: AbortSignal.timeout(60_000), cache: "no-store",
    });
  } catch { throw new CallError("Call signaling is unavailable", 503); }
  const result = await response.json();
  if (!response.ok) throw new CallError(result.error ?? "Unable to start call", response.status);
  return result;
}
