import { z } from "zod";
import { CallError } from "./callBridge";

const participantSchema = z.object({
  id: z.string().min(1),
  custom_participant_id: z.string().optional(),
});

class RealtimeKitError extends CallError {
  constructor(public upstreamStatus: number) {
    super("Cloudflare calling request failed", 502);
  }
}

export async function realtimeRequest(
  path: string,
  method = "GET",
  body?: unknown,
) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const app = process.env.CLOUDFLARE_REALTIME_APP_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!account || !app || !token)
    throw new CallError("Cloudflare calling is not configured", 503);
  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/realtime/kit/${encodeURIComponent(app)}${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      },
    );
  } catch {
    throw new CallError("Cloudflare calling is unavailable", 502);
  }
  const envelope = z
    .object({ success: z.boolean(), data: z.unknown().optional() })
    .safeParse(await response.json().catch(() => null));
  if (!response.ok || !envelope.success || !envelope.data.success) {
    // Never expose Cloudflare response bodies, credentials, or participant tokens.
    throw new RealtimeKitError(response.status);
  }
  return envelope.data.data;
}

export async function createMeeting(conversationId: string) {
  return z.object({ id: z.string().min(1) }).parse(
    await realtimeRequest("/meetings", "POST", {
      title: `Envelo ${conversationId}`,
      record_on_start: false,
      live_stream_on_start: false,
      persist_chat: false,
      summarize_on_end: false,
      transcribe_on_end: false,
    }),
  ).id;
}

export async function addCallParticipant(
  meetingId: string,
  callId: string,
  user: { id: string; displayName: string; avatarUrl: string | null },
) {
  const preset = process.env.CLOUDFLARE_REALTIME_PRESET_NAME?.trim();
  if (!preset)
    throw new CallError(
      "Set CLOUDFLARE_REALTIME_PRESET_NAME to your calling participant preset",
      503,
    );
  return z.object({ id: z.string().min(1), token: z.string().min(1) }).parse(
    await realtimeRequest(
      `/meetings/${encodeURIComponent(meetingId)}/participants`,
      "POST",
      {
        name: user.displayName,
        ...(user.avatarUrl ? { picture: user.avatarUrl } : {}),
        preset_name: preset,
        custom_participant_id: `envelo:${callId}:${user.id}`,
      },
    ),
  );
}

// Listing before deleting preserves pagination offsets. Prefixes make recovery
// independent of socket memory, including a crash during participant creation.
export async function revokeCallParticipants(
  meetingId: string,
  callId?: string,
  userId?: string,
) {
  const root = `/meetings/${encodeURIComponent(meetingId)}`;
  const participants: z.infer<typeof participantSchema>[] = [];
  for (let page = 1; ; page++) {
    const rows = z
      .array(participantSchema)
      .parse(
        await realtimeRequest(
          `${root}/participants?page_no=${page}&per_page=100`,
        ),
      );
    participants.push(...rows);
    if (rows.length < 100) break;
  }
  const prefix = callId ? `envelo:${callId}:` : "envelo:";
  const targets = participants.filter((p) =>
    userId
      ? p.custom_participant_id === `${prefix}${userId}`
      : p.custom_participant_id?.startsWith(prefix),
  );
  if (targets.length === 0) return;
  try {
    await realtimeRequest(`${root}/active-session/kick`, "POST", {
      custom_participant_ids: targets.map((p) => p.custom_participant_id),
    });
  } catch (error) {
    // No active session is normal for a ringing/unanswered call. Deletion is
    // still mandatory and failures propagate, preventing meeting reuse. Do not
    // swallow auth/network failures: a live participant must be kicked safely.
    if (!(error instanceof RealtimeKitError && error.upstreamStatus === 404))
      throw error;
  }
  for (const target of targets) {
    await realtimeRequest(
      `${root}/participants/${encodeURIComponent(target.id)}`,
      "DELETE",
    );
  }
}
