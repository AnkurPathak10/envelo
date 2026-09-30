import {
  Stack,
  router,
  useFocusEffect,
  useLocalSearchParams,
} from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ChatHeader } from '@/components/chat/chat-header';
import { ChatScreen } from '@/components/chat/chat-screen';
import {
  clearConversationMessages,
  deleteConversation,
  getConversations,
  getGroupConversation,
  type ConversationListItem,
  type GroupDetail,
} from '@/lib/api/conversations';
import { useAuth } from '@/lib/auth/AuthContext';
import { getCachedConversations } from '@/lib/cache/conversationCache';
import { removeCachedMessageHistory } from '@/lib/cache/messageCache';
import { useSocket } from '@/lib/socket/SocketContext';
import { dismissChatNotifications } from '@/lib/push/notificationTray';
import { messagingColors } from '@/constants/theme';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

function firstParam(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : (value?.[0] ?? '');
}

export default function ConversationScreen() {
  const { user } = useAuth();
  const {
    clearConversationAcrossDevices,
    deleteConversationAcrossDevices,
    discardConversationQueue,
    subscribeToConversationVisibility,
  } = useSocket();
  const params = useLocalSearchParams<{
    conversationId?: string | string[];
    clearedAt?: string | string[];
    participantAvatarUrl?: string | string[];
    participantId?: string | string[];
    participantName?: string | string[];
    conversationType?: string | string[];
    groupName?: string | string[];
    groupPhotoUrl?: string | string[];
  }>();
  const conversationId = firstParam(params.conversationId);
  const scheme = useAppColorScheme();
  const [resolvedConversation, setResolvedConversation] =
    useState<ConversationListItem | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [identityVersion, setIdentityVersion] = useState(0);
  const hasRouteIdentity = Boolean(
    firstParam(params.conversationType) || firstParam(params.participantId)
  );
  useEffect(() => {
    if (hasRouteIdentity || !conversationId) return;
    let active = true;
    void getConversations()
      .catch(async (error: unknown) => {
        const cached = user?.id
          ? await getCachedConversations(user.id).catch(() => null)
          : null;
        if (cached) return cached;
        throw error;
      })
      .then((items) => {
        if (!active) return;
        const conversation = items.find((item) => item.id === conversationId);
        if (!conversation) throw new Error('Conversation not found.');
        setResolvedConversation(conversation);
        setIdentityError(null);
      })
      .catch((error: unknown) => {
        if (active)
          setIdentityError(
            error instanceof Error
              ? error.message
              : 'Unable to open conversation.'
          );
      });
    return () => {
      active = false;
    };
  }, [conversationId, hasRouteIdentity, identityVersion, user?.id]);
  useFocusEffect(
    useCallback(() => {
      if (!user?.id || !conversationId) return;
      const dismiss = () => {
        void dismissChatNotifications(user.id, conversationId).catch(
          (error) => {
            console.warn('Unable to clear the chat notification', error);
          }
        );
      };
      dismiss();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') dismiss();
      });
      return () => subscription.remove();
    }, [conversationId, user?.id])
  );
  const initialClearedAt = firstParam(params.clearedAt).trim() || null;
  const isGroup =
    resolvedConversation?.type === 'GROUP' ||
    firstParam(params.conversationType) === 'GROUP';
  const participantAvatarUrl = isGroup
    ? resolvedConversation?.type === 'GROUP'
      ? (resolvedConversation.photoUrl ?? '')
      : firstParam(params.groupPhotoUrl).trim()
    : resolvedConversation?.type === 'DIRECT'
      ? (resolvedConversation.participant.avatarUrl ?? '')
      : firstParam(params.participantAvatarUrl).trim();
  const participantId = isGroup
    ? conversationId
    : resolvedConversation?.type === 'DIRECT'
      ? resolvedConversation.participant.id
      : firstParam(params.participantId).trim();
  const participantName = isGroup
    ? (resolvedConversation?.type === 'GROUP'
        ? resolvedConversation.name
        : firstParam(params.groupName).trim()) || 'Group'
    : (resolvedConversation?.type === 'DIRECT'
        ? resolvedConversation.participant.displayName
        : firstParam(params.participantName).trim()) || 'Conversation';
  const [groupMembers, setGroupMembers] = useState<GroupDetail['members']>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [historyVersion, setHistoryVersion] = useState(0);
  const [clearedAt, setClearedAt] = useState<string | null>(initialClearedAt);

  useEffect(() => {
    if (!isGroup || !conversationId) return;
    let active = true;
    setGroupMembers([]);
    void getGroupConversation(conversationId)
      .then((group) => {
        if (active) setGroupMembers(group.members);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [conversationId, isGroup]);

  const clearLocalConversationState = useCallback(async (): Promise<void> => {
    await Promise.allSettled([
      discardConversationQueue(conversationId),
      user?.id
        ? removeCachedMessageHistory(user.id, conversationId)
        : Promise.resolve(),
    ]);
  }, [conversationId, discardConversationQueue, user?.id]);

  useEffect(
    () =>
      subscribeToConversationVisibility((visibility) => {
        if (visibility.conversationId !== conversationId) return;
        if (!visibility.deletedAt && visibility.clearedAt === clearedAt) {
          return;
        }
        void clearLocalConversationState().then(() => {
          if (visibility.deletedAt) {
            router.back();
            return;
          }
          setClearedAt(visibility.clearedAt);
          setSearchQuery('');
          setIsSearchOpen(false);
          setHistoryVersion((current) => current + 1);
        });
      }),
    [
      clearLocalConversationState,
      clearedAt,
      conversationId,
      subscribeToConversationVisibility,
    ]
  );

  const confirmClearChat = (): void => {
    Alert.alert(
      'Clear chat?',
      'Messages will be cleared from your account on all of your devices. The other person will keep their copy.',
      [
        { style: 'cancel', text: 'Cancel' },
        {
          style: 'destructive',
          text: 'Clear chat',
          onPress: () => {
            setIsBusy(true);
            void clearConversationAcrossDevices(conversationId)
              .catch(async () => ({
                conversationId,
                clearedAt: await clearConversationMessages(conversationId),
                deletedAt: null,
              }))
              .then(async (visibility) => {
                setClearedAt(visibility.clearedAt);
                await clearLocalConversationState();
              })
              .then(() => {
                setSearchQuery('');
                setIsSearchOpen(false);
                setHistoryVersion((current) => current + 1);
              })
              .catch((error: unknown) => {
                Alert.alert(
                  'Unable to clear chat',
                  error instanceof Error ? error.message : 'Please try again.'
                );
              })
              .finally(() => setIsBusy(false));
          },
        },
      ]
    );
  };

  const confirmDeleteChat = (): void => {
    Alert.alert(
      'Delete chat?',
      'This removes the conversation from your account on all of your devices. The other person will keep their copy, and the chat will reappear if a new message arrives.',
      [
        { style: 'cancel', text: 'Cancel' },
        {
          style: 'destructive',
          text: 'Delete chat',
          onPress: () => {
            setIsBusy(true);
            void deleteConversationAcrossDevices(conversationId)
              .catch(async () => {
                const visibility = await deleteConversation(conversationId);
                return { conversationId, ...visibility };
              })
              .then(async () => {
                await clearLocalConversationState();
                router.back();
              })
              .catch((error: unknown) => {
                Alert.alert(
                  'Unable to delete chat',
                  error instanceof Error ? error.message : 'Please try again.'
                );
              })
              .finally(() => setIsBusy(false));
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      {!hasRouteIdentity && !resolvedConversation ? (
        <View style={styles.loading}>
          {identityError ? (
            <>
              <Text style={{ color: messagingColors[scheme].error }}>
                {identityError}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setIdentityError(null);
                  setIdentityVersion((value) => value + 1);
                }}
              >
                <Text style={{ color: messagingColors[scheme].accentPrimary }}>
                  Try again
                </Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator color={messagingColors[scheme].accentPrimary} />
          )}
        </View>
      ) : (
        <>
          <ChatHeader
            avatarUrl={participantAvatarUrl || null}
            isBusy={isBusy}
            isSearchOpen={isSearchOpen}
            name={participantName}
            onBack={() => router.back()}
            onClearChat={confirmClearChat}
            onCloseSearch={() => {
              setIsSearchOpen(false);
              setSearchQuery('');
            }}
            onDeleteChat={confirmDeleteChat}
            onOpenSearch={() => setIsSearchOpen(true)}
            onOpenInfo={
              isGroup
                ? () =>
                    router.push({
                      pathname: '/(app)/(tabs)/chats/group-info/[groupId]',
                      params: { groupId: conversationId },
                    })
                : undefined
            }
            onSearchQueryChange={setSearchQuery}
            participantId={participantId}
            searchQuery={searchQuery}
            showConversationActions={!isGroup}
          />
          <ChatScreen
            conversationType={isGroup ? 'GROUP' : 'DIRECT'}
            conversationId={conversationId}
            groupMembers={groupMembers}
            hiddenBefore={clearedAt}
            isSearchOpen={isSearchOpen}
            key={`${conversationId}:${historyVersion}`}
            participantAvatarUrl={participantAvatarUrl || null}
            participantName={participantName}
            searchQuery={isSearchOpen ? searchQuery : ''}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center' },
});
