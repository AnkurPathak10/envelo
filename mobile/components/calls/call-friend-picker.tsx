import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { FriendPickerRow } from '@/components/friends/friend-picker-row';
import { colors, spacing } from '@/constants/theme';
import type { ConversationParticipant } from '@/lib/api/conversations';
import { getFriends } from '@/lib/api/friends';
import { useCall } from '@/lib/calls/CallContext';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

export function CallFriendPicker({ close }: { close: () => void }) {
  const call = useCall();
  const c = colors[useAppColorScheme()];
  const [friends, setFriends] = useState<ConversationParticipant[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let alive = true;
    setLoading(true);
    getFriends()
      .then((items) => {
        if (alive) {
          setFriends(
            items.sort((a, b) => a.displayName.localeCompare(b.displayName))
          );
          setError(null);
        }
      })
      .catch(() => {
        if (alive) setError('Unable to load friends.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [version]);
  const excluded = new Set([
    ...(call.active?.participants ?? []).map((p) => p.id),
    ...(call.active?.invitedUserIds ?? []),
  ]);
  const items = friends.filter(
    (p) =>
      !excluded.has(p.id) &&
      `${p.displayName} ${p.email}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase())
  );
  return (
    <View
      accessibilityViewIsModal
      style={[styles.panel, { backgroundColor: c.bgBase }]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.textPrimary }]}>
          Add to call
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close friend picker"
          onPress={close}
          style={styles.close}
        >
          <Text style={{ color: c.accentPrimary }}>Done</Text>
        </Pressable>
      </View>
      <Text style={{ color: c.textMuted }}>
        Invite any of your accepted friends.
      </Text>
      <TextInput
        accessibilityLabel="Search friends"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        autoCapitalize="none"
        placeholder="Search friends"
        placeholderTextColor={c.textMuted}
        style={[
          styles.search,
          { color: c.textPrimary, backgroundColor: c.bgSurface },
        ]}
      />
      {!!notice && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: c.accentPrimary }}
        >
          {notice}
        </Text>
      )}
      {(error || call.error) && (
        <Text accessibilityRole="alert" style={{ color: c.error }}>
          {error ?? call.error}
        </Text>
      )}
      {error && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setVersion((v) => v + 1)}
          style={styles.close}
        >
          <Text style={{ color: c.accentPrimary }}>Retry</Text>
        </Pressable>
      )}
      {loading ? (
        <ActivityIndicator color={c.accentPrimary} />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={items}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={{ color: c.textMuted, padding: spacing.lg }}>
              No friends available to invite.
            </Text>
          }
          renderItem={({ item }) => (
            <FriendPickerRow
              friend={item}
              invite
              disabled={pending}
              onPress={() => {
                if (pending) return;
                setPending(true);
                call.clearError();
                void call
                  .invite(item.id)
                  .then((ok) => {
                    if (ok) setNotice(`${item.displayName} is ringing…`);
                  })
                  .finally(() => setPending(false));
              }}
            />
          )}
        />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  panel: {
    ...StyleSheet.absoluteFillObject,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 22, fontWeight: '700' },
  close: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  search: {
    borderRadius: 24,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
});
