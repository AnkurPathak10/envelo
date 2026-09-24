import { router } from 'expo-router';
import * as Contacts from 'expo-contacts';
import * as Location from 'expo-location';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  FlatList,
  InteractionManager,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  KeyboardEvents,
  KeyboardStickyView,
  useKeyboardController,
} from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MessageBubble } from '@/components/chat/message-bubble';
import { MessageComposer } from '@/components/chat/message-composer';
import { messagingColors as colors, radius } from '@/constants/theme';
import { ApiError, isConnectivityError } from '@/lib/api/client';
import {
  getMessageHistory,
  searchConversationMessages,
  type TextMessage,
} from '@/lib/api/conversations';
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
import { getPendingMediaPreviewUri } from '@/lib/media/pendingMediaStorage';
import type { GifResult } from '@/lib/giphy';
import {
  captureCompressedImage,
  pickCompressedImage,
  prepareImageSource,
  type ImageSource,
  type PreparedImage,
} from '@/lib/media/upload';
import { isPendingMediaMessage } from '@/lib/offline/pendingMessagesStore';
import { useSocket, type SocketTextMessage } from '@/lib/socket/SocketContext';

interface ChatScreenProps {
  conversationId: string;
  isSearchOpen?: boolean;
  searchQuery?: string;
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

export function ChatScreen({
  conversationId,
  isSearchOpen = false,
  searchQuery = '',
}: ChatScreenProps) {
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
  const [searchResults, setSearchResults] = useState<TextMessage[]>([]);
  const [isSearchingMessages, setIsSearchingMessages] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isMediaBusy, setIsMediaBusy] = useState(false);
  const [composerHeight, setComposerHeight] = useState(84);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isInitialPositionReady, setIsInitialPositionReady] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{
    conversationId: string;
    image: PreparedImage;
  } | null>(null);
  const [pendingMediaPreviewUris, setPendingMediaPreviewUris] = useState<
    Record<string, string>
  >({});
  const currentConversationIdRef = useRef(conversationId);
  currentConversationIdRef.current = conversationId;
  const [sendError, setSendError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [isAppViewVisible, setIsAppViewVisible] = useState(
    isCurrentAppViewVisible
  );
  const listRef = useRef<FlatList<RenderableTextMessage>>(null);
  const hasMeasuredComposerForConversation = useRef(false);
  const pendingScroll = useRef<{
    animated: boolean;
    remainingFrames: number;
    revealAfterScroll: boolean;
  } | null>(null);
  const isScrollFlushScheduled = useRef(false);
  const observedConnectionEpoch = useRef(connectionEpoch);
  const loadedConversationId = useRef<string | null>(null);
  const pendingMessagesRef = useRef(pendingMessages);
  pendingMessagesRef.current = pendingMessages;
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const styles = createStyles(c);

  useEffect(() => {
    pendingScroll.current = null;
    isScrollFlushScheduled.current = false;
    hasMeasuredComposerForConversation.current = false;
    setComposerHeight(84);
    setKeyboardHeight(0);
    setIsInitialPositionReady(false);
    setSelectedImage((current) =>
      current?.conversationId === conversationId ? current : null
    );
  }, [conversationId]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let active = true;
    const objectUrls: string[] = [];
    const media = pendingMessages.filter(isPendingMediaMessage);
    void Promise.all(
      media.map(async (message) => {
        try {
          const uri = await getPendingMediaPreviewUri(message.mediaLocalUri);
          if (!active) {
            URL.revokeObjectURL(uri);
            return null;
          }
          objectUrls.push(uri);
          return [message.clientMessageId, uri] as const;
        } catch {
          return null;
        }
      })
    ).then((entries) => {
      if (active)
        setPendingMediaPreviewUris(
          Object.fromEntries(entries.filter((entry) => entry !== null))
        );
    });
    return () => {
      active = false;
      for (const uri of objectUrls) URL.revokeObjectURL(uri);
    };
  }, [pendingMessages]);

  const requestScrollToEnd = useCallback(
    (animated: boolean, revealAfterScroll = false): void => {
      const currentRequest = pendingScroll.current;
      if (currentRequest) {
        currentRequest.animated = animated;
        currentRequest.remainingFrames = animated ? 1 : 12;
        currentRequest.revealAfterScroll ||= revealAfterScroll;
        return;
      }

      pendingScroll.current = {
        animated,
        // Initial rendering can report its layout before all variable-height rows
        // have been measured. A few non-animated frames make the opening position
        // deterministic without affecting a user's later scroll position.
        remainingFrames: animated ? 1 : 12,
        revealAfterScroll,
      };
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      // A route can reuse this mounted screen with a new conversation ID.
      void conversationId;
      listRef.current?.scrollToEnd({ animated: false });
      const task = InteractionManager.runAfterInteractions(() => {
        requestScrollToEnd(false);
        listRef.current?.scrollToEnd({ animated: false });
      });
      return () => task.cancel();
    }, [conversationId, requestScrollToEnd])
  );

  useEffect(() => {
    const handleShow = ({ height }: { height: number }): void => {
      setKeyboardHeight(Math.max(0, height));
      requestScrollToEnd(false);
      listRef.current?.scrollToEnd({ animated: false });
    };
    const handleHide = (): void => {
      setKeyboardHeight(0);
      requestScrollToEnd(false);
    };
    const subscriptions = [
      KeyboardEvents.addListener('keyboardWillShow', handleShow),
      KeyboardEvents.addListener('keyboardDidShow', handleShow),
      KeyboardEvents.addListener('keyboardWillHide', handleHide),
      KeyboardEvents.addListener('keyboardDidHide', handleHide),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [requestScrollToEnd]);

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
        if (isInitialLoad) requestScrollToEnd(false, true);
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
        if (isInitialLoad) requestScrollToEnd(false, true);
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
      .map((message) =>
        toPendingTextMessage(
          message,
          pendingMediaPreviewUris[message.clientMessageId]
        )
      );
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
    requestScrollToEnd(false, true);
    setInitialState((current) =>
      current === 'loading' || current === 'error' ? 'loaded' : current
    );
  }, [
    conversationId,
    pendingMediaPreviewUris,
    pendingMessages,
    requestScrollToEnd,
    user?.id,
  ]);

  useEffect(
    () =>
      subscribeToMessageStatuses(({ messageId, status }) => {
        setMessages((current) =>
          updateMessageStatus(current, messageId, status)
        );
      }),
    [subscribeToMessageStatuses]
  );

  const renderedMessages = useMemo(
    () => [
      ...new Map(messages.map((message) => [message.id, message])).values(),
    ],
    [messages]
  );
  const trimmedSearchQuery = searchQuery.trim();
  const displayedMessages = trimmedSearchQuery
    ? searchResults
    : renderedMessages;

  useEffect(() => {
    if (!isSearchOpen || !trimmedSearchQuery) {
      setSearchResults([]);
      setSearchError(null);
      setIsSearchingMessages(false);
      if (!isSearchOpen) requestScrollToEnd(false);
      return;
    }

    const controller = new AbortController();
    setSearchResults([]);
    setSearchError(null);
    setIsSearchingMessages(true);
    const timer = setTimeout(() => {
      void searchConversationMessages(conversationId, trimmedSearchQuery)
        .then((results) => {
          if (!controller.signal.aborted) setSearchResults(results);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            setSearchError(historyErrorMessage(error));
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsSearchingMessages(false);
        });
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [conversationId, isSearchOpen, requestScrollToEnd, trimmedSearchQuery]);

  let latestIncomingMessageId: string | null = null;
  for (let index = renderedMessages.length - 1; index >= 0; index -= 1) {
    if (renderedMessages[index].senderId !== user?.id) {
      latestIncomingMessageId = renderedMessages[index].id;
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
    const image =
      selectedImage?.conversationId === conversationId
        ? selectedImage.image
        : null;
    if ((!content && !image) || !user?.id || isSending || isMediaBusy) return;

    const draftAtSend = draft;
    setIsSending(true);
    setSendError(null);

    try {
      requestScrollToEnd(true);
      if (image) {
        await queueMessage({ conversationId, content: content || null, image });
        setSelectedImage((current) =>
          current?.image === image ? null : current
        );
      } else {
        await queueMessage({ conversationId, content });
      }
      setDraft((current) => (current === draftAtSend ? '' : current));
    } catch {
      setSendError('Unable to save this message locally. Please try again.');
    } finally {
      setIsSending(false);
    }
  }, [
    conversationId,
    draft,
    isMediaBusy,
    isSending,
    queueMessage,
    requestScrollToEnd,
    selectedImage,
    user?.id,
  ]);

  const prepareComposerImage = useCallback(
    async (loader: () => Promise<PreparedImage | null>) => {
      if (isMediaBusy || isSending) return;
      setIsMediaBusy(true);
      setSendError(null);
      try {
        const image = await loader();
        if (image && currentConversationIdRef.current === conversationId) {
          setSelectedImage({ conversationId, image });
        }
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unable to prepare this photo. Please try again.';
        setSendError(message);
      } finally {
        setIsMediaBusy(false);
      }
    },
    [conversationId, isMediaBusy, isSending]
  );

  const attachPhoto = useCallback(
    () => prepareComposerImage(pickCompressedImage),
    [prepareComposerImage]
  );

  const capturePhoto = useCallback(
    () => prepareComposerImage(captureCompressedImage),
    [prepareComposerImage]
  );

  const selectGalleryImage = useCallback(
    (source: ImageSource) =>
      prepareComposerImage(() => prepareImageSource(source)),
    [prepareComposerImage]
  );

  const appendSharedText = useCallback((sharedText: string): void => {
    setDraft((current) => {
      const trimmed = current.trimEnd();
      return trimmed ? `${trimmed}\n${sharedText}` : sharedText;
    });
    setSendError(null);
  }, []);

  const shareCurrentLocation = useCallback(async (): Promise<void> => {
    if (isMediaBusy || isSending) return;
    setIsMediaBusy(true);
    setSendError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        throw new Error(
          'Location permission is required to share your current location.'
        );
      }
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const latitude = location.coords.latitude.toFixed(6);
      const longitude = location.coords.longitude.toFixed(6);
      appendSharedText(
        `📍 ${latitude}, ${longitude}\nhttps://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
      );
    } catch (error: unknown) {
      setSendError(
        error instanceof Error
          ? error.message
          : 'Unable to get your current location.'
      );
    } finally {
      setIsMediaBusy(false);
    }
  }, [appendSharedText, isMediaBusy, isSending]);

  const shareContact = useCallback(async (): Promise<void> => {
    if (isMediaBusy || isSending) return;
    setIsMediaBusy(true);
    setSendError(null);
    try {
      if (!(await Contacts.isAvailableAsync())) {
        throw new Error('Contact sharing is not available on this device.');
      }
      if (Platform.OS === 'android') {
        const permission = await Contacts.requestPermissionsAsync();
        if (!permission.granted) {
          throw new Error(
            'Contacts permission is required to choose a contact.'
          );
        }
      }
      const contact = await Contacts.presentContactPickerAsync();
      if (!contact) return;

      const phoneNumber =
        contact.phoneNumbers?.find((phone) => phone.isPrimary && phone.number)
          ?.number ??
        contact.phoneNumbers?.find((phone) => phone.number)?.number;
      const email = contact.emails?.find((entry) => entry.email)?.email;
      const details = [
        phoneNumber ? `📞 ${phoneNumber}` : null,
        email ? `✉️ ${email}` : null,
      ]
        .filter((value): value is string => Boolean(value))
        .join('\n');
      appendSharedText(`👤 ${contact.name}${details ? `\n${details}` : ''}`);
    } catch (error: unknown) {
      setSendError(
        error instanceof Error ? error.message : 'Unable to open your contacts.'
      );
    } finally {
      setIsMediaBusy(false);
    }
  }, [appendSharedText, isMediaBusy, isSending]);

  const sendGif = useCallback(
    async (gif: GifResult): Promise<void> => {
      if (!user?.id || isMediaBusy || isSending) return;
      setIsMediaBusy(true);
      setSendError(null);
      try {
        await queueMessage({
          conversationId,
          content: null,
          remoteMediaUrl: gif.url,
        });
        requestScrollToEnd(true);
      } catch {
        setSendError('Unable to queue this GIF. Please try again.');
        throw new Error('Unable to queue this GIF.');
      } finally {
        setIsMediaBusy(false);
      }
    },
    [
      conversationId,
      isMediaBusy,
      isSending,
      queueMessage,
      requestScrollToEnd,
      user?.id,
    ]
  );

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
      if (requestedScroll.revealAfterScroll) {
        setIsInitialPositionReady(true);
      }
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
          displayedMessages.length === 0 && styles.emptyList,
        ]}
        data={displayedMessages}
        keyboardShouldPersistTaps="handled"
        key={`messages-${conversationId}`}
        keyExtractor={(message) => message.id}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            {isSearchingMessages ? (
              <ActivityIndicator color={c.accentPrimary} />
            ) : null}
            <Text style={searchError ? styles.errorText : styles.stateTitle}>
              {searchError
                ? searchError
                : trimmedSearchQuery
                  ? isSearchingMessages
                    ? 'Searching messages…'
                    : 'No matching messages'
                  : 'No messages yet'}
            </Text>
            {!trimmedSearchQuery ? (
              <Text style={styles.stateText}>
                Start the conversation below.
              </Text>
            ) : null}
          </View>
        }
        ListHeaderComponent={
          trimmedSearchQuery && displayedMessages.length > 0 ? (
            <View style={styles.searchSummary}>
              <Text style={styles.searchSummaryText}>
                {displayedMessages.length}{' '}
                {displayedMessages.length === 1 ? 'match' : 'matches'}
              </Text>
            </View>
          ) : nextCursor && !isSearchOpen ? (
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
        ListFooterComponent={
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={{
              height: isSearchOpen ? 16 : composerHeight + keyboardHeight + 16,
            }}
          />
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
        scrollEnabled={isInitialPositionReady}
        style={[
          styles.list,
          !isInitialPositionReady && styles.positioningContent,
        ]}
      />
      {!isSearchOpen ? (
        <KeyboardStickyView
          enabled={isFocused && Platform.OS !== 'web'}
          key={`composer-${conversationId}`}
          onLayout={(event) => {
            const nextHeight = Math.ceil(event.nativeEvent.layout.height);
            setComposerHeight((current) =>
              current === nextHeight ? current : nextHeight
            );
            if (!hasMeasuredComposerForConversation.current) {
              hasMeasuredComposerForConversation.current = true;
              requestScrollToEnd(false);
              requestAnimationFrame(flushPendingScroll);
            }
          }}
          pointerEvents={isInitialPositionReady ? 'box-none' : 'none'}
          style={[
            styles.composerDock,
            !isInitialPositionReady && styles.positioningContent,
          ]}
        >
          <SafeAreaView edges={['bottom']} style={styles.composerSafeArea}>
            <MessageComposer
              attachmentUri={
                selectedImage?.conversationId === conversationId
                  ? selectedImage.image.uri
                  : null
              }
              connectionState={connectionState}
              isMediaBusy={isMediaBusy || isSending}
              isSending={isSending}
              onAttach={attachPhoto}
              onCamera={capturePhoto}
              onContact={shareContact}
              onLocation={shareCurrentLocation}
              onRemoveAttachment={() => setSelectedImage(null)}
              onChangeText={(value) => {
                setDraft(value);
                if (sendError) setSendError(null);
              }}
              onRetryConnection={retryConnection}
              onSend={() => void sendDraft()}
              onSelectGif={sendGif}
              onSelectGalleryImage={selectGalleryImage}
              onUnavailableAction={(label) =>
                setSendError(
                  `${label} needs the next Feature 19 message-type milestone.`
                )
              }
              sendError={sendError}
              value={draft}
            />
          </SafeAreaView>
        </KeyboardStickyView>
      ) : null}
      {!isInitialPositionReady ? (
        <View pointerEvents="none" style={styles.positioningOverlay}>
          <ActivityIndicator color={c.accentPrimary} size="large" />
        </View>
      ) : null}
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
    composerSafeArea: { backgroundColor: 'transparent', paddingBottom: 8 },
    composerDock: {
      bottom: 0,
      left: 0,
      position: 'absolute',
      right: 0,
      zIndex: 10,
    },
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
    listContent: {
      paddingHorizontal: 12,
      paddingTop: 12,
    },
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
    primaryButtonText: {
      color: c.onStateAction,
      fontSize: 15,
      fontWeight: '600',
    },
    searchSummary: { alignItems: 'center', paddingVertical: 10 },
    searchSummaryText: { color: c.textMuted, fontSize: 13 },
    positioningContent: { opacity: 0 },
    positioningOverlay: {
      alignItems: 'center',
      backgroundColor: c.bgBase,
      bottom: 0,
      justifyContent: 'center',
      left: 0,
      position: 'absolute',
      right: 0,
      top: 0,
      zIndex: 20,
    },
    stateText: {
      color: c.textMuted,
      fontSize: 15,
      lineHeight: 22,
      marginTop: 8,
      textAlign: 'center',
    },
    stateTitle: { color: c.textPrimary, fontSize: 19, fontWeight: '600' },
  });
