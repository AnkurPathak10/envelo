import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Stack, router, useLocalSearchParams, type Href } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConversationAvatar } from '@/components/conversations/conversation-avatar';
import { messagingColors as colors, radius, spacing } from '@/constants/theme';
import {
  addGroupMembers,
  getGroupConversation,
  type ConversationParticipant,
} from '@/lib/api/conversations';
import { getFriends } from '@/lib/api/friends';
import { useGroupCreation } from '@/lib/groups/GroupCreationContext';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

export default function NewGroupScreen() {
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const styles = createStyles(c);
  const { selectedFriends, toggleFriend, retainFriends, reset } =
    useGroupCreation();
  const { addToGroup } = useLocalSearchParams<{ addToGroup?: string }>();
  const groupId = typeof addToGroup === 'string' ? addToGroup : '';
  const [friends, setFriends] = useState<ConversationParticipant[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (groupId) reset();
  }, [groupId, reset]);

  useFocusEffect(
    useCallback(() => {
      void refreshVersion;
      let active = true;
      setLoading(true);
      void Promise.all([
        getFriends(),
        groupId ? getGroupConversation(groupId) : Promise.resolve(null),
      ])
        .then(([items, group]) => {
          if (!active) return;
          const memberIds = new Set(
            group?.members.map((member) => member.id) ?? []
          );
          const eligible = items.filter((friend) => !memberIds.has(friend.id));
          setFriends(
            eligible.sort((a, b) => a.displayName.localeCompare(b.displayName))
          );
          retainFriends(new Set(eligible.map((friend) => friend.id)));
          setError(null);
        })
        .catch(() => {
          if (active) setError('Unable to load friends. Try again.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [groupId, refreshVersion, retainFriends])
  );

  const selectedIds = useMemo(
    () => new Set(selectedFriends.map((friend) => friend.id)),
    [selectedFriends]
  );
  const filteredFriends = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return search
      ? friends.filter((friend) =>
          `${friend.displayName} ${friend.email}`
            .toLocaleLowerCase()
            .includes(search)
        )
      : friends;
  }, [friends, query]);

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <Stack.Screen
        options={{ title: groupId ? 'Add members' : 'New group' }}
      />
      <View style={styles.top}>
        <Text style={styles.count}>{selectedFriends.length} selected</Text>
        {selectedFriends.length > 0 ? (
          <ScrollView
            contentContainerStyle={styles.chips}
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
          >
            {selectedFriends.map((friend) => (
              <Pressable
                accessibilityLabel={`Remove ${friend.displayName}`}
                accessibilityRole="button"
                key={friend.id}
                onPress={() => toggleFriend(friend)}
                style={styles.chip}
              >
                <ConversationAvatar
                  avatarUrl={friend.avatarUrl}
                  name={friend.displayName}
                  size={30}
                  userId={friend.id}
                />
                <Text numberOfLines={1} style={styles.chipText}>
                  {friend.displayName}
                </Text>
                <MaterialIcons color={c.textMuted} name="close" size={17} />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <View style={styles.searchBox}>
          <MaterialIcons color={c.textMuted} name="search" size={22} />
          <TextInput
            accessibilityLabel="Search friends"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setQuery}
            placeholder="Search friends"
            placeholderTextColor={c.textMuted}
            style={styles.searchInput}
            value={query}
          />
        </View>
      </View>

      {error ? (
        <View style={styles.notice}>
          <Text style={styles.error}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRefreshVersion((version) => version + 1)}
          >
            <Text style={styles.retry}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {loading && friends.length === 0 ? (
        <ActivityIndicator color={c.accentPrimary} style={styles.loading} />
      ) : (
        <FlatList
          data={filteredFriends}
          extraData={selectedIds}
          keyExtractor={(friend) => friend.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            !loading && !error ? (
              <Text style={styles.empty}>
                {query.trim()
                  ? 'No matching friends.'
                  : groupId
                    ? 'No friends available to add.'
                    : 'No friends yet. Add a friend before creating a group.'}
              </Text>
            ) : null
          }
          renderItem={({ item }) => {
            const selected = selectedIds.has(item.id);
            return (
              <Pressable
                accessibilityLabel={`${selected ? 'Remove' : 'Select'} ${item.displayName}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                onPress={() => toggleFriend(item)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <ConversationAvatar
                  avatarUrl={item.avatarUrl}
                  name={item.displayName}
                  size={44}
                  userId={item.id}
                />
                <View style={styles.person}>
                  <Text numberOfLines={1} style={styles.name}>
                    {item.displayName}
                  </Text>
                  <Text numberOfLines={1} style={styles.email}>
                    {item.email}
                  </Text>
                </View>
                <MaterialIcons
                  color={selected ? c.accentPrimary : c.textMuted}
                  name={selected ? 'check-circle' : 'radio-button-unchecked'}
                  size={25}
                />
              </Pressable>
            );
          }}
          style={styles.list}
        />
      )}

      <View style={styles.footer}>
        <Pressable
          accessibilityLabel={
            groupId ? 'Add selected members' : 'Continue to group details'
          }
          accessibilityRole="button"
          accessibilityState={{
            disabled:
              selectedFriends.length === 0 ||
              loading ||
              adding ||
              Boolean(error),
          }}
          disabled={
            selectedFriends.length === 0 || loading || adding || Boolean(error)
          }
          onPress={() => {
            if (!groupId) {
              router.push('/(app)/(tabs)/chats/new-group-details' as Href);
              return;
            }
            setAdding(true);
            void addGroupMembers(
              groupId,
              selectedFriends.map((friend) => friend.id)
            )
              .then(() => {
                reset();
                router.back();
              })
              .catch((caught: unknown) =>
                setError(
                  caught instanceof Error
                    ? caught.message
                    : 'Unable to add members.'
                )
              )
              .finally(() => setAdding(false));
          }}
          style={({ pressed }) => [
            styles.next,
            (selectedFriends.length === 0 ||
              loading ||
              adding ||
              Boolean(error)) &&
              styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <MaterialIcons
            color={c.onAccent}
            name={groupId ? 'person-add' : 'arrow-forward'}
            size={27}
          />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    chip: {
      alignItems: 'center',
      backgroundColor: c.bgSurface,
      borderColor: c.border,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: spacing.xs,
      maxWidth: 180,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    chipText: { color: c.textPrimary, flexShrink: 1, fontSize: 13 },
    chips: { gap: spacing.sm, paddingBottom: spacing.md },
    count: { color: c.textMuted, fontSize: 14, fontWeight: '600' },
    disabled: { opacity: 0.45 },
    email: { color: c.textMuted, fontSize: 13 },
    empty: { color: c.textMuted, padding: spacing.xl, textAlign: 'center' },
    error: { color: c.error, fontSize: 14 },
    footer: {
      alignItems: 'flex-end',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    list: { flex: 1 },
    loading: { marginTop: spacing.xl },
    name: { color: c.textPrimary, fontSize: 16, fontWeight: '600' },
    next: {
      alignItems: 'center',
      backgroundColor: c.accentPrimary,
      borderRadius: 30,
      elevation: 4,
      height: 56,
      justifyContent: 'center',
      width: 56,
    },
    notice: { alignItems: 'center', gap: spacing.sm, padding: spacing.md },
    person: { flex: 1, gap: spacing.xs, minWidth: 0 },
    pressed: { opacity: 0.7 },
    retry: { color: c.accentPrimary, fontWeight: '700' },
    row: {
      alignItems: 'center',
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: spacing.md,
      minHeight: 70,
      paddingHorizontal: spacing.lg,
    },
    screen: { backgroundColor: c.bgBase, flex: 1 },
    searchBox: {
      alignItems: 'center',
      backgroundColor: c.bgSurface,
      borderColor: c.border,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: spacing.sm,
      minHeight: 46,
      paddingHorizontal: spacing.md,
    },
    searchInput: { color: c.textPrimary, flex: 1, fontSize: 16 },
    top: {
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
  });
