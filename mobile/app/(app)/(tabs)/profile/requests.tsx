import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ConversationAvatar } from '@/components/conversations/conversation-avatar';
import { messagingColors as colors, radius, spacing } from '@/constants/theme';
import { ApiError } from '@/lib/api/client';
import {
  acceptFriendRequest,
  rejectFriendRequest,
  type FriendRequest,
} from '@/lib/api/friends';
import { useFriendRequests } from '@/lib/friends/FriendRequestsContext';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

export default function PendingRequestsScreen() {
  const c = colors[useAppColorScheme()];
  const styles = createStyles(c);
  const { requests, loading, error: loadError, refresh, notifyChanged } =
    useFriendRequests();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const respond = async (request: FriendRequest, accept: boolean) => {
    setBusyId(request.id);
    setActionError(null);
    try {
      if (accept) await acceptFriendRequest(request.id);
      else await rejectFriendRequest(request.id);
      await notifyChanged();
    } catch (caught) {
      setActionError(
        caught instanceof ApiError
          ? caught.message
          : 'Unable to update this request.'
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.screen}>
      {loadError || actionError ? (
        <Text style={styles.error}>{actionError ?? loadError}</Text>
      ) : null}
      {loading && requests.length === 0 ? (
        <ActivityIndicator color={c.accentPrimary} style={styles.loading} />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          onRefresh={() => void refresh()}
          refreshing={loading}
          ListEmptyComponent={
            <Text style={styles.empty}>No pending requests.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <ConversationAvatar
                avatarUrl={item.requester.avatarUrl}
                name={item.requester.displayName}
                size={46}
                userId={item.requester.id}
              />
              <View style={styles.details}>
                <Text numberOfLines={1} style={styles.name}>
                  {item.requester.displayName}
                </Text>
                <Text numberOfLines={1} style={styles.email}>
                  {item.requester.email}
                </Text>
              </View>
              {busyId === item.id ? (
                <ActivityIndicator color={c.accentPrimary} />
              ) : (
                <View style={styles.actions}>
                  <Pressable
                    accessibilityLabel={`Accept ${item.requester.displayName}`}
                    accessibilityRole="button"
                    onPress={() => void respond(item, true)}
                    style={styles.accept}
                  >
                    <Text style={styles.acceptText}>Accept</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`Reject ${item.requester.displayName}`}
                    accessibilityRole="button"
                    onPress={() => void respond(item, false)}
                    style={styles.reject}
                  >
                    <Text style={styles.rejectText}>Reject</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    accept: {
      backgroundColor: c.accentPrimary,
      borderRadius: radius.md,
      paddingHorizontal: 11,
      paddingVertical: spacing.sm,
    },
    acceptText: { color: c.onAccent, fontSize: 13, fontWeight: '700' },
    actions: { alignItems: 'center', gap: spacing.xs },
    details: { flex: 1, gap: spacing.xs, minWidth: 0 },
    email: { color: c.textMuted, fontSize: 12 },
    empty: {
      color: c.textMuted,
      fontSize: 15,
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
    reject: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
    rejectText: { color: c.textMuted, fontSize: 12, fontWeight: '600' },
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
