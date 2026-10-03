import crypto from "node:crypto";
import { z } from "zod";
import { env } from "./env";

export class CallError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export const callSchema = z.object({
  type: z.literal("call"),
  id: z.string(),
  conversationId: z.string(),
  initiatorId: z.string(),
  status: z.enum(["RINGING", "ONGOING", "COMPLETED", "MISSED", "DECLINED"]),
  hadVideo: z.boolean(),
  createdAt: z.string(),
  connectedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  durationSeconds: z.number(),
});
export const callUserSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
});
export const credentialsSchema = z.object({
  call: callSchema,
  meetingId: z.string(),
  participantId: z.string(),
  authToken: z.string(),
});
export type CallItem = z.infer<typeof callSchema>;
export type CallCredentials = z.infer<typeof credentialsSchema>;
export type CallUser = z.infer<typeof callUserSchema>;

export async function callBackend<T>(
  command: object,
  schema: z.ZodType<T>,
): Promise<T> {
  const base =
    process.env.CALL_BACKEND_URL ??
    (process.env.NODE_ENV !== "production" ? "http://127.0.0.1:3000" : "");
  if (!base) throw new CallError("Call backend is not configured", 503);
  const path = "/api/internal/calls";
  const body = JSON.stringify(command);
  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();
  const signature = crypto
    .createHmac("sha256", env.jwtAccessSecret)
    .update(`calls.${path}.${timestamp}.${nonce}.${body}`)
    .digest("hex");
  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Envelo-Timestamp": timestamp,
        "X-Envelo-Nonce": nonce,
        "X-Envelo-Signature": signature,
      },
      body,
      signal: AbortSignal.timeout(50_000),
    });
  } catch {
    throw new CallError("Call backend is unavailable", 503);
  }
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(result);
    throw new CallError(
      error.success ? error.data.error : "Unable to process call",
      response.status,
    );
  }
  const parsed = schema.safeParse(result);
  if (!parsed.success)
    throw new CallError("Invalid call backend response", 502);
  return parsed.data;
}

const nonces = new Map<string, number>();
export function verifyCallBridge(
  timestamp: string,
  nonce: string,
  signature: string,
  path: string,
  body: string,
) {
  const now = Date.now();
  for (const [key, expiry] of nonces) if (expiry < now) nonces.delete(key);
  if (
    !/^\d+$/.test(timestamp) ||
    Math.abs(now - Number(timestamp)) > 30_000 ||
    !/^[a-f0-9-]{36}$/i.test(nonce) ||
    nonces.has(nonce) ||
    !/^[a-f0-9]{64}$/i.test(signature)
  )
    return false;
  const expected = crypto
    .createHmac("sha256", env.jwtAccessSecret)
    .update(`calls.${path}.${timestamp}.${nonce}.${body}`)
    .digest();
  if (!crypto.timingSafeEqual(expected, Buffer.from(signature, "hex")))
    return false;
  nonces.set(nonce, now + 60_000);
  return true;
}
