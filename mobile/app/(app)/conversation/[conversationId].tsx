import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ChatHeader } from '@/components/chat/chat-header';
import { ChatScreen } from '@/components/chat/chat-screen';
import {
  clearConversationMessages,
  deleteConversation,
} from '@/lib/api/conversations';
import { useAuth } from '@/lib/auth/AuthContext';
import { removeCachedMessageHistory } from '@/lib/cache/messageCache';
import { useSocket } from '@/lib/socket/SocketContext';

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
  }>();
  const conversationId = firstParam(params.conversationId);
  const initialClearedAt = firstParam(params.clearedAt).trim() || null;
  const participantAvatarUrl = firstParam(params.participantAvatarUrl).trim();
  const participantId = firstParam(params.participantId).trim();
  const participantName =
    firstParam(params.participantName).trim() || 'Conversation';
  const [isBusy, setIsBusy] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [historyVersion, setHistoryVersion] = useState(0);
  const [clearedAt, setClearedAt] = useState<string | null>(initialClearedAt);

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
        onSearchQueryChange={setSearchQuery}
        participantId={participantId}
        searchQuery={searchQuery}
      />
      <ChatScreen
        conversationId={conversationId}
        hiddenBefore={clearedAt}
        isSearchOpen={isSearchOpen}
        key={`${conversationId}:${historyVersion}`}
        participantName={participantName}
        searchQuery={isSearchOpen ? searchQuery : ''}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
