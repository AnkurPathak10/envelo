import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConversationRow } from '@/components/conversations/conversation-row';
import { EmptyConversationList } from '@/components/conversations/empty-conversation-list';
import { colors, radius } from '@/constants/theme';
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
import { useSocket } from '@/lib/socket/SocketContext';

function getErrorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Unable to load conversations. Please try again.';
}

export default function HomeScreen() {
  const { signOut, user } = useAuth();
  const { acknowledgeDeliveredMessages } = useSocket();
  const [conversations, setConversations] = useState<ConversationListItem[]>(
    []
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadVersion, setReloadVersion] = useState(0);
  const hasLoaded = useRef(false);
  const retryRequested = useRef(false);
  const scheme = useColorScheme() ?? 'light';
  const c = colors[scheme];
  const styles = createStyles(c);

  const openNewConversation = useCallback(() => {
    router.push('/(app)/new-conversation');
  }, []);

  const openConversation = useCallback((conversation: ConversationListItem) => {
    router.push({
      pathname: '/(app)/conversation/[conversationId]',
      params: {
        conversationId: conversation.id,
        participantName: conversation.participant.displayName,
      },
    });
  }, []);

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
        const hadInMemoryData = hasLoaded.current;
        const cachedPromise = getCachedConversations(user.id).catch(() => null);
        const livePromise = getConversations().then(
          (items) => ({ ok: true as const, items }),
          (error: unknown) => ({ ok: false as const, error })
        );
        const cached = await cachedPromise;

        if (isActive && cached) {
          setConversations(cached);
          hasLoaded.current = true;
          setIsLoading(false);
        }

        try {
          const liveResult = await livePromise;
          if (!liveResult.ok) throw liveResult.error;
          const { items } = liveResult;
          void Promise.all([
            saveCachedConversations(user.id, items),
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
          setConversations(items);
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
    }, [acknowledgeDeliveredMessages, reloadVersion, user?.id])
  );

  const retry = useCallback(() => {
    retryRequested.current = true;
    setIsLoading(true);
    setReloadVersion((version) => version + 1);
  }, []);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>Envelo</Text>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            onPress={openNewConversation}
            style={styles.headerButton}
          >
            <Text style={styles.newConversationText}>New conversation</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => void signOut()}
            style={styles.headerButton}
          >
            <Text style={styles.logoutText}>Log out</Text>
          </Pressable>
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
      padding: 32,
    },
    emptyList: { flexGrow: 1 },
    errorText: {
      color: c.error,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
    },
    header: {
      alignItems: 'center',
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    headerActions: { alignItems: 'flex-end', gap: 4 },
    headerButton: { paddingHorizontal: 4, paddingVertical: 4 },
    list: { flex: 1 },
    logoutText: { color: c.textMuted, fontSize: 14, fontWeight: '500' },
    newConversationText: {
      color: c.accentPrimary,
      fontSize: 14,
      fontWeight: '600',
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
    retryButton: {
      backgroundColor: c.accentPrimary,
      borderRadius: radius.sm,
      marginTop: 20,
      paddingHorizontal: 18,
      paddingVertical: 12,
    },
    retryButtonText: { color: c.bgBase, fontSize: 15, fontWeight: '600' },
    safeArea: { backgroundColor: c.bgBase, flex: 1 },
    stateText: { color: c.textMuted, fontSize: 15, marginTop: 12 },
    title: { color: c.textPrimary, fontSize: 28, fontWeight: '700' },
  });
