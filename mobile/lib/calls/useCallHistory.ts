import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { AppState } from 'react-native';
import { useAuth } from '@/lib/auth/AuthContext';
import { useSocket } from '@/lib/socket/SocketContext';
import { ApiError } from '@/lib/api/client';
import { callSchema, getCallHistory, type CallRecord } from './contracts';
import { mergeCallHistory } from './history';

// Account + clear boundary scoped; never cache credentials. Message history keeps
// its existing persistent cache; call rows use a bounded instant-navigation cache.
const cache = new Map<
  string,
  { calls: CallRecord[]; nextCursor: string | null }
>();
export function useCallHistory(
  conversationId: string,
  hiddenBefore: string | null,
  enabled: boolean
) {
  const { user } = useAuth();
  const { connectionEpoch, subscribeToCalls } = useSocket();
  const focused = useIsFocused();
  const key = `${user?.id}:${conversationId}:${hiddenBefore ?? ''}`;
  const [page, setPage] = useState(() => ({
    key,
    ...(cache.get(key) ?? { calls: [], nextCursor: null }),
  }));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestVersion = useRef(0);
  const mountedKey = useRef(key);
  mountedKey.current = key;
  const pageRef = useRef(page);
  pageRef.current = page;
  const effectiveCutoff = useRef({ key, value: hiddenBefore });
  if (effectiveCutoff.current.key !== key)
    effectiveCutoff.current = { key, value: hiddenBefore };
  const invalidateRequest = useCallback(() => {
    requestVersion.current++;
  }, []);
  const save = useCallback(
    (calls: CallRecord[], nextCursor: string | null) => {
      const entry = { key, calls, nextCursor };
      pageRef.current = entry;
      cache.delete(key);
      const retained = calls.slice(-100);
      cache.set(key, {
        calls: retained,
        nextCursor: calls.length > 100 ? retained[0].id : nextCursor,
      });
      while (cache.size > 20) cache.delete(cache.keys().next().value!);
      setPage(entry);
    },
    [key]
  );
  const fetchPage = useCallback(
    async (cursor?: string) => {
      if (!user?.id || !enabled) return;
      const version = ++requestVersion.current;
      const startedAt = Date.now();
      if (cursor) setLoading(true);
      try {
        const result = await getCallHistory(conversationId, cursor);
        if (mountedKey.current !== key || version !== requestVersion.current)
          return;
        // Refresh latest pages authoritatively, retaining terminal events delivered
        // since the REST request started; pagination appends by durable call ID.
        const existing =
          pageRef.current.key === key ? pageRef.current.calls : [];
        const rows = cursor
          ? existing
          : existing.filter(
              (call) =>
                result.calls.some((row) => row.id === call.id) ||
                Date.parse(call.createdAt) >= startedAt
            );
        const cutoff =
          result.clearedAt &&
          (!effectiveCutoff.current.value ||
            Date.parse(result.clearedAt) >
              Date.parse(effectiveCutoff.current.value))
            ? result.clearedAt
            : effectiveCutoff.current.value;
        effectiveCutoff.current.value = cutoff;
        save(
          mergeCallHistory(rows, result.calls, conversationId, cutoff),
          result.nextCursor
        );
        setError(null);
      } catch (caught) {
        if (mountedKey.current !== key || version !== requestVersion.current)
          return;
        if (caught instanceof ApiError && [403, 404].includes(caught.status))
          save([], null);
        setError('Call history unavailable. Tap to retry.');
      } finally {
        if (mountedKey.current === key && version === requestVersion.current)
          setLoading(false);
      }
    },
    [conversationId, enabled, key, save, user?.id]
  );
  useEffect(() => {
    setPage({ key, ...(cache.get(key) ?? { calls: [], nextCursor: null }) });
    setError(null);
    setLoading(false);
    return invalidateRequest;
  }, [invalidateRequest, key]);
  useEffect(() => {
    if (!focused) return;
    void fetchPage();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void fetchPage();
    });
    return () => {
      listener.remove();
      invalidateRequest();
    };
  }, [focused, fetchPage, connectionEpoch, invalidateRequest]);
  useEffect(
    () =>
      subscribeToCalls((_event, data) => {
        if (!enabled) return;
        const result = callSchema.safeParse(
          (data as { call?: unknown } | null)?.call
        );
        if (!result.success || result.data.conversationId !== conversationId)
          return;
        const old = pageRef.current.key === key ? pageRef.current : undefined;
        save(
          mergeCallHistory(
            old?.calls ?? [],
            [result.data],
            conversationId,
            effectiveCutoff.current.value
          ),
          old?.nextCursor ?? null
        );
      }),
    [conversationId, enabled, key, save, subscribeToCalls]
  );
  return {
    calls: enabled && page.key === key ? page.calls : [],
    nextCursor: enabled && page.key === key ? page.nextCursor : null,
    error: enabled ? error : null,
    loading,
    retry: () => fetchPage(),
    loadEarlier: () =>
      page.nextCursor ? fetchPage(page.nextCursor) : Promise.resolve(),
  };
}
