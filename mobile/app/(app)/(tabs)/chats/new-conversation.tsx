import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  FriendSearchRow,
  type FriendSearchAction,
} from '@/components/friends/friend-search-row';
import { colors, radius } from '@/constants/theme';
import { ApiError } from '@/lib/api/client';
import {
  createDirectConversation,
  searchUsers,
  type SearchUser,
} from '@/lib/api/conversations';
import {
  acceptFriendRequest,
  rejectFriendRequest,
  sendFriendRequest,
} from '@/lib/api/friends';
import { useFriendRequests } from '@/lib/friends/FriendRequestsContext';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

function getErrorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Something went wrong. Please try again.';
}

export default function NewConversationScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [creatingUserId, setCreatingUserId] = useState<string | null>(null);
  const [searchErrorMessage, setSearchErrorMessage] = useState<string | null>(
    null
  );
  const [creationErrorMessage, setCreationErrorMessage] = useState<
    string | null
  >(null);
  const [searchVersion, setSearchVersion] = useState(0);
  const requestSequence = useRef(0);
  const isMounted = useRef(true);
  const observedFriendRevision = useRef(0);
  const trimmedQuery = query.trim();
  const scheme = useAppColorScheme();
  const { revision: friendRevision, notifyChanged } = useFriendRequests();
  const c = colors[scheme];
  const styles = createStyles(c);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (observedFriendRevision.current === friendRevision) return;
    observedFriendRevision.current = friendRevision;
    setSearchVersion((version) => version + 1);
  }, [friendRevision]);

  useEffect(() => {
    const sequence = ++requestSequence.current;
    if (!trimmedQuery) {
      setResults([]);
      setSearchErrorMessage(null);
      setCreationErrorMessage(null);
      setIsSearching(false);
      return;
    }

    setResults([]);
    setSearchErrorMessage(null);
    setCreationErrorMessage(null);
    setIsSearching(true);

    const timer = setTimeout(() => {
      void searchUsers(trimmedQuery)
        .then((users) => {
          if (requestSequence.current === sequence) setResults(users);
        })
        .catch((error: unknown) => {
          if (requestSequence.current === sequence)
            setSearchErrorMessage(getErrorMessage(error));
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

  const chooseUser = useCallback(
    async (action: FriendSearchAction, user: SearchUser) => {
      setCreatingUserId(user.id);
      setCreationErrorMessage(null);
      try {
        if (action === 'chat') {
          const conversation = await createDirectConversation(user.id);
          router.replace({
            pathname: '/(app)/(tabs)/chats/conversation/[conversationId]',
            params: {
              conversationId: conversation.id,
              clearedAt: conversation.clearedAt ?? '',
              participantAvatarUrl: user.avatarUrl ?? '',
              participantId: user.id,
              participantName: user.displayName,
            },
          });
        } else if (action === 'request') {
          const response = await sendFriendRequest(user.id);
          setResults((current) =>
            current.map((item) =>
              item.id === user.id
                ? {
                    ...item,
                    friendStatus:
                      response.friendship.status === 'ACCEPTED'
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
          setResults((current) =>
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
      } catch (error) {
        if (isMounted.current) setCreationErrorMessage(getErrorMessage(error));
      } finally {
        if (isMounted.current) setCreatingUserId(null);
      }
    },
    [notifyChanged]
  );

  const retrySearch = useCallback(() => {
    setSearchVersion((version) => version + 1);
  }, []);

  const emptyMessage = !trimmedQuery
    ? 'Search for someone to start a conversation.'
    : !isSearching && !searchErrorMessage
      ? 'No users found.'
      : null;

  return (
    <View style={styles.container}>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        maxLength={100}
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

      {searchErrorMessage ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{searchErrorMessage}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={retrySearch}
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      {creationErrorMessage ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{creationErrorMessage}</Text>
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
          <FriendSearchRow
            busy={creatingUserId === item.id}
            onAction={(action, user) => void chooseUser(action, user)}
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
