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
import {
  addPendingMessage,
  createClientMessageId,
  getPendingMessages,
  removePendingMessage,
  type PendingMessage,
} from '@/lib/offline/pendingMessagesStore';

export interface MessageSendPayload {
  conversationId: string;
  content: string | null;
  mediaUrl?: string;
  clientMessageId?: string;
}

export type SocketTextMessage = Omit<TextMessage, 'status'>;

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
  pendingMessages: PendingMessage[];
  queueMessage: (payload: {
    conversationId: string;
    content: string;
  }) => Promise<PendingMessage>;
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
const DELIVERY_RETRY_BASE_DELAY_MS = 500;
const MAX_DELIVERY_RETRIES = 3;
const MAX_DELIVERY_BATCH_SIZE = 100;

function sendMessageThroughSocket(
  socket: EnveloSocket,
  payload: MessageSendPayload
): Promise<MessageSendAcknowledgement> {
  return new Promise((resolve, reject) => {
    if (!socket.connected) {
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
  });
}

export function SocketProvider({ children }: PropsWithChildren) {
  const { accessToken, refreshAccessToken, user } = useAuth();
  const currentUserIdRef = useRef(user?.id);
  currentUserIdRef.current = user?.id;
  const socketRef = useRef<EnveloSocket | null>(null);
  const messageListenersRef = useRef(new Set<NewMessageListener>());
  const messageStatusListenersRef = useRef(new Set<MessageStatusListener>());
  const pendingDeliveredIdsRef = useRef(new Set<string>());
  const deliveryRetryCountRef = useRef(0);
  const deliveryFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const deliveryFlushRef = useRef<() => void>(() => undefined);
  const pendingConfirmationRef = useRef<
    (clientMessageId: string) => Promise<void>
  >(async () => undefined);
  const pendingQueueFlushRef = useRef<() => void>(() => undefined);
  const isPendingQueueFlushRunningRef = useRef(false);
  const pendingQueueFlushRequestedRef = useRef(false);
  const pendingMutationRevisionRef = useRef(0);
  const lastPendingTimestampRef = useRef(0);
  const [connectionState, setConnectionState] =
    useState<SocketConnectionState>('signed-out');
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);

  const scheduleDeliveryFlush = useCallback(
    (delayMs = DELIVERY_BATCH_DELAY_MS): void => {
      if (
        deliveryFlushTimerRef.current ||
        pendingDeliveredIdsRef.current.size === 0
      ) {
        return;
      }

      deliveryFlushTimerRef.current = setTimeout(() => {
        deliveryFlushTimerRef.current = null;
        deliveryFlushRef.current();
      }, delayMs);
    },
    []
  );

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

        if (deliveryRetryCountRef.current < MAX_DELIVERY_RETRIES) {
          const retryDelay =
            DELIVERY_RETRY_BASE_DELAY_MS * 2 ** deliveryRetryCountRef.current;
          deliveryRetryCountRef.current += 1;
          scheduleDeliveryFlush(retryDelay);
        }
        return;
      }

      deliveryRetryCountRef.current = 0;
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
      if (deliveryRetryCountRef.current >= MAX_DELIVERY_RETRIES) {
        deliveryRetryCountRef.current = 0;
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
      deliveryRetryCountRef.current = 0;
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
      deliveryRetryCountRef.current = 0;
      scheduleDeliveryFlush();
      pendingQueueFlushRef.current();
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
      if (message.senderId === user?.id && message.clientMessageId) {
        void pendingConfirmationRef
          .current(message.clientMessageId)
          .catch(() => undefined);
      }
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
  }, [
    accessToken,
    acknowledgeDeliveredMessages,
    scheduleDeliveryFlush,
    user?.id,
  ]);

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

      if (regainedConnectivity) void reconnectWhenForegrounded();
    });
  }, [reconnectWhenForegrounded]);

  const sendMessage = useCallback(
    (payload: MessageSendPayload): Promise<MessageSendAcknowledgement> => {
      const socket = socketRef.current;
      if (!socket) return Promise.reject(new Error('Socket is disconnected.'));
      return sendMessageThroughSocket(socket, payload);
    },
    []
  );

  const confirmPendingMessage = useCallback(
    async (clientMessageId: string): Promise<void> => {
      if (!user?.id) return;
      const senderId = user.id;
      pendingMutationRevisionRef.current += 1;
      await removePendingMessage(senderId, clientMessageId);
      if (currentUserIdRef.current !== senderId) return;
      setPendingMessages((current) =>
        current.filter((message) => message.clientMessageId !== clientMessageId)
      );
    },
    [user?.id]
  );
  pendingConfirmationRef.current = confirmPendingMessage;

  const flushPendingQueue = useCallback(async (): Promise<void> => {
    if (isPendingQueueFlushRunningRef.current) {
      pendingQueueFlushRequestedRef.current = true;
      return;
    }

    const senderId = user?.id;
    const flushSocket = socketRef.current;
    if (!senderId || !flushSocket?.connected) return;

    isPendingQueueFlushRunningRef.current = true;
    pendingQueueFlushRequestedRef.current = false;
    try {
      const flushRevision = pendingMutationRevisionRef.current;
      const queuedMessages = await getPendingMessages(senderId);
      if (
        currentUserIdRef.current !== senderId ||
        socketRef.current !== flushSocket ||
        !flushSocket.connected
      ) {
        return;
      }
      if (flushRevision === pendingMutationRevisionRef.current) {
        setPendingMessages(queuedMessages);
      }

      const byConversation = new Map<string, PendingMessage[]>();
      for (const message of queuedMessages) {
        const conversationMessages =
          byConversation.get(message.conversationId) ?? [];
        conversationMessages.push(message);
        byConversation.set(message.conversationId, conversationMessages);
      }

      await Promise.all(
        [...byConversation.values()].map(async (conversationMessages) => {
          for (const pendingMessage of conversationMessages) {
            if (
              currentUserIdRef.current !== senderId ||
              socketRef.current !== flushSocket ||
              !flushSocket.connected
            ) {
              break;
            }

            try {
              const acknowledgement = await sendMessageThroughSocket(
                flushSocket,
                {
                  conversationId: pendingMessage.conversationId,
                  content: pendingMessage.content,
                  clientMessageId: pendingMessage.clientMessageId,
                }
              );
              if (!acknowledgement.ok) break;

              await confirmPendingMessage(pendingMessage.clientMessageId);
              if (currentUserIdRef.current !== senderId) break;
              for (const listener of messageListenersRef.current) {
                listener(acknowledgement.message);
              }
            } catch {
              break;
            }
          }
        })
      );
    } finally {
      isPendingQueueFlushRunningRef.current = false;
      if (pendingQueueFlushRequestedRef.current) {
        pendingQueueFlushRequestedRef.current = false;
        pendingQueueFlushRef.current();
      }
    }
  }, [confirmPendingMessage, user?.id]);
  pendingQueueFlushRef.current = () => {
    void flushPendingQueue();
  };

  const queueMessage = useCallback(
    async (payload: {
      conversationId: string;
      content: string;
    }): Promise<PendingMessage> => {
      if (!user?.id)
        throw new Error('Cannot queue a message while signed out.');

      const createdAtMilliseconds = Math.max(
        Date.now(),
        lastPendingTimestampRef.current + 1
      );
      lastPendingTimestampRef.current = createdAtMilliseconds;

      const pendingMessage: PendingMessage = {
        clientMessageId: createClientMessageId(),
        conversationId: payload.conversationId,
        senderId: user.id,
        content: payload.content,
        createdAt: new Date(createdAtMilliseconds).toISOString(),
      };

      pendingMutationRevisionRef.current += 1;
      setPendingMessages((current) => [...current, pendingMessage]);
      try {
        await addPendingMessage(pendingMessage);
      } catch (error: unknown) {
        setPendingMessages((current) =>
          current.filter(
            (message) =>
              message.clientMessageId !== pendingMessage.clientMessageId
          )
        );
        throw error;
      }

      try {
        const storedMessages = await getPendingMessages(user.id);
        if (currentUserIdRef.current === user.id) {
          setPendingMessages(storedMessages);
        }
      } catch {
        // The optimistic state is already durable; a later load will reconcile.
      }

      if (currentUserIdRef.current === user.id) {
        pendingQueueFlushRef.current();
      }
      return pendingMessage;
    },
    [user?.id]
  );

  useEffect(() => {
    let isActive = true;
    if (!user?.id) {
      pendingMutationRevisionRef.current += 1;
      setPendingMessages([]);
      return;
    }

    const senderId = user.id;
    const loadRevision = pendingMutationRevisionRef.current;
    setPendingMessages((current) =>
      current.filter((message) => message.senderId === senderId)
    );
    void getPendingMessages(senderId)
      .then((messages) => {
        if (!isActive || loadRevision !== pendingMutationRevisionRef.current) {
          return;
        }
        lastPendingTimestampRef.current = Math.max(
          lastPendingTimestampRef.current,
          ...messages.map((message) => Date.parse(message.createdAt))
        );
        setPendingMessages(messages);
        pendingQueueFlushRef.current();
      })
      .catch(() => {
        if (isActive) setPendingMessages([]);
      });

    return () => {
      isActive = false;
      pendingMutationRevisionRef.current += 1;
    };
  }, [user?.id]);

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
        deliveryRetryCountRef.current = 0;
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
      pendingMessages,
      queueMessage,
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
      pendingMessages,
      queueMessage,
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
