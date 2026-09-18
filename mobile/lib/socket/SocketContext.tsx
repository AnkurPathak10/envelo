import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { io, type Socket } from 'socket.io-client';

import type { TextMessage } from '@/lib/api/conversations';
import { useAuth } from '@/lib/auth/AuthContext';

export interface MessageSendPayload {
  conversationId: string;
  content: string;
}

export type MessageSendAcknowledgement =
  | { ok: true; message: TextMessage & { content: string } }
  | { ok: false; error: string };

interface ServerToClientEvents {
  'message:new': (message: TextMessage & { content: string }) => void;
}

interface ClientToServerEvents {
  'message:send': (
    payload: MessageSendPayload,
    acknowledge: (result: MessageSendAcknowledgement) => void
  ) => void;
}

type NewMessageListener = ServerToClientEvents['message:new'];
type EnveloSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type SocketConnectionState =
  | 'signed-out'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

interface SocketContextValue {
  connectionState: SocketConnectionState;
  connectionEpoch: number;
  sendMessage: (
    payload: MessageSendPayload
  ) => Promise<MessageSendAcknowledgement>;
  subscribeToNewMessages: (
    listener: ServerToClientEvents['message:new']
  ) => () => void;
}

const SocketContext = createContext<SocketContextValue | undefined>(undefined);
const SEND_TIMEOUT_MS = 10_000;

export function SocketProvider({ children }: PropsWithChildren) {
  const { accessToken, refreshAccessToken } = useAuth();
  const socketRef = useRef<EnveloSocket | null>(null);
  const messageListenersRef = useRef(new Set<NewMessageListener>());
  const [connectionState, setConnectionState] =
    useState<SocketConnectionState>('signed-out');
  const [connectionEpoch, setConnectionEpoch] = useState(0);

  useEffect(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;

    if (!accessToken) {
      setConnectionState('signed-out');
      return;
    }

    const socketUrl = process.env.EXPO_PUBLIC_SOCKET_URL;
    if (!socketUrl) {
      console.warn('Socket connection unavailable: URL is not configured.');
      setConnectionState('error');
      return;
    }

    setConnectionState('connecting');
    const socket: EnveloSocket = io(socketUrl, {
      auth: { token: accessToken },
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
    });
    socketRef.current = socket;

    const handleConnect = (): void => {
      console.log(`Socket connected: ${socket.id}`);
      setConnectionState('connected');
      setConnectionEpoch((epoch) => epoch + 1);
    };
    const handleDisconnect = (reason: string): void => {
      console.log(`Socket disconnected: ${reason}`);
      setConnectionState(socket.active ? 'reconnecting' : 'disconnected');
    };
    const handleConnectError = (error: Error): void => {
      console.warn(`Socket connection failed: ${error.message}`);
      setConnectionState(socket.active ? 'reconnecting' : 'error');
    };
    const handleReconnectAttempt = (): void => {
      setConnectionState('reconnecting');
    };
    const handleReconnectFailed = (): void => {
      setConnectionState('disconnected');
    };
    const handleNewMessage: NewMessageListener = (message) => {
      for (const listener of messageListenersRef.current) listener(message);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('message:new', handleNewMessage);
    socket.io.on('reconnect_attempt', handleReconnectAttempt);
    socket.io.on('reconnect_failed', handleReconnectFailed);
    socket.connect();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('message:new', handleNewMessage);
      socket.io.off('reconnect_attempt', handleReconnectAttempt);
      socket.io.off('reconnect_failed', handleReconnectFailed);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [accessToken]);

  const reconnectWhenForegrounded = useCallback(async (): Promise<void> => {
    const socket = socketRef.current;
    if (!accessToken || socket?.connected) return;

    setConnectionState('reconnecting');

    try {
      const refreshedToken = await refreshAccessToken();
      if (!refreshedToken) return;

      // A new token recreates the socket through the accessToken effect above.
      // If it is unchanged, explicitly resume the current client immediately.
      if (refreshedToken === accessToken) {
        const currentSocket = socketRef.current;
        if (!currentSocket?.connected) {
          currentSocket?.connect();
        }
      }
    } catch {
      setConnectionState('disconnected');
    }
  }, [accessToken, refreshAccessToken]);

  useEffect(() => {
    let previousAppState = AppState.currentState;
    const subscription = AppState.addEventListener(
      'change',
      (nextAppState: AppStateStatus) => {
        const returnedToForeground =
          nextAppState === 'active' && previousAppState !== 'active';
        previousAppState = nextAppState;
        if (returnedToForeground) void reconnectWhenForegrounded();
      }
    );

    return () => subscription.remove();
  }, [reconnectWhenForegrounded]);

  const sendMessage = useCallback(
    (payload: MessageSendPayload): Promise<MessageSendAcknowledgement> =>
      new Promise((resolve, reject) => {
        const socket = socketRef.current;
        if (!socket?.connected) {
          reject(new Error('Socket is disconnected.'));
          return;
        }

        const cleanup = (): void => {
          clearTimeout(timeout);
          socket.off('disconnect', handleDisconnect);
        };
        const handleDisconnect = (): void => {
          cleanup();
          reject(new Error('Socket disconnected before acknowledgement.'));
        };
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Message acknowledgement timed out.'));
        }, SEND_TIMEOUT_MS);

        socket.once('disconnect', handleDisconnect);
        socket.emit('message:send', payload, (result) => {
          cleanup();
          resolve(result);
        });
      }),
    []
  );

  const subscribeToNewMessages = useCallback(
    (listener: NewMessageListener): (() => void) => {
      messageListenersRef.current.add(listener);
      return () => {
        messageListenersRef.current.delete(listener);
      };
    },
    []
  );

  const value = useMemo(
    () => ({
      connectionState,
      connectionEpoch,
      sendMessage,
      subscribeToNewMessages,
    }),
    [connectionEpoch, connectionState, sendMessage, subscribeToNewMessages]
  );

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
}

export function useSocket(): SocketContextValue {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used inside SocketProvider');
  return context;
}
