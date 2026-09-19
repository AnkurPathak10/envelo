import { router } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MessageBubble } from '@/components/chat/message-bubble';
import { MessageComposer } from '@/components/chat/message-composer';
import { colors, radius } from '@/constants/theme';
import { ApiError } from '@/lib/api/client';
import { getMessageHistory, type TextMessage } from '@/lib/api/conversations';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  mergeTextMessages,
  type RenderableTextMessage,
  updateMessageStatus,
} from '@/lib/chat/messages';
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
  const {
    acknowledgeDeliveredMessages,
    connectionState,
    connectionEpoch,
    markConversationRead,
    retryConnection,
    sendMessage,
    subscribeToNewMessages,
    subscribeToMessageStatuses,
  } = useSocket();
  const [messages, setMessages] = useState<RenderableTextMessage[]>([]);
  const [initialState, setInitialState] =
    useState<InitialHistoryState>('loading');
  const [initialError, setInitialError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [earlierError, setEarlierError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [isAppViewVisible, setIsAppViewVisible] = useState(
    isCurrentAppViewVisible
  );
  const listRef = useRef<FlatList<RenderableTextMessage>>(null);
  const pendingScroll = useRef<{ animated: boolean } | null>(null);
  const observedConnectionEpoch = useRef(connectionEpoch);
  const loadedConversationId = useRef<string | null>(null);
  const scheme = useColorScheme() ?? 'light';
  const c = colors[scheme];
  const styles = createStyles(c);

  const requestScrollToEnd = useCallback((animated: boolean): void => {
    pendingScroll.current = { animated };
  }, []);

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
    }

    void getMessageHistory(conversationId)
      .then((page) => {
        if (!isActive) return;
        acknowledgeDeliveredMessages(page.messages);
        setMessages((current) => mergeTextMessages(current, page.messages));
        setNextCursor(page.nextCursor);
        loadedConversationId.current = conversationId;
        setInitialState('loaded');
        requestScrollToEnd(false);
      })
      .catch((error: unknown) => {
        if (!isActive) return;
        if (
          isInitialLoad &&
          error instanceof ApiError &&
          error.status === 404
        ) {
          setInitialState('not-found');
          return;
        }
        if (!isInitialLoad) return;
        setInitialError(historyErrorMessage(error));
        setInitialState('error');
      });

    return () => {
      isActive = false;
    };
  }, [
    acknowledgeDeliveredMessages,
    conversationId,
    reloadVersion,
    requestScrollToEnd,
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
    } catch (error: unknown) {
      setEarlierError(historyErrorMessage(error));
    } finally {
      setIsLoadingEarlier(false);
    }
  }, [
    acknowledgeDeliveredMessages,
    conversationId,
    isLoadingEarlier,
    nextCursor,
  ]);

  const sendDraft = useCallback(async () => {
    const content = draft.trim();
    if (!content || isSending || connectionState !== 'connected') return;

    const draftAtSend = draft;
    setIsSending(true);
    setSendError(null);

    try {
      const acknowledgement = await sendMessage({ conversationId, content });
      if (!acknowledgement.ok) {
        setSendError(acknowledgement.error);
        return;
      }

      setMessages((current) =>
        mergeTextMessages(current, [
          withInitialStatus(acknowledgement.message, user?.id),
        ])
      );
      setDraft((current) => (current === draftAtSend ? '' : current));
      requestScrollToEnd(true);
    } catch {
      setSendError('Unable to send message. Please try again.');
    } finally {
      setIsSending(false);
    }
  }, [
    connectionState,
    conversationId,
    draft,
    isSending,
    requestScrollToEnd,
    sendMessage,
    user?.id,
  ]);

  const handleContentSizeChange = useCallback(() => {
    const scroll = pendingScroll.current;
    if (!scroll) return;
    pendingScroll.current = null;
    listRef.current?.scrollToEnd({ animated: scroll.animated });
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
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
        onContentSizeChange={handleContentSizeChange}
        ref={listRef}
        renderItem={({ item }) => (
          <MessageBubble
            isOutgoing={item.senderId === user?.id}
            message={item}
          />
        )}
        style={styles.list}
      />
      <SafeAreaView edges={['bottom']} style={styles.composerSafeArea}>
        <MessageComposer
          connectionState={connectionState}
          isSending={isSending}
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
    </KeyboardAvoidingView>
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
    composerSafeArea: { backgroundColor: c.bgBase },
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
