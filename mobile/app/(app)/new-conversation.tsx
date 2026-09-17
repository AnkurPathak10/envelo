import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';

import { UserSearchResult } from '@/components/conversations/user-search-result';
import { colors, radius } from '@/constants/theme';
import { ApiError } from '@/lib/api/client';
import {
  createDirectConversation,
  searchUsers,
  type ConversationParticipant,
} from '@/lib/api/conversations';

function getErrorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Something went wrong. Please try again.';
}

export default function NewConversationScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ConversationParticipant[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [creatingUserId, setCreatingUserId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchVersion, setSearchVersion] = useState(0);
  const requestSequence = useRef(0);
  const isMounted = useRef(true);
  const trimmedQuery = query.trim();
  const scheme = useColorScheme() ?? 'light';
  const c = colors[scheme];
  const styles = createStyles(c);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    const sequence = ++requestSequence.current;
    if (!trimmedQuery) {
      setResults([]);
      setErrorMessage(null);
      setIsSearching(false);
      return;
    }

    setResults([]);
    setErrorMessage(null);
    setIsSearching(true);

    const timer = setTimeout(() => {
      void searchUsers(trimmedQuery)
        .then((users) => {
          if (requestSequence.current === sequence) setResults(users);
        })
        .catch((error: unknown) => {
          if (requestSequence.current === sequence)
            setErrorMessage(getErrorMessage(error));
        })
        .finally(() => {
          if (requestSequence.current === sequence) setIsSearching(false);
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      if (requestSequence.current === sequence) requestSequence.current += 1;
    };
  }, [searchVersion, trimmedQuery]);

  const chooseUser = useCallback(async (userId: string) => {
    setCreatingUserId(userId);
    setErrorMessage(null);
    try {
      await createDirectConversation(userId);
      router.back();
    } catch (error) {
      if (isMounted.current) setErrorMessage(getErrorMessage(error));
    } finally {
      if (isMounted.current) setCreatingUserId(null);
    }
  }, []);

  const retrySearch = useCallback(() => {
    setSearchVersion((version) => version + 1);
  }, []);

  const emptyMessage = !trimmedQuery
    ? 'Search for someone to start a conversation.'
    : !isSearching && !errorMessage
      ? 'No users found.'
      : null;

  return (
    <View style={styles.container}>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        onChangeText={setQuery}
        placeholder="Search by name or email"
        placeholderTextColor={c.textMuted}
        returnKeyType="search"
        style={styles.input}
        value={query}
      />

      {isSearching ? (
        <View style={styles.searching}>
          <ActivityIndicator color={c.accentPrimary} size="small" />
          <Text style={styles.searchingText}>Searching…</Text>
        </View>
      ) : null}

      {errorMessage ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          {creatingUserId === null && trimmedQuery ? (
            <Pressable
              accessibilityRole="button"
              onPress={retrySearch}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <FlatList
        contentContainerStyle={
          results.length === 0 ? styles.emptyList : undefined
        }
        data={results}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(user) => user.id}
        ListEmptyComponent={
          emptyMessage ? (
            <Text style={styles.emptyText}>{emptyMessage}</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <UserSearchResult
            isCreating={creatingUserId === item.id}
            isDisabled={creatingUserId !== null}
            onPress={() => void chooseUser(item.id)}
            user={item}
          />
        )}
        style={styles.list}
      />
    </View>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    container: { backgroundColor: c.bgBase, flex: 1, paddingTop: 16 },
    emptyList: { flexGrow: 1, justifyContent: 'center' },
    emptyText: {
      color: c.textMuted,
      fontSize: 15,
      lineHeight: 22,
      padding: 32,
      textAlign: 'center',
    },
    errorContainer: {
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 12,
    },
    errorText: { color: c.error, fontSize: 14, textAlign: 'center' },
    input: {
      backgroundColor: c.bgSurface,
      borderColor: c.border,
      borderRadius: radius.sm,
      borderWidth: 1,
      color: c.textPrimary,
      fontSize: 16,
      marginHorizontal: 20,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    list: { flex: 1, marginTop: 8 },
    retryButton: { paddingHorizontal: 12, paddingVertical: 8 },
    retryText: { color: c.accentPrimary, fontSize: 14, fontWeight: '600' },
    searching: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 20,
      paddingTop: 12,
    },
    searchingText: { color: c.textMuted, fontSize: 14 },
  });
