import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConversationAvatar } from '@/components/conversations/conversation-avatar';
import { ImageViewerModal } from '@/components/media/image-viewer-modal';
import { messagingColors as colors, radius, spacing } from '@/constants/theme';
import {
  dissolveGroup,
  getGroupConversation,
  getMessageHistory,
  removeGroupMember,
  setGroupMemberRole,
  setGroupMuted,
  updateGroupConversation,
  type GroupDetail,
} from '@/lib/api/conversations';
import { ApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.';
}

export default function GroupInfoScreen() {
  const { groupId: rawId } = useLocalSearchParams<{
    groupId: string | string[];
  }>();
  const groupId = typeof rawId === 'string' ? rawId : (rawId?.[0] ?? '');
  const { user } = useAuth();
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const styles = createStyles(c);
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'members' | 'media'>('members');
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(false);
  const [description, setDescription] = useState('');
  const [media, setMedia] = useState<{ id: string; url: string }[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const detail = await getGroupConversation(groupId);
      setGroup(detail);
      if (
        !detail.members.some(
          (member) => member.id === user?.id && member.role === 'ADMIN'
        )
      ) {
        editingRef.current = false;
        setEditing(false);
      }
      if (!editingRef.current) setDescription(detail.description ?? '');
      setError(null);
    } catch (caught) {
      setError(message(caught));
      if (
        caught instanceof ApiError &&
        (caught.status === 403 || caught.status === 404)
      ) {
        setGroup(null);
      }
    }
  }, [groupId, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      const timer = setInterval(() => void refresh(), 10_000);
      const foreground = AppState.addEventListener('change', (state) => {
        if (state === 'active') void refresh();
      });
      return () => {
        clearInterval(timer);
        foreground.remove();
      };
    }, [refresh])
  );

  const run = (operation: () => Promise<GroupDetail | void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    void operation()
      .then((result) => {
        if (result) setGroup(result);
        return refresh();
      })
      .catch((caught: unknown) => setError(message(caught)))
      .finally(() => setBusy(false));
  };

  const exitGroup = (operation: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    void operation()
      .then(() => router.dismissAll())
      .catch((caught: unknown) => {
        setError(message(caught));
        setBusy(false);
      });
  };

  const loadMedia = async () => {
    if (mediaLoading) return;
    setMediaLoading(true);
    try {
      const images: { id: string; url: string }[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 20; page += 1) {
        const history = await getMessageHistory(groupId, cursor ?? undefined);
        images.push(
          ...history.messages
            .filter((item) => item.mediaUrl && item.audioDurationMs === null)
            .map((item) => ({ id: item.id, url: item.mediaUrl! }))
        );
        cursor = history.nextCursor;
        if (!cursor) break;
      }
      setMedia(images);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setMediaLoading(false);
    }
  };

  const confirmLeave = () => {
    if (!group || !user) return;
    const admins = group.members.filter((member) => member.role === 'ADMIN');
    if (
      admins.length === 1 &&
      admins[0].id === user.id &&
      group.members.length > 1
    ) {
      Alert.alert(
        'Another admin is needed',
        'Promote a member before leaving, or dissolve the group for everyone.'
      );
      return;
    }
    Alert.alert(
      'Leave group?',
      'You will lose access to this group and its messages.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => exitGroup(() => removeGroupMember(groupId, user.id)),
        },
      ]
    );
  };

  const showMemberActions = (member: GroupDetail['members'][number]) => {
    if (!group) return;
    const adminCount = group.members.filter(
      (item) => item.role === 'ADMIN'
    ).length;
    const options: {
      text: string;
      style?: 'cancel' | 'destructive';
      onPress?: () => void;
    }[] = [{ text: 'Cancel', style: 'cancel' }];
    if (member.role === 'MEMBER') {
      options.push({
        text: 'Promote to admin',
        onPress: () =>
          run(() => setGroupMemberRole(groupId, member.id, 'ADMIN')),
      });
    } else if (adminCount > 1) {
      options.push({
        text: 'Demote from admin',
        onPress: () =>
          run(() => setGroupMemberRole(groupId, member.id, 'MEMBER')),
      });
    }
    options.push({
      text: 'Remove from group',
      style: 'destructive',
      onPress: () =>
        Alert.alert(
          'Remove member?',
          `${member.displayName} will lose access to this group.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Remove',
              style: 'destructive',
              onPress: () =>
                run(async () => {
                  await removeGroupMember(groupId, member.id);
                }),
            },
          ]
        ),
    });
    Alert.alert(member.displayName, undefined, options);
  };

  const isAdmin =
    group?.members.some(
      (member) => member.id === user?.id && member.role === 'ADMIN'
    ) ?? false;
  const soleAdmin =
    isAdmin &&
    group?.members.filter((member) => member.role === 'ADMIN').length === 1;

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      {!group ? (
        <View style={styles.center}>
          {error ? (
            <>
              <Text style={styles.error}>{error}</Text>
              <Pressable onPress={() => void refresh()}>
                <Text style={styles.link}>Try again</Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator color={c.accentPrimary} />
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            <ConversationAvatar
              avatarUrl={group.photoUrl}
              name={group.name}
              size={104}
              userId={group.id}
            />
            <Text style={styles.groupName}>{group.name}</Text>
            <Text style={styles.muted}>
              {group.members.length}{' '}
              {group.members.length === 1 ? 'member' : 'members'}
            </Text>
          </View>
          <View style={styles.actions}>
            <Action
              icon="chat-bubble-outline"
              label="Message"
              onPress={() => router.back()}
              styles={styles}
            />
            <Action
              icon={
                group.mutedAt ? 'notifications-active' : 'notifications-off'
              }
              label={group.mutedAt ? 'Unmute' : 'Mute'}
              onPress={() => run(() => setGroupMuted(groupId, !group.mutedAt))}
              styles={styles}
            />
            <Action
              icon="exit-to-app"
              label="Leave"
              onPress={confirmLeave}
              styles={styles}
            />
          </View>
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Description</Text>
              {isAdmin && !editing ? (
                <Pressable
                  accessibilityLabel="Edit group description"
                  onPress={() => {
                    editingRef.current = true;
                    setEditing(true);
                  }}
                >
                  <MaterialIcons
                    name="edit"
                    color={c.accentPrimary}
                    size={22}
                  />
                </Pressable>
              ) : null}
            </View>
            {editing ? (
              <>
                <TextInput
                  accessibilityLabel="Group description"
                  multiline
                  maxLength={1000}
                  onChangeText={setDescription}
                  placeholder="Add a group description"
                  placeholderTextColor={c.textMuted}
                  style={styles.descriptionInput}
                  value={description}
                />
                <View style={styles.editActions}>
                  <Pressable
                    onPress={() => {
                      setDescription(group.description ?? '');
                      editingRef.current = false;
                      setEditing(false);
                    }}
                  >
                    <Text style={styles.link}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    disabled={busy}
                    onPress={() =>
                      run(async () => {
                        const updated = await updateGroupConversation(groupId, {
                          description: description.trim() || null,
                        });
                        editingRef.current = false;
                        setEditing(false);
                        return updated;
                      })
                    }
                  >
                    <Text style={styles.link}>Save</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Text style={styles.description}>
                {group.description || 'No description yet.'}
              </Text>
            )}
          </View>
          {isAdmin ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/(app)/(tabs)/chats/new-group',
                  params: { addToGroup: groupId },
                })
              }
              style={styles.addRow}
            >
              <MaterialIcons
                name="person-add"
                color={c.accentPrimary}
                size={24}
              />
              <Text style={styles.addText}>Add members</Text>
            </Pressable>
          ) : null}
          <View style={styles.tabs}>
            {(['members', 'media'] as const).map((item) => (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === item }}
                key={item}
                onPress={() => {
                  setTab(item);
                  if (item === 'media') void loadMedia();
                }}
                style={[styles.tab, tab === item && styles.activeTab]}
              >
                <Text
                  style={[styles.tabText, tab === item && styles.activeTabText]}
                >
                  {item === 'members' ? 'Members' : 'Media'}
                </Text>
              </Pressable>
            ))}
          </View>
          {tab === 'members' ? (
            group.members.map((member) => (
              <View key={member.id} style={styles.memberRow}>
                <ConversationAvatar
                  avatarUrl={member.avatarUrl}
                  name={member.displayName}
                  size={46}
                  userId={member.id}
                />
                <View style={styles.memberText}>
                  <Text numberOfLines={1} style={styles.memberName}>
                    {member.displayName}
                    {member.id === user?.id ? ' (you)' : ''}
                  </Text>
                  {member.role === 'ADMIN' ? (
                    <Text style={styles.admin}>Admin</Text>
                  ) : null}
                </View>
                {isAdmin && member.id !== user?.id ? (
                  <Pressable
                    accessibilityLabel={`Manage ${member.displayName}`}
                    accessibilityRole="button"
                    onPress={() => showMemberActions(member)}
                  >
                    <MaterialIcons
                      name="more-vert"
                      color={c.textMuted}
                      size={25}
                    />
                  </Pressable>
                ) : null}
              </View>
            ))
          ) : mediaLoading ? (
            <ActivityIndicator
              color={c.accentPrimary}
              style={styles.mediaLoading}
            />
          ) : media.length ? (
            <View style={styles.mediaGrid}>
              {media.map((item) => (
                <Pressable
                  accessibilityLabel="View shared image"
                  key={item.id}
                  onPress={() => setViewerUrl(item.url)}
                  style={styles.mediaCell}
                >
                  <Image source={{ uri: item.url }} style={styles.mediaImage} />
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>No shared images yet.</Text>
          )}
          {soleAdmin && group.members.length > 1 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                Alert.alert(
                  'Dissolve group?',
                  'This permanently deletes the group and its messages for everyone.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Dissolve',
                      style: 'destructive',
                      onPress: () => exitGroup(() => dissolveGroup(groupId)),
                    },
                  ]
                )
              }
            >
              <Text style={styles.dissolve}>Dissolve group</Text>
            </Pressable>
          ) : null}
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
        </ScrollView>
      )}
      {busy ? (
        <View pointerEvents="none" style={styles.busy}>
          <ActivityIndicator color={c.accentPrimary} />
        </View>
      ) : null}
      <ImageViewerModal
        imageUrl={viewerUrl ?? ''}
        onClose={() => setViewerUrl(null)}
        visible={viewerUrl !== null}
      />
    </SafeAreaView>
  );
}

function Action({
  icon,
  label,
  onPress,
  styles,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.action}
    >
      <MaterialIcons name={icon} color={styles.actionText.color} size={24} />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    action: {
      alignItems: 'center',
      flex: 1,
      gap: 5,
      paddingVertical: spacing.md,
    },
    actionText: { color: c.accentPrimary, fontSize: 13, fontWeight: '600' },
    actions: {
      backgroundColor: c.bgSurface,
      borderRadius: radius.md,
      flexDirection: 'row',
      marginBottom: spacing.md,
    },
    activeTab: { borderBottomColor: c.accentPrimary, borderBottomWidth: 2 },
    activeTabText: { color: c.accentPrimary },
    addRow: {
      alignItems: 'center',
      backgroundColor: c.bgSurface,
      borderRadius: radius.md,
      flexDirection: 'row',
      gap: spacing.md,
      marginBottom: spacing.md,
      padding: spacing.md,
    },
    addText: { color: c.textPrimary, fontSize: 16, fontWeight: '600' },
    admin: { color: c.accentPrimary, fontSize: 12, fontWeight: '600' },
    busy: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    center: { alignItems: 'center', flex: 1, justifyContent: 'center' },
    content: { padding: spacing.lg, paddingBottom: 48 },
    description: { color: c.textMuted, fontSize: 15, lineHeight: 21 },
    descriptionInput: {
      borderColor: c.border,
      borderRadius: radius.sm,
      borderWidth: 1,
      color: c.textPrimary,
      minHeight: 80,
      padding: spacing.sm,
      textAlignVertical: 'top',
    },
    dissolve: {
      color: c.error,
      fontSize: 15,
      fontWeight: '600',
      marginTop: spacing.xl,
      textAlign: 'center',
    },
    editActions: {
      flexDirection: 'row',
      gap: spacing.lg,
      justifyContent: 'flex-end',
      marginTop: spacing.sm,
    },
    empty: { color: c.textMuted, padding: spacing.lg, textAlign: 'center' },
    error: { color: c.error, padding: spacing.md, textAlign: 'center' },
    groupName: {
      color: c.textPrimary,
      fontSize: 24,
      fontWeight: '700',
      marginTop: spacing.md,
    },
    hero: {
      alignItems: 'center',
      paddingBottom: spacing.xl,
      paddingTop: spacing.md,
    },
    link: { color: c.accentPrimary, fontSize: 15, fontWeight: '600' },
    mediaCell: { aspectRatio: 1, width: '32%' },
    mediaGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: '2%',
      marginTop: spacing.md,
    },
    mediaImage: { borderRadius: radius.sm, height: '100%', width: '100%' },
    mediaLoading: { marginTop: spacing.xl },
    memberName: { color: c.textPrimary, fontSize: 16, fontWeight: '600' },
    memberRow: {
      alignItems: 'center',
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: spacing.md,
      minHeight: 68,
    },
    memberText: { flex: 1, gap: 3 },
    muted: { color: c.textMuted, fontSize: 14, marginTop: 4 },
    screen: { backgroundColor: c.bgBase, flex: 1 },
    section: {
      backgroundColor: c.bgSurface,
      borderRadius: radius.md,
      marginBottom: spacing.md,
      padding: spacing.md,
    },
    sectionTitle: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    sectionTitleRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    tab: { alignItems: 'center', flex: 1, padding: spacing.md },
    tabText: { color: c.textMuted, fontSize: 15, fontWeight: '600' },
    tabs: {
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
    },
  });
