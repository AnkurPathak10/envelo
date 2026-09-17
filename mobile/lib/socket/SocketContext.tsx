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
  'signed-out' | 'connecting' | 'connected' | 'disconnected' | 'error';

interface SocketContextValue {
  connectionState: SocketConnectionState;
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
  const { accessToken } = useAuth();
  const socketRef = useRef<EnveloSocket | null>(null);
  const messageListenersRef = useRef(new Set<NewMessageListener>());
  const [connectionState, setConnectionState] =
    useState<SocketConnectionState>('signed-out');

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
      reconnection: false,
    });
    socketRef.current = socket;

    const handleConnect = (): void => {
      console.log(`Socket connected: ${socket.id}`);
      setConnectionState('connected');
    };
    const handleDisconnect = (reason: string): void => {
      console.log(`Socket disconnected: ${reason}`);
      setConnectionState('disconnected');
    };
    const handleConnectError = (error: Error): void => {
      console.warn(`Socket connection failed: ${error.message}`);
      setConnectionState('error');
    };
    const handleNewMessage: NewMessageListener = (message) => {
      for (const listener of messageListenersRef.current) listener(message);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('message:new', handleNewMessage);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('message:new', handleNewMessage);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [accessToken]);

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
    () => ({ connectionState, sendMessage, subscribeToNewMessages }),
    [connectionState, sendMessage, subscribeToNewMessages]
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
