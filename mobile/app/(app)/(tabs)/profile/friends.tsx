import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ConversationAvatar } from '@/components/conversations/conversation-avatar';
import { messagingColors as colors, spacing } from '@/constants/theme';
import { ApiError } from '@/lib/api/client';
import {
  createDirectConversation,
  type ConversationParticipant,
} from '@/lib/api/conversations';
import { getFriends } from '@/lib/api/friends';
import { useFriendRequests } from '@/lib/friends/FriendRequestsContext';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

export default function FriendsScreen() {
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const styles = createStyles(c);
  const { revision } = useFriendRequests();
  const [friends, setFriends] = useState<ConversationParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void revision;
      let active = true;
      setLoading(true);
      void getFriends()
        .then((items) => {
          if (active) {
            setFriends(items);
            setError(null);
          }
        })
        .catch(() => {
          if (active) setError('Unable to load friends. Pull to try again.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [revision])
  );

  const refresh = async () => {
    try {
      setFriends(await getFriends());
      setError(null);
    } catch {
      setError('Unable to load friends. Pull to try again.');
    }
  };

  const openFriend = async (friend: ConversationParticipant) => {
    setOpeningId(friend.id);
    setError(null);
    try {
      const conversation = await createDirectConversation(friend.id);
      router.push({
        pathname: '/(app)/(tabs)/chats/conversation/[conversationId]',
        params: {
          conversationId: conversation.id,
          clearedAt: conversation.clearedAt ?? '',
          participantAvatarUrl: friend.avatarUrl ?? '',
          participantId: friend.id,
          participantName: friend.displayName,
        },
      });
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Unable to open chat.'
      );
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <View style={styles.screen}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && friends.length === 0 ? (
        <ActivityIndicator color={c.accentPrimary} style={styles.loading} />
      ) : (
        <FlatList
          data={friends}
          keyExtractor={(item) => item.id}
          onRefresh={() => void refresh()}
          refreshing={loading}
          ListEmptyComponent={
            <Text style={styles.empty}>
              No friends yet. Search for someone to send a request.
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => void openFriend(item)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <ConversationAvatar
                avatarUrl={item.avatarUrl}
                name={item.displayName}
                size={46}
                userId={item.id}
              />
              <View style={styles.details}>
                <Text style={styles.name}>{item.displayName}</Text>
                <Text style={styles.email}>{item.email}</Text>
              </View>
              {openingId === item.id ? (
                <ActivityIndicator color={c.accentPrimary} />
              ) : (
                <Text style={styles.chat}>Chat</Text>
              )}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    chat: { color: c.accentPrimary, fontSize: 14, fontWeight: '700' },
    details: { flex: 1, gap: spacing.xs },
    email: { color: c.textMuted, fontSize: 13 },
    empty: {
      color: c.textMuted,
      fontSize: 15,
      lineHeight: 22,
      padding: spacing.xl,
      textAlign: 'center',
    },
    error: {
      color: c.error,
      fontSize: 14,
      padding: spacing.md,
      textAlign: 'center',
    },
    loading: { marginTop: spacing.xl },
    name: { color: c.textPrimary, fontSize: 16, fontWeight: '600' },
    pressed: { backgroundColor: c.bgSurface },
    row: {
      alignItems: 'center',
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    screen: { backgroundColor: c.bgBase, flex: 1 },
  });
