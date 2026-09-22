import { router } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  KeyboardStickyView,
  useKeyboardController,
} from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MessageBubble } from '@/components/chat/message-bubble';
import { MessageComposer } from '@/components/chat/message-composer';
import { colors, radius } from '@/constants/theme';
import { ApiError, isConnectivityError } from '@/lib/api/client';
import { getMessageHistory, type TextMessage } from '@/lib/api/conversations';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';
import {
  cacheMessageHistoryPage,
  getCachedMessageHistory,
  removeCachedMessageHistory,
} from '@/lib/cache/messageCache';
import {
  mergeTextMessages,
  type RenderableTextMessage,
  toPendingTextMessage,
  updateMessageStatus,
} from '@/lib/chat/messages';
import { pickCompressedImage, uploadImage } from '@/lib/media/upload';
import { createClientMessageId } from '@/lib/offline/pendingMessagesStore';
import { useSocket, type SocketTextMessage } from '@/lib/socket/SocketContext';

interface ChatScreenProps {
  conversationId: string;
}

type InitialHistoryState = 'loading' | 'loaded' | 'error' | 'not-found';

function historyErrorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Unable to load messages. Please try again.';
}

function withInitialStatus(
  message: SocketTextMessage,
  currentUserId: string | undefined
): TextMessage {
  return {
    ...message,
    status: message.senderId === currentUserId ? 'SENT' : null,
  };
}

function isCurrentAppViewVisible(): boolean {
  if (Platform.OS === 'web') {
    return typeof document !== 'undefined'
      ? document.visibilityState === 'visible'
      : false;
  }

  return AppState.currentState === 'active';
}

export function ChatScreen({ conversationId }: ChatScreenProps) {
  const { user } = useAuth();
  const isFocused = useIsFocused();
  const { setEnabled: setKeyboardControllerEnabled } = useKeyboardController();
  const {
    acknowledgeDeliveredMessages,
    connectionState,
    connectionEpoch,
    markConversationRead,
    pendingMessages,
    queueMessage,
    retryConnection,
    sendMessage,
    subscribeToNewMessages,
    subscribeToMessageStatuses,
  } = useSocket();
  const [messages, setMessages] = useState<RenderableTextMessage[]>([]);
  const [initialState, setInitialState] =
    useState<InitialHistoryState>('loading');
  const [initialError, setInitialError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [earlierError, setEarlierError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isMediaBusy, setIsMediaBusy] = useState(false);
  const [mediaRetry, setMediaRetry] = useState<{
    clientMessageId: string;
    mediaUrl: string;
  } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [isAppViewVisible, setIsAppViewVisible] = useState(
    isCurrentAppViewVisible
  );
  const listRef = useRef<FlatList<RenderableTextMessage>>(null);
  const pendingScroll = useRef<{
    animated: boolean;
    remainingFrames: number;
  } | null>(null);
  const isScrollFlushScheduled = useRef(false);
  const observedConnectionEpoch = useRef(connectionEpoch);
  const loadedConversationId = useRef<string | null>(null);
  const pendingMessagesRef = useRef(pendingMessages);
  pendingMessagesRef.current = pendingMessages;
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const styles = createStyles(c);

  const requestScrollToEnd = useCallback((animated: boolean): void => {
    const currentRequest = pendingScroll.current;
    if (currentRequest) {
      currentRequest.animated = animated;
      currentRequest.remainingFrames = animated ? 1 : 4;
      return;
    }

    pendingScroll.current = {
      animated,
      // Initial rendering can report its layout before all variable-height rows
      // have been measured. A few non-animated frames make the opening position
      // deterministic without affecting a user's later scroll position.
      remainingFrames: animated ? 1 : 4,
    };
  }, []);

  useEffect(() => {
    if (!isFocused) return;

    setKeyboardControllerEnabled(true);
    return () => setKeyboardControllerEnabled(false);
  }, [isFocused, setKeyboardControllerEnabled]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return;

      const handleVisibilityChange = (): void => {
        setIsAppViewVisible(document.visibilityState === 'visible');
      };
      handleVisibilityChange();
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        document.removeEventListener(
          'visibilitychange',
          handleVisibilityChange
        );
      };
    }

    const handleAppStateChange = (nextState: AppStateStatus): void => {
      setIsAppViewVisible(nextState === 'active');
    };
    handleAppStateChange(AppState.currentState);
    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!conversationId) {
      setInitialState('not-found');
      return;
    }

    let isActive = true;
    const isInitialLoad = loadedConversationId.current !== conversationId;
    if (isInitialLoad) {
      setInitialState('loading');
      setInitialError(null);
      setIsOffline(false);
      setNextCursor(null);
      setMessages((current) =>
        current.filter((message) => message.conversationId === conversationId)
      );
    }

    const loadHistory = async (): Promise<void> => {
      const cachedPromise =
        isInitialLoad && user?.id
          ? getCachedMessageHistory(user.id, conversationId).catch(() => null)
          : Promise.resolve(null);
      const livePromise = getMessageHistory(conversationId).then(
        (page) => ({ ok: true as const, page }),
        (error: unknown) => ({ ok: false as const, error })
      );
      const cached = await cachedPromise;

      if (isActive && cached) {
        setMessages((current) =>
          mergeTextMessages(
            current.filter(
              (message) => message.conversationId === conversationId
            ),
            cached.messages
          )
        );
        setNextCursor(cached.nextCursor);
        loadedConversationId.current = conversationId;
        if (isInitialLoad) requestScrollToEnd(false);
        setInitialState('loaded');
      }

      try {
        const liveResult = await livePromise;
        if (!liveResult.ok) throw liveResult.error;
        const { page } = liveResult;
        if (user?.id) {
          void cacheMessageHistoryPage(user.id, conversationId, page).catch(
            () => undefined
          );
        }
        if (!isActive) return;
        acknowledgeDeliveredMessages(page.messages);
        setMessages((current) =>
          mergeTextMessages(
            current.filter(
              (message) => message.conversationId === conversationId
            ),
            page.messages
          )
        );
        setNextCursor(
          page.nextCursor === null
            ? null
            : cached
              ? cached.nextCursor
              : page.nextCursor
        );
        loadedConversationId.current = conversationId;
        setInitialError(null);
        setIsOffline(false);
        if (isInitialLoad) requestScrollToEnd(false);
        setInitialState('loaded');
      } catch (error: unknown) {
        if (!isActive) return;
        if (error instanceof ApiError && error.status === 404) {
          if (user?.id) {
            void removeCachedMessageHistory(user.id, conversationId).catch(
              () => undefined
            );
          }
          loadedConversationId.current = null;
          setIsOffline(false);
          setInitialState('not-found');
          return;
        }

        const hasPendingMessages = pendingMessagesRef.current.some(
          (message) => message.conversationId === conversationId
        );
        if (isConnectivityError(error)) {
          setIsOffline(true);
          if (cached || hasPendingMessages || !isInitialLoad) {
            loadedConversationId.current = conversationId;
            setInitialState('loaded');
            return;
          }
        } else if (!isInitialLoad) {
          return;
        }

        loadedConversationId.current = null;
        setInitialError(historyErrorMessage(error));
        setInitialState('error');
      }
    };

    void loadHistory();

    return () => {
      isActive = false;
    };
  }, [
    acknowledgeDeliveredMessages,
    conversationId,
    reloadVersion,
    requestScrollToEnd,
    user?.id,
  ]);

  useEffect(() => {
    if (observedConnectionEpoch.current === connectionEpoch) return;

    observedConnectionEpoch.current = connectionEpoch;
    setReloadVersion((version) => version + 1);
  }, [connectionEpoch]);

  useEffect(
    () =>
      subscribeToNewMessages((message) => {
        if (message.conversationId !== conversationId) return;
        setMessages((current) =>
          mergeTextMessages(current, [withInitialStatus(message, user?.id)])
        );
        requestScrollToEnd(true);
      }),
    [conversationId, requestScrollToEnd, subscribeToNewMessages, user?.id]
  );

  useEffect(() => {
    const conversationPendingMessages = pendingMessages
      .filter(
        (message) =>
          message.conversationId === conversationId &&
          message.senderId === user?.id
      )
      .map(toPendingTextMessage);
    const pendingClientIds = new Set(
      conversationPendingMessages.map((message) => message.clientMessageId)
    );

    setMessages((current) =>
      mergeTextMessages(
        current.filter(
          (message) =>
            message.status !== 'PENDING' ||
            (message.clientMessageId !== null &&
              message.clientMessageId !== undefined &&
              pendingClientIds.has(message.clientMessageId))
        ),
        conversationPendingMessages
      )
    );
    if (conversationPendingMessages.length === 0) return;
    setInitialState((current) =>
      current === 'loading' || current === 'error' ? 'loaded' : current
    );
  }, [conversationId, pendingMessages, user?.id]);

  useEffect(
    () =>
      subscribeToMessageStatuses(({ messageId, status }) => {
        setMessages((current) =>
          updateMessageStatus(current, messageId, status)
        );
      }),
    [subscribeToMessageStatuses]
  );

  let latestIncomingMessageId: string | null = null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].senderId !== user?.id) {
      latestIncomingMessageId = messages[index].id;
      break;
    }
  }

  useEffect(() => {
    if (
      !isFocused ||
      !isAppViewVisible ||
      !isCurrentAppViewVisible() ||
      connectionState !== 'connected' ||
      !latestIncomingMessageId
    ) {
      return;
    }

    void markConversationRead({
      conversationId,
      upToMessageId: latestIncomingMessageId,
    }).catch(() => undefined);
  }, [
    connectionState,
    conversationId,
    isAppViewVisible,
    isFocused,
    latestIncomingMessageId,
    markConversationRead,
  ]);

  const loadEarlier = useCallback(async () => {
    if (!nextCursor || isLoadingEarlier) return;
    setIsLoadingEarlier(true);
    setEarlierError(null);
    pendingScroll.current = null;

    try {
      const page = await getMessageHistory(conversationId, nextCursor);
      acknowledgeDeliveredMessages(page.messages);
      setMessages((current) => mergeTextMessages(current, page.messages));
      setNextCursor(page.nextCursor);
      setIsOffline(false);
      if (user?.id) {
        void cacheMessageHistoryPage(
          user.id,
          conversationId,
          page,
          nextCursor
        ).catch(() => undefined);
      }
    } catch (error: unknown) {
      if (isConnectivityError(error)) {
        setIsOffline(true);
        setEarlierError("Can't load earlier messages while offline.");
      } else {
        setEarlierError(historyErrorMessage(error));
      }
    } finally {
      setIsLoadingEarlier(false);
    }
  }, [
    acknowledgeDeliveredMessages,
    conversationId,
    isLoadingEarlier,
    nextCursor,
    user?.id,
  ]);

  const sendDraft = useCallback(async () => {
    const content = draft.trim();
    if (!content || !user?.id || isSending) return;

    const draftAtSend = draft;
    setIsSending(true);
    setSendError(null);

    try {
      requestScrollToEnd(true);
      await queueMessage({ conversationId, content });
      setDraft((current) => (current === draftAtSend ? '' : current));
    } catch {
      setSendError('Unable to save this message. Please try again.');
    } finally {
      setIsSending(false);
    }
  }, [
    conversationId,
    draft,
    isSending,
    queueMessage,
    requestScrollToEnd,
    user?.id,
  ]);

  const attachAndSendPhoto = useCallback(async () => {
    if (isMediaBusy || isSending) return;
    if (connectionState !== 'connected') {
      setSendError(
        "Can't send photos while offline — try again once you're connected."
      );
      return;
    }

    setIsMediaBusy(true);
    setSendError(null);
    const draftAtSend = draft;

    try {
      let media = mediaRetry;
      if (!media) {
        const image = await pickCompressedImage();
        if (!image) return;
        const mediaUrl = await uploadImage(image);
        media = { mediaUrl, clientMessageId: createClientMessageId() };
        setMediaRetry(media);
      }

      const acknowledgement = await sendMessage({
        conversationId,
        content: draftAtSend.trim() || null,
        mediaUrl: media.mediaUrl,
        clientMessageId: media.clientMessageId,
      });
      if (!acknowledgement.ok) throw new Error(acknowledgement.error);

      requestScrollToEnd(true);
      setMediaRetry(null);
      setDraft((current) => (current === draftAtSend ? '' : current));
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to send this photo. Please try again.';
      setSendError(`${message} Tap the photo button to retry.`);
    } finally {
      setIsMediaBusy(false);
    }
  }, [
    connectionState,
    conversationId,
    draft,
    isMediaBusy,
    isSending,
    mediaRetry,
    requestScrollToEnd,
    sendMessage,
  ]);

  const flushPendingScroll = useCallback(() => {
    const requestedScroll = pendingScroll.current;
    if (!requestedScroll || isScrollFlushScheduled.current) return;

    const scrollToEnd = (): void => {
      if (pendingScroll.current !== requestedScroll) {
        isScrollFlushScheduled.current = false;
        return;
      }
      listRef.current?.scrollToEnd({ animated: requestedScroll.animated });
      requestedScroll.remainingFrames -= 1;

      if (requestedScroll.remainingFrames > 0) {
        requestAnimationFrame(scrollToEnd);
        return;
      }

      pendingScroll.current = null;
      isScrollFlushScheduled.current = false;
    };

    isScrollFlushScheduled.current = true;
    requestAnimationFrame(scrollToEnd);
  }, []);

  const retryInitialHistory = useCallback(() => {
    setReloadVersion((version) => version + 1);
  }, []);

  if (initialState === 'loading') {
    return (
      <View style={styles.centeredState}>
        <ActivityIndicator color={c.accentPrimary} size="large" />
        <Text style={styles.stateText}>Loading messages…</Text>
      </View>
    );
  }

  if (initialState === 'error') {
    return (
      <View style={styles.centeredState}>
        <Text style={styles.errorText}>{initialError}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={retryInitialHistory}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (initialState === 'not-found') {
    return (
      <View style={styles.centeredState}>
        <Text style={styles.stateTitle}>Conversation unavailable</Text>
        <Text style={styles.stateText}>
          This conversation could not be opened.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isOffline ? (
        <View style={styles.offlineNotice}>
          <Text style={styles.offlineNoticeText}>
            You&apos;re offline — showing saved messages
          </Text>
        </View>
      ) : null}
      <FlatList
        contentContainerStyle={[
          styles.listContent,
          messages.length === 0 && styles.emptyList,
        ]}
        data={messages}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(message) => message.id}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.stateTitle}>No messages yet</Text>
            <Text style={styles.stateText}>Start the conversation below.</Text>
          </View>
        }
        ListHeaderComponent={
          nextCursor ? (
            <View style={styles.earlierContainer}>
              {earlierError ? (
                <Text style={styles.earlierError}>{earlierError}</Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                disabled={isLoadingEarlier}
                onPress={() => void loadEarlier()}
                style={({ pressed }) => [
                  styles.earlierButton,
                  isLoadingEarlier && styles.earlierButtonDisabled,
                  pressed && !isLoadingEarlier && styles.earlierButtonPressed,
                ]}
              >
                <Text style={styles.earlierButtonText}>
                  {isLoadingEarlier
                    ? 'Loading earlier messages…'
                    : 'Load earlier messages'}
                </Text>
              </Pressable>
            </View>
          ) : null
        }
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onContentSizeChange={flushPendingScroll}
        onLayout={flushPendingScroll}
        ref={listRef}
        renderItem={({ item }) => (
          <MessageBubble
            isOutgoing={item.senderId === user?.id}
            message={item}
          />
        )}
        style={styles.list}
      />
      <KeyboardStickyView>
        <SafeAreaView edges={['bottom']} style={styles.composerSafeArea}>
          <MessageComposer
            connectionState={connectionState}
            isMediaBusy={isMediaBusy || isSending}
            isSending={isSending}
            onAttach={() => void attachAndSendPhoto()}
            onChangeText={(value) => {
              setDraft(value);
              if (sendError) setSendError(null);
            }}
            onRetryConnection={retryConnection}
            onSend={() => void sendDraft()}
            sendError={sendError}
            value={draft}
          />
        </SafeAreaView>
      </KeyboardStickyView>
    </View>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    centeredState: {
      alignItems: 'center',
      backgroundColor: c.bgBase,
      flex: 1,
      justifyContent: 'center',
      padding: 32,
    },
    composerSafeArea: { backgroundColor: c.bgBase, paddingBottom: 8 },
    container: { backgroundColor: c.bgBase, flex: 1 },
    earlierButton: {
      borderColor: c.border,
      borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    earlierButtonDisabled: { opacity: 0.5 },
    earlierButtonPressed: { backgroundColor: c.bgSurface },
    earlierButtonText: {
      color: c.accentPrimary,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
    },
    earlierContainer: { alignItems: 'center', marginBottom: 12 },
    earlierError: {
      color: c.error,
      fontSize: 13,
      marginBottom: 8,
      textAlign: 'center',
    },
    emptyList: { flexGrow: 1 },
    emptyState: { alignItems: 'center', flex: 1, justifyContent: 'center' },
    errorText: {
      color: c.error,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
    },
    list: { flex: 1 },
    listContent: { paddingHorizontal: 12, paddingVertical: 12 },
    offlineNotice: {
      alignItems: 'center',
      backgroundColor: c.bgSurface,
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 16,
      paddingVertical: 7,
    },
    offlineNoticeText: { color: c.textMuted, fontSize: 12 },
    primaryButton: {
      backgroundColor: c.accentPrimary,
      borderRadius: radius.sm,
      marginTop: 20,
      paddingHorizontal: 18,
      paddingVertical: 12,
    },
    primaryButtonText: { color: c.bgBase, fontSize: 15, fontWeight: '600' },
    stateText: {
      color: c.textMuted,
      fontSize: 15,
      lineHeight: 22,
      marginTop: 8,
      textAlign: 'center',
    },
    stateTitle: { color: c.textPrimary, fontSize: 19, fontWeight: '600' },
  });
