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
import type { CallAck, CallCommand, CallEvent } from '@/lib/calls/contracts';

import type {
  MessageReplyPreview,
  MessageStatus,
  TextMessage,
} from '@/lib/api/conversations';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  deletePendingMedia,
  persistPendingAudio,
  persistPendingMedia,
} from '@/lib/media/pendingMediaStorage';
import {
  uploadAudio,
  uploadImage,
  type PreparedAudio,
  type PreparedImage,
} from '@/lib/media/upload';
import {
  addPendingMessage,
  clearPendingMessageReply,
  createClientMessageId,
  getPendingMessages,
  removePendingMessage,
  removePendingMessagesForConversation,
  isPendingMediaMessage,
  isPendingAudioMessage,
  isPendingRemoteMediaMessage,
  type PendingMessage,
} from '@/lib/offline/pendingMessagesStore';

export interface MessageSendPayload {
  conversationId: string;
  content: string | null;
  mediaUrl?: string;
  audioDurationMs?: number;
  clientMessageId?: string;
  replyToId?: string;
}

export type SocketTextMessage = Omit<TextMessage, 'status'>;

export type MessageSendAcknowledgement =
  | { ok: true; message: SocketTextMessage }
  | {
      ok: false;
      error: string;
      code?: 'REPLY_TARGET_UNAVAILABLE';
    };

export type MessageStatusAcknowledgement =
  { success: true; updated: number } | { success: false; error: string };

export interface MessageStatusUpdate {
  messageId: string;
  status: Extract<MessageStatus, 'DELIVERED' | 'READ'>;
}

export interface ConversationVisibilityUpdate {
  conversationId: string;
  clearedAt: string | null;
  deletedAt: string | null;
}

export interface FriendRequestEvent {
  requestId: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
}

export type ConversationVisibilityAcknowledgement =
  | { success: true; visibility: ConversationVisibilityUpdate }
  | { success: false; error: string };

interface ServerToClientEvents {
  'call:incoming': (data: unknown) => void;
  'call:accepted': (data: unknown) => void;
  'call:declined': (data: unknown) => void;
  'call:missed': (data: unknown) => void;
  'call:ended': (data: unknown) => void;
  'call:ringing-timeout': (data: unknown) => void;
  'friend:request': (event: FriendRequestEvent) => void;
  'message:new': (message: SocketTextMessage) => void;
  'message:status': (update: MessageStatusUpdate) => void;
  'conversation:visibility': (update: ConversationVisibilityUpdate) => void;
}

interface ClientToServerEvents {
  'call:invite': (
    payload: { conversationId?: string; callId?: string; userId?: string },
    ack: (result: CallAck) => void
  ) => void;
  'call:accept': (
    payload: { conversationId?: string; callId?: string },
    ack: (result: CallAck) => void
  ) => void;
  'call:decline': (
    payload: { conversationId?: string; callId?: string },
    ack: (result: CallAck) => void
  ) => void;
  'call:end': (
    payload: { conversationId?: string; callId?: string },
    ack: (result: CallAck) => void
  ) => void;
  'call:video-enabled': (
    payload: { conversationId?: string; callId?: string },
    ack: (result: CallAck) => void
  ) => void;
  'call:sync': (
    payload: { conversationId?: string; callId?: string },
    ack: (result: CallAck) => void
  ) => void;
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
  'conversation:visibility:sync': (
    payload: { conversationId: string },
    acknowledge: (result: ConversationVisibilityAcknowledgement) => void
  ) => void;
  'conversation:visibility:clear': (
    payload: { conversationId: string },
    acknowledge: (result: ConversationVisibilityAcknowledgement) => void
  ) => void;
  'conversation:visibility:delete': (
    payload: { conversationId: string },
    acknowledge: (result: ConversationVisibilityAcknowledgement) => void
  ) => void;
}

type NewMessageListener = ServerToClientEvents['message:new'];
type FriendRequestListener = ServerToClientEvents['friend:request'];
type MessageStatusListener = ServerToClientEvents['message:status'];
type ConversationVisibilityListener =
  ServerToClientEvents['conversation:visibility'];
type EnveloSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type SocketConnectionState =
  | 'signed-out'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

interface SocketContextValue {
  requestCall: (
    event: CallCommand,
    payload: { conversationId?: string; callId?: string; userId?: string }
  ) => Promise<unknown>;
  subscribeToCalls: (
    listener: (event: CallEvent, data: unknown) => void
  ) => () => void;
  connectionState: SocketConnectionState;
  connectionEpoch: number;
  pendingMessages: PendingMessage[];
  queueMessage: (
    payload: {
      replyTo?: MessageReplyPreview | null;
    } & (
      | { conversationId: string; content: string; image?: never }
      | { conversationId: string; content: string | null; image: PreparedImage }
      | {
          conversationId: string;
          content: null;
          audio: PreparedAudio;
          image?: never;
        }
      | {
          conversationId: string;
          content: null;
          remoteMediaUrl: string;
          image?: never;
        }
    )
  ) => Promise<PendingMessage>;
  discardConversationQueue: (conversationId: string) => Promise<void>;
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
  syncConversationVisibility: (
    conversationId: string
  ) => Promise<ConversationVisibilityAcknowledgement>;
  clearConversationAcrossDevices: (
    conversationId: string
  ) => Promise<ConversationVisibilityUpdate>;
  deleteConversationAcrossDevices: (
    conversationId: string
  ) => Promise<ConversationVisibilityUpdate>;
  subscribeToNewMessages: (
    listener: ServerToClientEvents['message:new']
  ) => () => void;
  subscribeToFriendRequests: (listener: FriendRequestListener) => () => void;
  subscribeToMessageStatuses: (listener: MessageStatusListener) => () => void;
  subscribeToConversationVisibility: (
    listener: ConversationVisibilityListener
  ) => () => void;
}

const SocketContext = createContext<SocketContextValue | undefined>(undefined);
const SEND_TIMEOUT_MS = 20_000;
const DELIVERY_BATCH_DELAY_MS = 300;
const DELIVERY_RETRY_BASE_DELAY_MS = 500;
const MAX_DELIVERY_RETRIES = 3;
const MAX_DELIVERY_BATCH_SIZE = 100;
const PENDING_SEND_RETRY_BASE_DELAY_MS = 2_000;
const MAX_PENDING_SEND_RETRIES = 3;

function pendingMediaExtension(message: PendingMessage): string {
  return message.kind === 'audio'
    ? message.mediaFileName.split('.').pop() || 'm4a'
    : 'jpg';
}

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
  const callListenersRef = useRef(
    new Set<(event: CallEvent, data: unknown) => void>()
  );
  const requestCall = useCallback(
    (
      event: CallCommand,
      payload: { conversationId?: string; callId?: string; userId?: string }
    ): Promise<unknown> =>
      new Promise((resolve, reject) => {
        const socket = socketRef.current;
        if (!socket?.connected) {
          reject(new Error('Connect to the internet to use calls.'));
          return;
        }
        // Provider provisioning can exceed the message acknowledgement timeout.
        socket
          .timeout(70_000)
          .emit(event, payload, (error: Error | null, result: CallAck) => {
            if (error)
              reject(
                new Error(
                  'Call request timed out. Reconnecting to check its status.'
                )
              );
            else if (!result.ok) reject(new Error(result.error));
            else resolve(result.data);
          });
      }),
    []
  );
  const subscribeToCalls = useCallback(
    (listener: (event: CallEvent, data: unknown) => void) => {
      callListenersRef.current.add(listener);
      return () => {
        callListenersRef.current.delete(listener);
      };
    },
    []
  );
  const messageListenersRef = useRef(new Set<NewMessageListener>());
  const friendRequestListenersRef = useRef(new Set<FriendRequestListener>());
  const messageStatusListenersRef = useRef(new Set<MessageStatusListener>());
  const conversationVisibilityListenersRef = useRef(
    new Set<ConversationVisibilityListener>()
  );
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
  const pendingQueueRetryTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const pendingQueueRetryCountRef = useRef(0);
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
      pendingQueueRetryCountRef.current = 0;
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
      if (
        message.senderId === user?.id &&
        currentUserIdRef.current === user.id &&
        message.clientMessageId
      ) {
        void pendingConfirmationRef
          .current(message.clientMessageId)
          .catch(() => undefined);
      }
      for (const listener of messageListenersRef.current) listener(message);
    };
    const handleFriendRequest: FriendRequestListener = (event) => {
      for (const listener of friendRequestListenersRef.current) listener(event);
    };
    const handleMessageStatus: MessageStatusListener = (update) => {
      for (const listener of messageStatusListenersRef.current)
        listener(update);
    };
    const handleConversationVisibility: ConversationVisibilityListener = (
      update
    ) => {
      for (const listener of conversationVisibilityListenersRef.current) {
        listener(update);
      }
    };

    socket.on('connect', handleConnect);
    const callEvents: CallEvent[] = [
      'call:incoming',
      'call:accepted',
      'call:declined',
      'call:missed',
      'call:ended',
      'call:ringing-timeout',
    ];
    const callHandlers = callEvents.map((event) => {
      const handler = (data: unknown) => {
        for (const listener of callListenersRef.current) listener(event, data);
      };
      socket.on(event, handler);
      return { event, handler };
    });
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('message:new', handleNewMessage);
    socket.on('friend:request', handleFriendRequest);
    socket.on('message:status', handleMessageStatus);
    socket.on('conversation:visibility', handleConversationVisibility);
    socket.io.on('reconnect_attempt', handleReconnectAttempt);
    socket.io.on('reconnect_failed', handleReconnectFailed);
    socket.connect();

    return () => {
      socket.off('connect', handleConnect);
      for (const { event, handler } of callHandlers) socket.off(event, handler);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('message:new', handleNewMessage);
      socket.off('friend:request', handleFriendRequest);
      socket.off('message:status', handleMessageStatus);
      socket.off('conversation:visibility', handleConversationVisibility);
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
      const queued = (await getPendingMessages(senderId)).find(
        (message) => message.clientMessageId === clientMessageId
      );
      await removePendingMessage(senderId, clientMessageId);
      if (
        queued &&
        (isPendingMediaMessage(queued) || isPendingAudioMessage(queued))
      ) {
        try {
          await deletePendingMedia(
            senderId,
            clientMessageId,
            pendingMediaExtension(queued)
          );
        } catch (error) {
          console.warn('Unable to remove confirmed local media.', error);
        }
      }
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
    let shouldRetry = false;
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
              const mediaUrl = isPendingMediaMessage(pendingMessage)
                ? await uploadImage(
                    {
                      uri: pendingMessage.mediaLocalUri,
                      fileName: pendingMessage.mediaFileName,
                      mimeType: pendingMessage.mediaMimeType,
                    },
                    true
                  )
                : isPendingAudioMessage(pendingMessage)
                  ? await uploadAudio(
                      {
                        uri: pendingMessage.mediaLocalUri,
                        fileName: pendingMessage.mediaFileName,
                        mimeType: pendingMessage.mediaMimeType,
                        durationMs: pendingMessage.audioDurationMs,
                      },
                      true
                    )
                  : isPendingRemoteMediaMessage(pendingMessage)
                    ? pendingMessage.mediaUrl
                    : undefined;
              if (
                currentUserIdRef.current !== senderId ||
                socketRef.current !== flushSocket ||
                !flushSocket.connected
              ) {
                break;
              }
              const acknowledgement = await sendMessageThroughSocket(
                flushSocket,
                {
                  conversationId: pendingMessage.conversationId,
                  content: pendingMessage.content,
                  mediaUrl,
                  audioDurationMs: isPendingAudioMessage(pendingMessage)
                    ? pendingMessage.audioDurationMs
                    : undefined,
                  clientMessageId: pendingMessage.clientMessageId,
                  replyToId: pendingMessage.replyTo?.id,
                }
              );
              let resolvedAcknowledgement = acknowledgement;
              if (
                !resolvedAcknowledgement.ok &&
                resolvedAcknowledgement.code === 'REPLY_TARGET_UNAVAILABLE' &&
                pendingMessage.replyTo
              ) {
                pendingMutationRevisionRef.current += 1;
                const updatedPendingMessage = await clearPendingMessageReply(
                  senderId,
                  pendingMessage.clientMessageId
                );
                if (!updatedPendingMessage) break;
                if (
                  currentUserIdRef.current !== senderId ||
                  socketRef.current !== flushSocket ||
                  !flushSocket.connected
                ) {
                  break;
                }
                setPendingMessages((current) =>
                  current.map((message) =>
                    message.clientMessageId === pendingMessage.clientMessageId
                      ? updatedPendingMessage
                      : message
                  )
                );
                resolvedAcknowledgement = await sendMessageThroughSocket(
                  flushSocket,
                  {
                    conversationId: pendingMessage.conversationId,
                    content: pendingMessage.content,
                    mediaUrl,
                    audioDurationMs: isPendingAudioMessage(pendingMessage)
                      ? pendingMessage.audioDurationMs
                      : undefined,
                    clientMessageId: pendingMessage.clientMessageId,
                  }
                );
              }
              if (!resolvedAcknowledgement.ok) {
                if (
                  resolvedAcknowledgement.error === 'Unable to send message'
                ) {
                  shouldRetry = true;
                }
                break;
              }

              await confirmPendingMessage(pendingMessage.clientMessageId);
              pendingQueueRetryCountRef.current = 0;
              if (currentUserIdRef.current !== senderId) break;
              for (const listener of messageListenersRef.current) {
                listener(resolvedAcknowledgement.message);
              }
            } catch {
              shouldRetry = true;
              break;
            }
          }
        })
      );
    } catch {
      shouldRetry = true;
    } finally {
      isPendingQueueFlushRunningRef.current = false;
      if (pendingQueueFlushRequestedRef.current) {
        pendingQueueFlushRequestedRef.current = false;
        pendingQueueFlushRef.current();
      } else if (
        shouldRetry &&
        currentUserIdRef.current === senderId &&
        socketRef.current === flushSocket &&
        flushSocket.connected &&
        pendingQueueRetryCountRef.current < MAX_PENDING_SEND_RETRIES &&
        !pendingQueueRetryTimerRef.current
      ) {
        const retryDelay =
          PENDING_SEND_RETRY_BASE_DELAY_MS *
          2 ** pendingQueueRetryCountRef.current;
        pendingQueueRetryCountRef.current += 1;
        pendingQueueRetryTimerRef.current = setTimeout(() => {
          pendingQueueRetryTimerRef.current = null;
          pendingQueueFlushRef.current();
        }, retryDelay);
      }
    }
  }, [confirmPendingMessage, user?.id]);
  pendingQueueFlushRef.current = () => {
    if (pendingQueueRetryTimerRef.current) {
      clearTimeout(pendingQueueRetryTimerRef.current);
      pendingQueueRetryTimerRef.current = null;
    }
    void flushPendingQueue();
  };

  useEffect(
    () => () => {
      if (pendingQueueRetryTimerRef.current) {
        clearTimeout(pendingQueueRetryTimerRef.current);
        pendingQueueRetryTimerRef.current = null;
      }
      pendingQueueRetryCountRef.current = 0;
    },
    [user?.id]
  );

  const queueMessage = useCallback(
    async (
      payload: {
        replyTo?: MessageReplyPreview | null;
      } & (
        | { conversationId: string; content: string; image?: never }
        | {
            conversationId: string;
            content: string | null;
            image: PreparedImage;
          }
        | {
            conversationId: string;
            content: null;
            audio: PreparedAudio;
            image?: never;
          }
        | {
            conversationId: string;
            content: null;
            remoteMediaUrl: string;
            image?: never;
          }
      )
    ): Promise<PendingMessage> => {
      if (!user?.id)
        throw new Error('Cannot queue a message while signed out.');
      const senderId = user.id;
      const clientMessageId = createClientMessageId();

      const createdAtMilliseconds = Math.max(
        Date.now(),
        lastPendingTimestampRef.current + 1
      );
      lastPendingTimestampRef.current = createdAtMilliseconds;

      const common = {
        clientMessageId,
        conversationId: payload.conversationId,
        senderId,
        createdAt: new Date(createdAtMilliseconds).toISOString(),
        replyTo: payload.replyTo ?? null,
      };
      let pendingMessage: PendingMessage;
      if ('audio' in payload) {
        const mediaLocalUri = await persistPendingAudio(
          payload.audio,
          senderId,
          clientMessageId
        );
        if (currentUserIdRef.current !== senderId) {
          await deletePendingMedia(
            senderId,
            clientMessageId,
            payload.audio.fileName.split('.').pop() || 'm4a'
          );
          throw new Error('Account changed before the recording was saved.');
        }
        pendingMessage = {
          ...common,
          kind: 'audio',
          content: null,
          mediaLocalUri,
          mediaFileName: payload.audio.fileName,
          mediaMimeType: payload.audio.mimeType,
          audioDurationMs: payload.audio.durationMs,
        };
      } else if (payload.image) {
        const mediaLocalUri = await persistPendingMedia(
          payload.image,
          senderId,
          clientMessageId
        );
        if (currentUserIdRef.current !== senderId) {
          await deletePendingMedia(senderId, clientMessageId);
          throw new Error('Account changed before the photo was saved.');
        }
        pendingMessage = {
          ...common,
          kind: 'media',
          content: payload.content,
          mediaLocalUri,
          mediaFileName: payload.image.fileName,
          mediaMimeType: payload.image.mimeType,
        };
      } else if ('remoteMediaUrl' in payload) {
        pendingMessage = {
          ...common,
          kind: 'remote-media',
          content: null,
          mediaUrl: payload.remoteMediaUrl,
        };
      } else {
        pendingMessage = { ...common, kind: 'text', content: payload.content };
      }

      pendingMutationRevisionRef.current += 1;
      setPendingMessages((current) => [...current, pendingMessage]);
      try {
        await addPendingMessage(pendingMessage);
      } catch (error: unknown) {
        if (
          isPendingMediaMessage(pendingMessage) ||
          isPendingAudioMessage(pendingMessage)
        ) {
          await deletePendingMedia(
            senderId,
            clientMessageId,
            pendingMediaExtension(pendingMessage)
          ).catch(() => undefined);
        }
        setPendingMessages((current) =>
          current.filter(
            (message) =>
              message.clientMessageId !== pendingMessage.clientMessageId
          )
        );
        throw error;
      }

      try {
        const storedMessages = await getPendingMessages(senderId);
        if (currentUserIdRef.current === senderId) {
          setPendingMessages(storedMessages);
        }
      } catch {
        // The optimistic state is already durable; a later load will reconcile.
      }

      if (currentUserIdRef.current === senderId) {
        pendingQueueRetryCountRef.current = 0;
        pendingQueueFlushRef.current();
      }
      return pendingMessage;
    },
    [user?.id]
  );

  const discardConversationQueue = useCallback(
    async (conversationId: string): Promise<void> => {
      if (!user?.id) return;
      const senderId = user.id;
      pendingMutationRevisionRef.current += 1;
      const removed = await removePendingMessagesForConversation(
        senderId,
        conversationId
      );
      await Promise.all(
        removed
          .filter(
            (message) =>
              isPendingMediaMessage(message) || isPendingAudioMessage(message)
          )
          .map((message) =>
            deletePendingMedia(
              senderId,
              message.clientMessageId,
              pendingMediaExtension(message)
            ).catch(() => undefined)
          )
      );
      if (currentUserIdRef.current !== senderId) return;
      setPendingMessages((current) =>
        current.filter((message) => message.conversationId !== conversationId)
      );
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

  const subscribeToFriendRequests = useCallback(
    (listener: FriendRequestListener): (() => void) => {
      friendRequestListenersRef.current.add(listener);
      return () => friendRequestListenersRef.current.delete(listener);
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

  const syncConversationVisibility = useCallback(
    (conversationId: string): Promise<ConversationVisibilityAcknowledgement> =>
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
          reject(new Error('Socket disconnected before synchronization.'));
        };
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Conversation synchronization timed out.'));
        }, SEND_TIMEOUT_MS);

        socket.once('disconnect', handleDisconnect);
        socket.emit(
          'conversation:visibility:sync',
          { conversationId },
          (result) => {
            cleanup();
            resolve(result);
          }
        );
      }),
    []
  );

  const mutateConversationVisibility = useCallback(
    (
      event: 'conversation:visibility:clear' | 'conversation:visibility:delete',
      conversationId: string
    ): Promise<ConversationVisibilityUpdate> =>
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
          reject(new Error('Socket disconnected before saving the change.'));
        };
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Conversation update timed out.'));
        }, SEND_TIMEOUT_MS);

        socket.once('disconnect', handleDisconnect);
        socket.emit(event, { conversationId }, (result) => {
          cleanup();
          if (!result.success) {
            reject(new Error(result.error));
            return;
          }
          resolve(result.visibility);
        });
      }),
    []
  );

  const clearConversationAcrossDevices = useCallback(
    (conversationId: string): Promise<ConversationVisibilityUpdate> =>
      mutateConversationVisibility(
        'conversation:visibility:clear',
        conversationId
      ),
    [mutateConversationVisibility]
  );

  const deleteConversationAcrossDevices = useCallback(
    (conversationId: string): Promise<ConversationVisibilityUpdate> =>
      mutateConversationVisibility(
        'conversation:visibility:delete',
        conversationId
      ),
    [mutateConversationVisibility]
  );

  const subscribeToConversationVisibility = useCallback(
    (listener: ConversationVisibilityListener): (() => void) => {
      conversationVisibilityListenersRef.current.add(listener);
      return () => {
        conversationVisibilityListenersRef.current.delete(listener);
      };
    },
    []
  );

  const value = useMemo(
    () => ({
      requestCall,
      subscribeToCalls,
      connectionState,
      connectionEpoch,
      pendingMessages,
      queueMessage,
      discardConversationQueue,
      acknowledgeDeliveredMessages,
      markConversationRead,
      syncConversationVisibility,
      clearConversationAcrossDevices,
      deleteConversationAcrossDevices,
      retryConnection,
      sendMessage,
      subscribeToNewMessages,
      subscribeToFriendRequests,
      subscribeToMessageStatuses,
      subscribeToConversationVisibility,
    }),
    [
      requestCall,
      subscribeToCalls,
      connectionEpoch,
      connectionState,
      pendingMessages,
      queueMessage,
      discardConversationQueue,
      acknowledgeDeliveredMessages,
      markConversationRead,
      syncConversationVisibility,
      clearConversationAcrossDevices,
      deleteConversationAcrossDevices,
      retryConnection,
      sendMessage,
      subscribeToNewMessages,
      subscribeToFriendRequests,
      subscribeToMessageStatuses,
      subscribeToConversationVisibility,
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
