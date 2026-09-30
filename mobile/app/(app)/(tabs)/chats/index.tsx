import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { router, type Href } from 'expo-router';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConversationRow } from '@/components/conversations/conversation-row';
import { EmptyConversationList } from '@/components/conversations/empty-conversation-list';
import {
  FriendSearchRow,
  type FriendSearchAction,
} from '@/components/friends/friend-search-row';
import { messagingColors as colors, radius, spacing } from '@/constants/theme';
import { ApiError, isConnectivityError } from '@/lib/api/client';
import {
  createDirectConversation,
  getConversations,
  searchUsers,
  type ConversationListItem,
  type SearchUser,
} from '@/lib/api/conversations';
import {
  acceptFriendRequest,
  rejectFriendRequest,
  sendFriendRequest,
} from '@/lib/api/friends';
import { useAuth } from '@/lib/auth/AuthContext';
import { useInboxBadge } from '@/lib/conversations/InboxBadgeContext';
import { useFriendRequests } from '@/lib/friends/FriendRequestsContext';
import { useGroupCreation } from '@/lib/groups/GroupCreationContext';
import {
  getCachedConversations,
  saveCachedConversations,
} from '@/lib/cache/conversationCache';
import {
  removeCachedMessageHistory,
  retainCachedMessageHistories,
} from '@/lib/cache/messageCache';
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

function getSearchErrorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Unable to search for people. Please try again.';
}

const statusRank = { SENT: 1, DELIVERED: 2, READ: 3 } as const;
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
  const { user } = useAuth();
  const { setUnreadCount } = useInboxBadge();
  const { revision: friendRevision, notifyChanged } = useFriendRequests();
  const { reset: resetGroupCreation } = useGroupCreation();
  const {
    acknowledgeDeliveredMessages,
    connectionEpoch,
    discardConversationQueue,
    subscribeToConversationVisibility,
    subscribeToMessageStatuses,
    subscribeToNewMessages,
    syncConversationVisibility,
  } = useSocket();
  const isFocused = useIsFocused();
  const [conversations, setConversations] = useState<ConversationListItem[]>(
    []
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [composeMenuOpen, setComposeMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchErrorMessage, setSearchErrorMessage] = useState<string | null>(
    null
  );
  const [creationErrorMessage, setCreationErrorMessage] = useState<
    string | null
  >(null);
  const [creatingUserId, setCreatingUserId] = useState<string | null>(null);
  const [searchVersion, setSearchVersion] = useState(0);
  const hasLoaded = useRef(false);
  const retryRequested = useRef(false);
  const searchRequestSequence = useRef(0);
  const isMounted = useRef(true);
  const conversationsRef = useRef<ConversationListItem[]>([]);
  const liveRevision = useRef(0);
  const observedConnectionEpoch = useRef(0);
  const observedFriendRevision = useRef(0);
  const trimmedSearchQuery = searchQuery.trim();
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const styles = createStyles(c);

  useEffect(() => {
    if (
      connectionEpoch === 0 ||
      observedConnectionEpoch.current === connectionEpoch
    ) {
      return;
    }
    observedConnectionEpoch.current = connectionEpoch;
    setReloadVersion((version) => version + 1);
  }, [connectionEpoch]);

  useEffect(() => {
    if (observedFriendRevision.current === friendRevision) return;
    observedFriendRevision.current = friendRevision;
    setReloadVersion((version) => version + 1);
    setSearchVersion((version) => version + 1);
  }, [friendRevision]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined' || typeof window === 'undefined') {
        return;
      }
      const refreshVisibleInbox = (): void => {
        if (document.visibilityState === 'visible') {
          setReloadVersion((version) => version + 1);
        }
      };
      document.addEventListener('visibilitychange', refreshVisibleInbox);
      window.addEventListener('focus', refreshVisibleInbox);
      return () => {
        document.removeEventListener('visibilitychange', refreshVisibleInbox);
        window.removeEventListener('focus', refreshVisibleInbox);
      };
    }

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setReloadVersion((version) => version + 1);
    });
    return () => subscription.remove();
  }, []);

  const replaceConversations = useCallback(
    (items: ConversationListItem[], persist: boolean): void => {
      conversationsRef.current = items;
      setConversations(items);
      setUnreadCount(items.reduce((sum, item) => sum + item.unreadCount, 0));
      if (persist && user?.id) {
        void saveCachedConversations(user.id, items).catch(() => undefined);
      }
    },
    [setUnreadCount, user?.id]
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
    setComposeMenuOpen(false);
    router.push('/(app)/(tabs)/chats/new-conversation');
  }, []);

  const openNewGroup = useCallback(() => {
    setComposeMenuOpen(false);
    resetGroupCreation();
    router.push('/(app)/(tabs)/chats/new-group' as Href);
  }, [resetGroupCreation]);

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
        pathname: '/(app)/(tabs)/chats/conversation/[conversationId]',
        params: {
          conversationId: conversation.id,
          clearedAt: conversation.clearedAt ?? '',
          ...(conversation.type === 'GROUP'
            ? {
                conversationType: 'GROUP',
                groupName: conversation.name,
                groupPhotoUrl: conversation.photoUrl ?? '',
              }
            : {
                participantAvatarUrl: conversation.participant.avatarUrl ?? '',
                participantId: conversation.participant.id,
                participantName: conversation.participant.displayName,
              }),
        },
      });
    },
    [replaceConversations]
  );

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    const sequence = ++searchRequestSequence.current;
    if (!trimmedSearchQuery) {
      setSearchResults([]);
      setSearchErrorMessage(null);
      setCreationErrorMessage(null);
      setIsSearching(false);
      return;
    }

    setSearchResults([]);
    setSearchErrorMessage(null);
    setCreationErrorMessage(null);
    setIsSearching(true);

    const timer = setTimeout(() => {
      void searchUsers(trimmedSearchQuery)
        .then((results) => {
          if (searchRequestSequence.current === sequence) {
            setSearchResults(results);
          }
        })
        .catch((error: unknown) => {
          if (searchRequestSequence.current === sequence) {
            setSearchErrorMessage(getSearchErrorMessage(error));
          }
        })
        .finally(() => {
          if (searchRequestSequence.current === sequence) {
            setIsSearching(false);
          }
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      if (searchRequestSequence.current === sequence) {
        searchRequestSequence.current += 1;
      }
    };
  }, [searchVersion, trimmedSearchQuery]);

  const chooseUser = useCallback(
    async (action: FriendSearchAction, user: SearchUser) => {
      setCreatingUserId(user.id);
      setCreationErrorMessage(null);
      try {
        if (action === 'chat') {
          const conversation = await createDirectConversation(user.id);
          void syncConversationVisibility(conversation.id).catch(
            () => undefined
          );
          if (!isMounted.current) return;
          setSearchQuery('');
          router.push({
            pathname: '/(app)/(tabs)/chats/conversation/[conversationId]',
            params: {
              conversationId: conversation.id,
              clearedAt: conversation.clearedAt ?? '',
              participantAvatarUrl: conversation.participant.avatarUrl ?? '',
              participantId: conversation.participant.id,
              participantName: conversation.participant.displayName,
            },
          });
        } else if (action === 'request') {
          const result = await sendFriendRequest(user.id);
          setSearchResults((current) =>
            current.map((item) =>
              item.id === user.id
                ? {
                    ...item,
                    friendStatus:
                      result.friendship.status === 'ACCEPTED'
                        ? 'FRIENDS'
                        : 'PENDING_OUTGOING',
                  }
                : item
            )
          );
          void notifyChanged();
        } else {
          if (!user.incomingRequestId)
            throw new Error('Request is no longer available. Search again.');
          if (action === 'accept')
            await acceptFriendRequest(user.incomingRequestId);
          else await rejectFriendRequest(user.incomingRequestId);
          setSearchResults((current) =>
            current.map((item) =>
              item.id === user.id
                ? {
                    ...item,
                    friendStatus: action === 'accept' ? 'FRIENDS' : 'NONE',
                    incomingRequestId: undefined,
                  }
                : item
            )
          );
          void notifyChanged();
        }
      } catch (error: unknown) {
        if (isMounted.current) {
          setCreationErrorMessage(getSearchErrorMessage(error));
        }
      } finally {
        if (isMounted.current) setCreatingUserId(null);
      }
    },
    [notifyChanged, syncConversationVisibility]
  );

  const retrySearch = useCallback(() => {
    setSearchVersion((version) => version + 1);
  }, []);

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
              mediaUrl: message.mediaUrl,
              audioDurationMs: message.audioDurationMs,
              createdAt: message.createdAt,
              status:
                existing.type === 'GROUP' ? null : isIncoming ? null : 'SENT',
              ...(existing.type === 'GROUP'
                ? {
                    preview:
                      message.inboxPreview ?? message.content ?? 'Message',
                  }
                : {}),
            },
            unreadCount: isIncoming
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
    const unsubscribeVisibility = subscribeToConversationVisibility(
      (visibility) => {
        const existing = conversationsRef.current.find(
          (conversation) => conversation.id === visibility.conversationId
        );
        const shouldInvalidateLocalState = Boolean(
          visibility.deletedAt ||
          (existing && existing.clearedAt !== visibility.clearedAt)
        );
        updateLiveConversations((current) => {
          if (visibility.deletedAt) {
            return current.filter(
              (conversation) => conversation.id !== visibility.conversationId
            );
          }

          return current.map((conversation) =>
            conversation.id === visibility.conversationId
              ? conversation.clearedAt === visibility.clearedAt
                ? conversation
                : (() => {
                    const lastMessageIsVisible = Boolean(
                      conversation.lastMessage &&
                      (!visibility.clearedAt ||
                        Date.parse(conversation.lastMessage.createdAt) >
                          Date.parse(visibility.clearedAt))
                    );
                    return {
                      ...conversation,
                      clearedAt: visibility.clearedAt,
                      lastMessage: lastMessageIsVisible
                        ? conversation.lastMessage
                        : null,
                      unreadCount: lastMessageIsVisible
                        ? conversation.unreadCount
                        : 0,
                    };
                  })()
              : conversation
          );
        });
        if (shouldInvalidateLocalState) {
          void discardConversationQueue(visibility.conversationId);
          void removeCachedMessageHistory(
            user.id,
            visibility.conversationId
          ).catch(() => undefined);
        }
        if (!visibility.deletedAt && !existing && isFocused) {
          setReloadVersion((version) => version + 1);
        }
      }
    );

    return () => {
      unsubscribeMessages();
      unsubscribeStatuses();
      unsubscribeVisibility();
    };
  }, [
    discardConversationQueue,
    isFocused,
    subscribeToConversationVisibility,
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
              nextItems.map((item) => item.id)
            ),
          ]).catch(() => undefined);
          if (!isActive) return;
          acknowledgeDeliveredMessages(
            nextItems.flatMap((item) =>
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
        </View>
        <View style={styles.searchBox}>
          <MaterialIcons color={c.textMuted} name="search" size={21} />
          <TextInput
            accessibilityLabel="Search chats or people"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={100}
            onChangeText={setSearchQuery}
            placeholder="Search chats or people"
            placeholderTextColor={c.textMuted}
            returnKeyType="search"
            style={styles.searchInput}
            value={searchQuery}
          />
          {searchQuery ? (
            <Pressable
              accessibilityLabel="Clear search"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setSearchQuery('')}
              style={({ pressed }) => pressed && styles.headerButtonPressed}
            >
              <MaterialIcons color={c.textMuted} name="close" size={20} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {isOffline && !errorMessage ? (
        <View style={styles.offlineNotice}>
          <Text style={styles.offlineNoticeText}>
            You&apos;re offline — showing saved conversations
          </Text>
        </View>
      ) : null}

      {trimmedSearchQuery ? (
        <View style={styles.searchResultsContainer}>
          {isSearching ? (
            <View style={styles.searchStatusRow}>
              <ActivityIndicator color={c.accentPrimary} size="small" />
              <Text style={styles.searchStatusText}>Searching…</Text>
            </View>
          ) : null}

          {searchErrorMessage ? (
            <View style={styles.searchErrorContainer}>
              <Text style={styles.errorText}>{searchErrorMessage}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={retrySearch}
                style={styles.searchRetryButton}
              >
                <Text style={styles.searchRetryText}>Try again</Text>
              </Pressable>
            </View>
          ) : null}

          {creationErrorMessage ? (
            <View style={styles.searchErrorContainer}>
              <Text style={styles.errorText}>{creationErrorMessage}</Text>
            </View>
          ) : null}

          <FlatList
            contentContainerStyle={
              searchResults.length === 0 ? styles.searchEmptyList : undefined
            }
            data={searchResults}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(result) => result.id}
            ListEmptyComponent={
              !isSearching && !searchErrorMessage ? (
                <Text style={styles.searchEmptyText}>No users found.</Text>
              ) : null
            }
            renderItem={({ item }) => (
              <FriendSearchRow
                busy={creatingUserId === item.id}
                onAction={(action, user) => void chooseUser(action, user)}
                user={item}
              />
            )}
            style={styles.list}
          />
        </View>
      ) : isLoading ? (
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
            <EmptyConversationList
              onStartConversation={() => setComposeMenuOpen(true)}
            />
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

      <Pressable
        accessibilityLabel="Compose"
        accessibilityRole="button"
        accessibilityState={{ expanded: composeMenuOpen }}
        onPress={() => setComposeMenuOpen(true)}
        style={({ pressed }) => [
          styles.composeButton,
          pressed && styles.headerButtonPressed,
        ]}
      >
        <MaterialIcons color={c.onAccent} name="add" size={30} />
      </Pressable>
      <Modal
        animationType="fade"
        onRequestClose={() => setComposeMenuOpen(false)}
        transparent
        visible={composeMenuOpen}
      >
        <Pressable
          accessibilityLabel="Close compose menu"
          onPress={() => setComposeMenuOpen(false)}
          style={styles.composeBackdrop}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={styles.composeMenu}
          >
            <Pressable
              accessibilityRole="button"
              onPress={openNewConversation}
              style={styles.composeAction}
            >
              <MaterialIcons
                color={c.accentPrimary}
                name="chat-bubble-outline"
                size={22}
              />
              <Text style={styles.composeActionText}>New Message</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={openNewGroup}
              style={styles.composeAction}
            >
              <MaterialIcons
                color={c.accentPrimary}
                name="group-add"
                size={22}
              />
              <Text style={styles.composeActionText}>New Group</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
    composeAction: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.md,
      minHeight: 52,
      paddingHorizontal: spacing.md,
    },
    composeActionText: {
      color: c.textPrimary,
      fontSize: 16,
      fontWeight: '600',
    },
    composeBackdrop: { backgroundColor: 'rgba(0,0,0,0.25)', flex: 1 },
    composeButton: {
      alignItems: 'center',
      backgroundColor: c.accentPrimary,
      borderRadius: 28,
      bottom: spacing.lg,
      elevation: 5,
      height: 56,
      justifyContent: 'center',
      position: 'absolute',
      right: spacing.lg,
      width: 56,
    },
    composeMenu: {
      backgroundColor: c.bgBase,
      borderColor: c.border,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      bottom: spacing.xl + 80,
      elevation: 8,
      overflow: 'hidden',
      position: 'absolute',
      right: spacing.lg,
      width: 200,
    },
    brandRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
    emptyList: { flexGrow: 1 },
    errorText: {
      color: c.error,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
    },
    header: {
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    headerButtonPressed: { opacity: 0.72 },
    headerTopRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    iconButton: {
      alignItems: 'center',
      borderRadius: spacing.lg,
      height: spacing.xl + spacing.md,
      justifyContent: 'center',
      width: spacing.xl + spacing.md,
    },
    list: { flex: 1 },
    currentTheme: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
    },
    currentThemeText: { color: c.textMuted, fontSize: 14, fontWeight: '500' },
    menuActionPressed: { backgroundColor: c.bgSurface },
    menuActionRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
      minHeight: 48,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    menuBackdrop: {
      backgroundColor: 'rgba(0, 0, 0, 0.16)',
      flex: 1,
    },
    menuCard: {
      backgroundColor: c.bgBase,
      borderColor: c.border,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      elevation: 8,
      overflow: 'hidden',
      position: 'absolute',
      right: spacing.md,
      shadowColor: '#000000',
      shadowOffset: { height: 4, width: 0 },
      shadowOpacity: 0.18,
      shadowRadius: 12,
      width: 220,
    },
    menuDivider: {
      backgroundColor: c.border,
      height: StyleSheet.hairlineWidth,
    },
    menuItemLabel: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    menuItemText: {
      color: c.textPrimary,
      fontSize: 15,
      fontWeight: '500',
    },
    menuThemeRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 56,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
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
    retryButtonText: {
      color: c.onStateAction,
      fontSize: 15,
      fontWeight: '600',
    },
    safeArea: { backgroundColor: c.bgBase, flex: 1 },
    searchBox: {
      alignItems: 'center',
      backgroundColor: c.bgSurface,
      borderColor: c.border,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: spacing.sm,
      minHeight: 42,
      paddingHorizontal: spacing.md,
    },
    searchEmptyList: { flexGrow: 1, justifyContent: 'center' },
    searchEmptyText: {
      color: c.textMuted,
      fontSize: 15,
      padding: spacing.xl,
      textAlign: 'center',
    },
    searchErrorContainer: {
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    searchInput: {
      color: c.textPrimary,
      flex: 1,
      fontSize: 16,
      paddingVertical: spacing.xs,
    },
    searchResultsContainer: { flex: 1 },
    searchRetryButton: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    searchRetryText: {
      color: c.accentPrimary,
      fontSize: 14,
      fontWeight: '600',
    },
    searchStatusRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    searchStatusText: { color: c.textMuted, fontSize: 14 },
    stateText: { color: c.textMuted, fontSize: 15, marginTop: spacing.sm },
    themeOption: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 42,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    themeOptionSelected: { backgroundColor: c.bgSurface },
    themeOptionText: {
      color: c.textPrimary,
      fontSize: 14,
      fontWeight: '500',
    },
    themeOptionTextSelected: {
      color: c.accentPrimary,
      fontWeight: '500',
    },
    themeOptions: {
      borderTopColor: c.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingVertical: spacing.xs,
    },
    title: { color: c.textPrimary, fontSize: 28, fontWeight: '700' },
  });
