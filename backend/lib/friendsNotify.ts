import crypto from "node:crypto";

type FriendEventStatus = "PENDING" | "ACCEPTED" | "REJECTED";

// The backend and socket service already share JWT_ACCESS_SECRET. This short-lived
// HMAC authenticates their internal event bridge without exposing a client API.
export async function notifyFriendEvent(
  requestId: string,
  status: FriendEventStatus,
  userIds: string[],
): Promise<void> {
  const baseUrl =
    process.env.FRIEND_SOCKET_URL ??
    (process.env.NODE_ENV === "production" ? null : "http://127.0.0.1:4000");
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!baseUrl || !secret) {
    console.warn("Friend socket notification is not configured");
    return;
  }
  const recipients = [...new Set(userIds)].sort();
  const timestamp = Date.now().toString();
  const payload = `${timestamp}.${requestId}.${status}.${recipients.join(",")}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  try {
    const response = await fetch(
      `${baseUrl.replace(/\/$/, "")}/internal/friend-event`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Envelo-Timestamp": timestamp,
          "X-Envelo-Signature": signature,
        },
        body: JSON.stringify({ requestId, status, userIds: recipients }),
        signal: AbortSignal.timeout(2_000),
      },
    );
    if (!response.ok)
      console.warn("Friend socket notification failed", response.status);
  } catch {
    console.warn("Friend socket notification unavailable");
  }
}
