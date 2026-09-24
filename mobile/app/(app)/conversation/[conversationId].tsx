import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
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
  const { discardConversationQueue } = useSocket();
  const params = useLocalSearchParams<{
    conversationId?: string | string[];
    participantAvatarUrl?: string | string[];
    participantId?: string | string[];
    participantName?: string | string[];
  }>();
  const conversationId = firstParam(params.conversationId);
  const participantAvatarUrl = firstParam(params.participantAvatarUrl).trim();
  const participantId = firstParam(params.participantId).trim();
  const participantName =
    firstParam(params.participantName).trim() || 'Conversation';
  const [isBusy, setIsBusy] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [historyVersion, setHistoryVersion] = useState(0);

  const clearLocalConversationState = async (): Promise<void> => {
    await discardConversationQueue(conversationId);
    if (user?.id) {
      await removeCachedMessageHistory(user.id, conversationId);
    }
  };

  const confirmClearChat = (): void => {
    Alert.alert(
      'Clear chat?',
      'This removes every message in this conversation for both people. The conversation itself will remain.',
      [
        { style: 'cancel', text: 'Cancel' },
        {
          style: 'destructive',
          text: 'Clear chat',
          onPress: () => {
            setIsBusy(true);
            void clearConversationMessages(conversationId)
              .then(clearLocalConversationState)
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
      'This permanently deletes the conversation and its messages for both people.',
      [
        { style: 'cancel', text: 'Cancel' },
        {
          style: 'destructive',
          text: 'Delete chat',
          onPress: () => {
            setIsBusy(true);
            void deleteConversation(conversationId)
              .then(clearLocalConversationState)
              .then(() => router.back())
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
        isSearchOpen={isSearchOpen}
        key={`${conversationId}:${historyVersion}`}
        searchQuery={isSearchOpen ? searchQuery : ''}
      />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });
