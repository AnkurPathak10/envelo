import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { getMessageHistory } from '@/lib/api/conversations';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  mergeTextMessages,
  type RenderableTextMessage,
} from '@/lib/chat/messages';
import { useSocket } from '@/lib/socket/SocketContext';

interface ChatScreenProps {
  conversationId: string;
}

type InitialHistoryState = 'loading' | 'loaded' | 'error' | 'not-found';

function historyErrorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Unable to load messages. Please try again.';
}

export function ChatScreen({ conversationId }: ChatScreenProps) {
  const { user } = useAuth();
  const { connectionState, sendMessage, subscribeToNewMessages } = useSocket();
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
  const listRef = useRef<FlatList<RenderableTextMessage>>(null);
  const pendingScroll = useRef<{ animated: boolean } | null>(null);
  const scheme = useColorScheme() ?? 'light';
  const c = colors[scheme];
  const styles = createStyles(c);

  const requestScrollToEnd = useCallback((animated: boolean): void => {
    pendingScroll.current = { animated };
  }, []);

  useEffect(() => {
    if (!conversationId) {
      setInitialState('not-found');
      return;
    }

    let isActive = true;
    setInitialState('loading');
    setInitialError(null);

    void getMessageHistory(conversationId)
      .then((page) => {
        if (!isActive) return;
        setMessages((current) => mergeTextMessages(current, page.messages));
        setNextCursor(page.nextCursor);
        setInitialState('loaded');
        requestScrollToEnd(false);
      })
      .catch((error: unknown) => {
        if (!isActive) return;
        if (error instanceof ApiError && error.status === 404) {
          setInitialState('not-found');
          return;
        }
        setInitialError(historyErrorMessage(error));
        setInitialState('error');
      });

    return () => {
      isActive = false;
    };
  }, [conversationId, reloadVersion, requestScrollToEnd]);

  useEffect(
    () =>
      subscribeToNewMessages((message) => {
        if (message.conversationId !== conversationId) return;
        setMessages((current) => mergeTextMessages(current, [message]));
        requestScrollToEnd(true);
      }),
    [conversationId, requestScrollToEnd, subscribeToNewMessages]
  );

  const loadEarlier = useCallback(async () => {
    if (!nextCursor || isLoadingEarlier) return;
    setIsLoadingEarlier(true);
    setEarlierError(null);
    pendingScroll.current = null;

    try {
      const page = await getMessageHistory(conversationId, nextCursor);
      setMessages((current) => mergeTextMessages(current, page.messages));
      setNextCursor(page.nextCursor);
    } catch (error: unknown) {
      setEarlierError(historyErrorMessage(error));
    } finally {
      setIsLoadingEarlier(false);
    }
  }, [conversationId, isLoadingEarlier, nextCursor]);

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
        mergeTextMessages(current, [acknowledgement.message])
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
