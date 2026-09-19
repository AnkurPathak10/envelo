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
import NetInfo from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';
import { io, type Socket } from 'socket.io-client';

import type { MessageStatus, TextMessage } from '@/lib/api/conversations';
import { useAuth } from '@/lib/auth/AuthContext';

export interface MessageSendPayload {
  conversationId: string;
  content: string;
}

export type SocketTextMessage = Omit<TextMessage, 'status'> & {
  content: string;
};

export type MessageSendAcknowledgement =
  { ok: true; message: SocketTextMessage } | { ok: false; error: string };

export type MessageStatusAcknowledgement =
  { success: true; updated: number } | { success: false; error: string };

export interface MessageStatusUpdate {
  messageId: string;
  status: Extract<MessageStatus, 'DELIVERED' | 'READ'>;
}

interface ServerToClientEvents {
  'message:new': (message: SocketTextMessage) => void;
  'message:status': (update: MessageStatusUpdate) => void;
}

interface ClientToServerEvents {
  'message:send': (
    payload: MessageSendPayload,
    acknowledge: (result: MessageSendAcknowledgement) => void
  ) => void;
  'message:delivered': (
    payload: { messageIds: string[] },
    acknowledge: (result: MessageStatusAcknowledgement) => void
  ) => void;
  'message:read': (
    payload: { conversationId: string; upToMessageId: string },
    acknowledge: (result: MessageStatusAcknowledgement) => void
  ) => void;
}

type NewMessageListener = ServerToClientEvents['message:new'];
type MessageStatusListener = ServerToClientEvents['message:status'];
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
  retryConnection: () => void;
  sendMessage: (
    payload: MessageSendPayload
  ) => Promise<MessageSendAcknowledgement>;
  acknowledgeDeliveredMessages: (
    messages: Array<Pick<TextMessage, 'id' | 'senderId'>>
  ) => void;
  markConversationRead: (payload: {
    conversationId: string;
    upToMessageId: string;
  }) => Promise<MessageStatusAcknowledgement>;
  subscribeToNewMessages: (
    listener: ServerToClientEvents['message:new']
  ) => () => void;
  subscribeToMessageStatuses: (listener: MessageStatusListener) => () => void;
}

const SocketContext = createContext<SocketContextValue | undefined>(undefined);
const SEND_TIMEOUT_MS = 10_000;
const DELIVERY_BATCH_DELAY_MS = 300;
const MAX_DELIVERY_BATCH_SIZE = 100;

export function SocketProvider({ children }: PropsWithChildren) {
  const { accessToken, refreshAccessToken, user } = useAuth();
  const socketRef = useRef<EnveloSocket | null>(null);
  const messageListenersRef = useRef(new Set<NewMessageListener>());
  const messageStatusListenersRef = useRef(new Set<MessageStatusListener>());
  const pendingDeliveredIdsRef = useRef(new Set<string>());
  const deliveryFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const deliveryFlushRef = useRef<() => void>(() => undefined);
  const [connectionState, setConnectionState] =
    useState<SocketConnectionState>('signed-out');
  const [connectionEpoch, setConnectionEpoch] = useState(0);

  const scheduleDeliveryFlush = useCallback((): void => {
    if (
      deliveryFlushTimerRef.current ||
      pendingDeliveredIdsRef.current.size === 0
    ) {
      return;
    }

    deliveryFlushTimerRef.current = setTimeout(() => {
      deliveryFlushTimerRef.current = null;
      deliveryFlushRef.current();
    }, DELIVERY_BATCH_DELAY_MS);
  }, []);

  const flushDeliveredMessages = useCallback((): void => {
    const socket = socketRef.current;
    if (!socket?.connected || pendingDeliveredIdsRef.current.size === 0) {
      return;
    }

    const messageIds = [...pendingDeliveredIdsRef.current].slice(
      0,
      MAX_DELIVERY_BATCH_SIZE
    );
    for (const messageId of messageIds) {
      pendingDeliveredIdsRef.current.delete(messageId);
    }

    socket.emit('message:delivered', { messageIds }, (result) => {
      if (!result.success) {
        for (const messageId of messageIds) {
          pendingDeliveredIdsRef.current.add(messageId);
        }
        return;
      }

      scheduleDeliveryFlush();
    });
  }, [scheduleDeliveryFlush]);
  deliveryFlushRef.current = flushDeliveredMessages;

  const acknowledgeDeliveredMessages = useCallback(
    (messages: Array<Pick<TextMessage, 'id' | 'senderId'>>): void => {
      if (!user?.id) return;

      for (const message of messages) {
        if (message.senderId !== user.id) {
          pendingDeliveredIdsRef.current.add(message.id);
        }
      }
      scheduleDeliveryFlush();
    },
    [scheduleDeliveryFlush, user?.id]
  );

  useEffect(
    () => () => {
      if (deliveryFlushTimerRef.current) {
        clearTimeout(deliveryFlushTimerRef.current);
        deliveryFlushTimerRef.current = null;
      }
      pendingDeliveredIdsRef.current.clear();
    },
    [user?.id]
  );

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
      scheduleDeliveryFlush();
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
      acknowledgeDeliveredMessages([message]);
      for (const listener of messageListenersRef.current) listener(message);
    };
    const handleMessageStatus: MessageStatusListener = (update) => {
      for (const listener of messageStatusListenersRef.current)
        listener(update);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('message:new', handleNewMessage);
    socket.on('message:status', handleMessageStatus);
    socket.io.on('reconnect_attempt', handleReconnectAttempt);
    socket.io.on('reconnect_failed', handleReconnectFailed);
    socket.connect();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('message:new', handleNewMessage);
      socket.off('message:status', handleMessageStatus);
      socket.io.off('reconnect_attempt', handleReconnectAttempt);
      socket.io.off('reconnect_failed', handleReconnectFailed);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [accessToken, acknowledgeDeliveredMessages, scheduleDeliveryFlush]);

  const retryConnection = useCallback((): void => {
    const socket = socketRef.current;
    if (!accessToken || !socket || socket.connected) return;

    setConnectionState('reconnecting');
    socket.connect();
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

  useEffect(() => {
    let previousIsConnected: boolean | null = null;
    return NetInfo.addEventListener((networkState) => {
      const regainedConnectivity =
        networkState.isConnected === true && previousIsConnected !== true;
      previousIsConnected = networkState.isConnected;

      if (regainedConnectivity) retryConnection();
    });
  }, [retryConnection]);

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

  const markConversationRead = useCallback(
    (payload: {
      conversationId: string;
      upToMessageId: string;
    }): Promise<MessageStatusAcknowledgement> =>
      new Promise((resolve, reject) => {
        const socket = socketRef.current;
        if (!socket?.connected) {
          reject(new Error('Socket is disconnected.'));
          return;
        }

        // Preserve delivery-before-read ordering for messages received in the
        // current batch. Socket.IO sends both events in emission order.
        flushDeliveredMessages();

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
          reject(new Error('Read acknowledgement timed out.'));
        }, SEND_TIMEOUT_MS);

        socket.once('disconnect', handleDisconnect);
        socket.emit('message:read', payload, (result) => {
          cleanup();
          resolve(result);
        });
      }),
    [flushDeliveredMessages]
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

  const subscribeToMessageStatuses = useCallback(
    (listener: MessageStatusListener): (() => void) => {
      messageStatusListenersRef.current.add(listener);
      return () => {
        messageStatusListenersRef.current.delete(listener);
      };
    },
    []
  );

  const value = useMemo(
    () => ({
      connectionState,
      connectionEpoch,
      acknowledgeDeliveredMessages,
      markConversationRead,
      retryConnection,
      sendMessage,
      subscribeToNewMessages,
      subscribeToMessageStatuses,
    }),
    [
      connectionEpoch,
      connectionState,
      acknowledgeDeliveredMessages,
      markConversationRead,
      retryConnection,
      sendMessage,
      subscribeToNewMessages,
      subscribeToMessageStatuses,
    ]
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
