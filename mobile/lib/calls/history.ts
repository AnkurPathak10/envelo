import type { CallRecord } from './contracts';

export function mergeCallHistory(
  previous: CallRecord[],
  incoming: CallRecord[],
  conversationId: string,
  hiddenBefore: string | null
): CallRecord[] {
  const byId = new Map(previous.map((call) => [call.id, call]));
  for (const call of incoming) {
    const old = byId.get(call.id);
    // An in-flight pre-end REST page must not overwrite a terminal socket event.
    if (old?.endedAt && !call.endedAt) continue;
    if (old?.status === 'ONGOING' && call.status === 'RINGING') continue;
    byId.set(call.id, {
      ...call,
      hadVideo: call.hadVideo || Boolean(old?.hadVideo),
    });
  }
  return [...byId.values()]
    .filter(
      (call) =>
        call.conversationId === conversationId &&
        (!hiddenBefore || Date.parse(call.createdAt) > Date.parse(hiddenBefore))
    )
    .sort(
      (a, b) =>
        Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
        a.id.localeCompare(b.id)
    );
}
