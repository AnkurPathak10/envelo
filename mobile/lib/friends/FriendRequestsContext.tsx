import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { getPendingRequests, type FriendRequest } from '@/lib/api/friends';
import { useAuth } from '@/lib/auth/AuthContext';
import { useSocket } from '@/lib/socket/SocketContext';

interface FriendRequestsValue {
  requests: FriendRequest[];
  loading: boolean;
  error: string | null;
  revision: number;
  refresh: () => Promise<void>;
  notifyChanged: () => Promise<void>;
}

const FriendRequestsContext = createContext<FriendRequestsValue | null>(null);

export function FriendRequestsProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const { connectionEpoch, subscribeToFriendRequests } = useSocket();
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const sequence = useRef(0);

  const refresh = useCallback(async () => {
    if (!user) return;
    const current = ++sequence.current;
    setLoading(true);
    try {
      const next = await getPendingRequests();
      if (current === sequence.current) {
        setRequests(next);
        setError(null);
      }
    } catch {
      if (current === sequence.current)
        setError('Unable to load friend requests.');
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [user]);

  const notifyChanged = useCallback(async () => {
    setRevision((current) => current + 1);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    void refresh();
    return () => {
      sequence.current += 1;
    };
  }, [connectionEpoch, refresh]);

  useEffect(
    () =>
      subscribeToFriendRequests(() => {
        void notifyChanged();
      }),
    [notifyChanged, subscribeToFriendRequests]
  );

  return (
    <FriendRequestsContext.Provider
      value={{ requests, loading, error, revision, refresh, notifyChanged }}
    >
      {children}
    </FriendRequestsContext.Provider>
  );
}

export function useFriendRequests(): FriendRequestsValue {
  const value = useContext(FriendRequestsContext);
  if (!value) throw new Error('FriendRequestsProvider is missing');
  return value;
}
