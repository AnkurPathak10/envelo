import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConversationRow } from '@/components/conversations/conversation-row';
import { EmptyConversationList } from '@/components/conversations/empty-conversation-list';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { colors, radius, spacing } from '@/constants/theme';
import { ApiError, isConnectivityError } from '@/lib/api/client';
import {
  getConversations,
  type ConversationListItem,
} from '@/lib/api/conversations';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  getCachedConversations,
  saveCachedConversations,
} from '@/lib/cache/conversationCache';
import { retainCachedMessageHistories } from '@/lib/cache/messageCache';
import {
  type MessageStatusUpdate,
  type SocketTextMessage,
  useSocket,
} from '@/lib/socket/SocketContext';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

function getErrorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Unable to load conversations. Please try again.';
}

const statusRank = { SENT: 1, DELIVERED: 2, READ: 3 } as const;

function isInboxActuallyVisible(isFocused: boolean): boolean {
  if (!isFocused) return false;
  if (Platform.OS === 'web') {
    return (
      typeof document === 'undefined' || document.visibilityState === 'visible'
    );
  }
  return AppState.currentState === 'active';
}

function mergeRestWithLiveConversations(
  restItems: ConversationListItem[],
  currentItems: ConversationListItem[]
): ConversationListItem[] {
  const currentById = new Map(currentItems.map((item) => [item.id, item]));
  const promotedIds = new Set<string>();
  const merged = restItems.map((restItem) => {
    const currentItem = currentById.get(restItem.id);
    if (!currentItem?.lastMessage) return restItem;
    if (!restItem.lastMessage) {
      promotedIds.add(restItem.id);
      return currentItem;
    }

    const currentTime = Date.parse(currentItem.lastMessage.createdAt);
    const restTime = Date.parse(restItem.lastMessage.createdAt);
    if (
      currentTime > restTime ||
      (currentTime === restTime &&
        currentItem.lastMessage.id.localeCompare(restItem.lastMessage.id) > 0)
    ) {
      promotedIds.add(restItem.id);
      return currentItem;
    }

    if (currentItem.lastMessage.id !== restItem.lastMessage.id) return restItem;
    const currentStatus = currentItem.lastMessage.status;
    const restStatus = restItem.lastMessage.status;
    const status =
      currentStatus &&
      (!restStatus || statusRank[currentStatus] > statusRank[restStatus])
        ? currentStatus
        : restStatus;

    return {
      ...restItem,
      lastMessage: { ...restItem.lastMessage, status },
    };
  });

  if (promotedIds.size === 0) return merged;
  const byId = new Map(merged.map((item) => [item.id, item]));
  const promoted = currentItems
    .filter((item) => promotedIds.has(item.id))
    .map((item) => byId.get(item.id))
    .filter((item): item is ConversationListItem => Boolean(item));
  return [...promoted, ...merged.filter((item) => !promotedIds.has(item.id))];
}

export default function HomeScreen() {
  const { signOut, user } = useAuth();
  const {
    acknowledgeDeliveredMessages,
    subscribeToMessageStatuses,
    subscribeToNewMessages,
  } = useSocket();
  const isFocused = useIsFocused();
  const [conversations, setConversations] = useState<ConversationListItem[]>(
    []
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadVersion, setReloadVersion] = useState(0);
  const hasLoaded = useRef(false);
  const retryRequested = useRef(false);
  const conversationsRef = useRef<ConversationListItem[]>([]);
  const liveRevision = useRef(0);
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const styles = createStyles(c);

  const replaceConversations = useCallback(
    (items: ConversationListItem[], persist: boolean): void => {
      conversationsRef.current = items;
      setConversations(items);
      if (persist && user?.id) {
        void saveCachedConversations(user.id, items).catch(() => undefined);
      }
    },
    [user?.id]
  );

  const updateLiveConversations = useCallback(
    (
      update: (current: ConversationListItem[]) => ConversationListItem[]
    ): void => {
      const current = conversationsRef.current;
      const next = update(current);
      if (next === current) return;
      liveRevision.current += 1;
      replaceConversations(next, true);
    },
    [replaceConversations]
  );

  const openNewConversation = useCallback(() => {
    router.push('/(app)/new-conversation');
  }, []);

  const openConversation = useCallback(
    (conversation: ConversationListItem) => {
      if (conversation.unreadCount > 0) {
        replaceConversations(
          conversationsRef.current.map((item) =>
            item.id === conversation.id ? { ...item, unreadCount: 0 } : item
          ),
          true
        );
      }
      router.push({
        pathname: '/(app)/conversation/[conversationId]',
        params: {
          conversationId: conversation.id,
          participantName: conversation.participant.displayName,
        },
      });
    },
    [replaceConversations]
  );

  useEffect(() => {
    if (!user?.id) return;

    const unsubscribeMessages = subscribeToNewMessages(
      (message: SocketTextMessage) => {
        let foundConversation = false;
        updateLiveConversations((current) => {
          const index = current.findIndex(
            (conversation) => conversation.id === message.conversationId
          );
          if (index < 0) return current;
          foundConversation = true;

          const existing = current[index];
          if (existing.lastMessage) {
            const existingTime = Date.parse(existing.lastMessage.createdAt);
            const messageTime = Date.parse(message.createdAt);
            if (
              Number.isFinite(existingTime) &&
              Number.isFinite(messageTime) &&
              (existingTime > messageTime ||
                (existingTime === messageTime &&
                  existing.lastMessage.id.localeCompare(message.id) > 0))
            ) {
              return current;
            }
          }
          if (existing.lastMessage?.id === message.id) return current;
          const isIncoming = message.senderId !== user.id;
          const updated: ConversationListItem = {
            ...existing,
            updatedAt: message.createdAt,
            lastMessage: {
              id: message.id,
              senderId: message.senderId,
              content: message.content,
              createdAt: message.createdAt,
              status: isIncoming ? null : 'SENT',
            },
            unreadCount:
              isIncoming && isInboxActuallyVisible(isFocused)
                ? existing.unreadCount + 1
                : existing.unreadCount,
          };
          return [
            updated,
            ...current.filter((_, itemIndex) => itemIndex !== index),
          ];
        });

        if (!foundConversation && isFocused) {
          setReloadVersion((version) => version + 1);
        }
      }
    );

    const unsubscribeStatuses = subscribeToMessageStatuses(
      (update: MessageStatusUpdate) => {
        updateLiveConversations((current) => {
          const index = current.findIndex(
            (conversation) => conversation.lastMessage?.id === update.messageId
          );
          if (index < 0) return current;
          const conversation = current[index];
          const lastMessage = conversation.lastMessage;
          if (!lastMessage || lastMessage.senderId !== user.id) return current;
          if (
            lastMessage.status &&
            statusRank[lastMessage.status] >= statusRank[update.status]
          ) {
            return current;
          }

          const next = [...current];
          next[index] = {
            ...conversation,
            lastMessage: { ...lastMessage, status: update.status },
          };
          return next;
        });
      }
    );

    return () => {
      unsubscribeMessages();
      unsubscribeStatuses();
    };
  }, [
    isFocused,
    subscribeToMessageStatuses,
    subscribeToNewMessages,
    updateLiveConversations,
    user?.id,
  ]);

  useFocusEffect(
    useCallback(() => {
      // The counter intentionally retriggers this focused-screen refresh.
      void reloadVersion;
      let isActive = true;
      if (retryRequested.current || !hasLoaded.current) setIsLoading(true);
      retryRequested.current = false;
      setErrorMessage(null);
      setIsOffline(false);

      const loadConversations = async (): Promise<void> => {
        if (!user?.id) return;
        const startingLiveRevision = liveRevision.current;
        const hadInMemoryData = hasLoaded.current;
        const cachedPromise = getCachedConversations(user.id).catch(() => null);
        const livePromise = getConversations().then(
          (items) => ({ ok: true as const, items }),
          (error: unknown) => ({ ok: false as const, error })
        );
        const cached = await cachedPromise;

        if (isActive && cached && conversationsRef.current.length === 0) {
          replaceConversations(cached, false);
          hasLoaded.current = true;
          setIsLoading(false);
        }

        try {
          const liveResult = await livePromise;
          if (!liveResult.ok) throw liveResult.error;
          const { items } = liveResult;
          const nextItems =
            liveRevision.current === startingLiveRevision
              ? items
              : mergeRestWithLiveConversations(items, conversationsRef.current);
          void Promise.all([
            saveCachedConversations(user.id, nextItems),
            retainCachedMessageHistories(
              user.id,
              items.map((item) => item.id)
            ),
          ]).catch(() => undefined);
          if (!isActive) return;
          acknowledgeDeliveredMessages(
            items.flatMap((item) =>
              item.lastMessage ? [item.lastMessage] : []
            )
          );
          replaceConversations(nextItems, false);
          setErrorMessage(null);
          setIsOffline(false);
          hasLoaded.current = true;
        } catch (error: unknown) {
          if (!isActive) return;
          if (isConnectivityError(error) && (cached || hadInMemoryData)) {
            setIsOffline(true);
            setErrorMessage(null);
          } else {
            setErrorMessage(getErrorMessage(error));
          }
        } finally {
          if (isActive) setIsLoading(false);
        }
      };

      void loadConversations();

      return () => {
        isActive = false;
      };
    }, [
      acknowledgeDeliveredMessages,
      reloadVersion,
      replaceConversations,
      user?.id,
    ])
  );

  const retry = useCallback(() => {
    retryRequested.current = true;
    setIsLoading(true);
    setReloadVersion((version) => version + 1);
  }, []);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={styles.title}>Envelo</Text>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityLabel="New conversation"
              accessibilityRole="button"
              onPress={openNewConversation}
              style={({ pressed }) => [
                styles.composeButton,
                pressed && styles.headerButtonPressed,
              ]}
            >
              <MaterialIcons color={c.onAccent} name="edit" size={22} />
            </Pressable>
            <Pressable
              accessibilityLabel="Log out"
              accessibilityRole="button"
              onPress={() => void signOut()}
              style={({ pressed }) => [
                styles.iconButton,
                pressed && styles.headerButtonPressed,
              ]}
            >
              <MaterialIcons color={c.textMuted} name="logout" size={22} />
            </Pressable>
          </View>
        </View>
        <View style={styles.themeRow}>
          <Text style={styles.themeLabel}>Theme</Text>
          <ThemeToggle />
        </View>
      </View>

      {isOffline && !errorMessage ? (
        <View style={styles.offlineNotice}>
          <Text style={styles.offlineNoticeText}>
            You&apos;re offline — showing saved conversations
          </Text>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.centeredState}>
          <ActivityIndicator color={c.accentPrimary} size="large" />
          <Text style={styles.stateText}>Loading conversations…</Text>
        </View>
      ) : errorMessage ? (
        <View style={styles.centeredState}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={retry}
            style={styles.retryButton}
          >
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={
            conversations.length === 0 ? styles.emptyList : undefined
          }
          data={conversations}
          keyExtractor={(conversation) => conversation.id}
          ListEmptyComponent={
            <EmptyConversationList onStartConversation={openNewConversation} />
          }
          renderItem={({ item }) => (
            <ConversationRow
              conversation={item}
              currentUserId={user?.id ?? ''}
              onPress={() => openConversation(item)}
            />
          )}
          style={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    centeredState: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
      padding: spacing.xl,
    },
    emptyList: { flexGrow: 1 },
    errorText: {
      color: c.error,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
    },
    header: {
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    headerActions: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    headerButtonPressed: { opacity: 0.72 },
    headerTopRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    composeButton: {
      alignItems: 'center',
      backgroundColor: c.accentPrimary,
      borderRadius: spacing.lg,
      height: spacing.xl + spacing.md,
      justifyContent: 'center',
      width: spacing.xl + spacing.md,
    },
    iconButton: {
      alignItems: 'center',
      borderRadius: spacing.lg,
      height: spacing.xl + spacing.md,
      justifyContent: 'center',
      width: spacing.xl + spacing.md,
    },
    list: { flex: 1 },
    offlineNotice: {
      alignItems: 'center',
      backgroundColor: c.bgSurface,
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    offlineNoticeText: { color: c.textMuted, fontSize: 12 },
    retryButton: {
      backgroundColor: c.accentPrimary,
      borderRadius: radius.sm,
      marginTop: spacing.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    retryButtonText: { color: c.bgBase, fontSize: 15, fontWeight: '600' },
    safeArea: { backgroundColor: c.bgBase, flex: 1 },
    stateText: { color: c.textMuted, fontSize: 15, marginTop: spacing.sm },
    themeLabel: { color: c.textMuted, fontSize: 12, fontWeight: '600' },
    themeRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    title: { color: c.textPrimary, fontSize: 28, fontWeight: '700' },
  });
