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
import { ApiError } from '@/lib/api/client';
import {
  getConversations,
  type ConversationListItem,
} from '@/lib/api/conversations';
import { useAuth } from '@/lib/auth/AuthContext';
import { useTemporarySocketTest } from '@/lib/socket/useTemporarySocketTest';

function getErrorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Unable to load conversations. Please try again.';
}

export default function HomeScreen() {
  const { accessToken, signOut } = useAuth();
  const [conversations, setConversations] = useState<ConversationListItem[]>(
    []
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadVersion, setReloadVersion] = useState(0);
  const hasLoaded = useRef(false);
  const scheme = useColorScheme() ?? 'light';
  const c = colors[scheme];
  const styles = createStyles(c);

  useTemporarySocketTest(accessToken);

  const openNewConversation = useCallback(() => {
    router.push('/(app)/new-conversation');
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      if (reloadVersion > 0 || !hasLoaded.current) setIsLoading(true);
      setErrorMessage(null);

      void getConversations()
        .then((items) => {
          if (!isActive) return;
          setConversations(items);
          hasLoaded.current = true;
        })
        .catch((error: unknown) => {
          if (!isActive) return;
          setErrorMessage(getErrorMessage(error));
        })
        .finally(() => {
          if (isActive) setIsLoading(false);
        });

      return () => {
        isActive = false;
      };
    }, [reloadVersion])
  );

  const retry = useCallback(() => {
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
          renderItem={({ item }) => <ConversationRow conversation={item} />}
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
