import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ConversationAvatar } from '@/components/conversations/conversation-avatar';
import { messagingColors as colors, radius, spacing } from '@/constants/theme';
import type { SearchUser } from '@/lib/api/conversations';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

export type FriendSearchAction = 'chat' | 'request' | 'accept' | 'reject';

interface Props {
  user: SearchUser;
  busy: boolean;
  onAction: (action: FriendSearchAction, user: SearchUser) => void;
}

function cooldownLabel(endsAt?: string): string {
  const remaining = endsAt ? Date.parse(endsAt) - Date.now() : 0;
  return `Try again in ${Math.max(1, Math.ceil(remaining / 86_400_000))}d`;
}

export function FriendSearchRow({ user, busy, onAction }: Props) {
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const styles = createStyles(c);
  const isFriend = user.friendStatus === 'FRIENDS';

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole={isFriend ? 'button' : undefined}
        disabled={!isFriend || busy}
        onPress={() => onAction('chat', user)}
        style={({ pressed }) => [styles.person, pressed && styles.pressed]}
      >
        <ConversationAvatar
          avatarUrl={user.avatarUrl}
          name={user.displayName}
          size={44}
          userId={user.id}
        />
        <View style={styles.details}>
          <Text numberOfLines={1} style={styles.name}>
            {user.displayName}
          </Text>
          <Text numberOfLines={1} style={styles.email}>
            {user.email}
          </Text>
        </View>
      </Pressable>
      {busy ? (
        <ActivityIndicator color={c.accentPrimary} />
      ) : isFriend ? (
        <Pressable
          accessibilityLabel={`Chat with ${user.displayName}`}
          accessibilityRole="button"
          onPress={() => onAction('chat', user)}
          style={styles.iconButton}
        >
          <MaterialIcons
            color={c.accentPrimary}
            name="chat-bubble-outline"
            size={22}
          />
        </Pressable>
      ) : user.friendStatus === 'NONE' ? (
        <Pressable
          accessibilityLabel={`Add ${user.displayName}`}
          accessibilityRole="button"
          onPress={() => onAction('request', user)}
          style={styles.addButton}
        >
          <MaterialIcons color={c.onAccent} name="person-add" size={20} />
        </Pressable>
      ) : user.friendStatus === 'PENDING_OUTGOING' ? (
        <Text style={styles.mutedLabel}>Pending</Text>
      ) : user.friendStatus === 'COOLDOWN' ? (
        <Text style={styles.mutedLabel}>
          {cooldownLabel(user.cooldownEndsAt)}
        </Text>
      ) : (
        <View style={styles.actions}>
          <Pressable
            accessibilityLabel={`Accept ${user.displayName}`}
            accessibilityRole="button"
            onPress={() => onAction('accept', user)}
            style={styles.acceptButton}
          >
            <MaterialIcons color={c.onAccent} name="check" size={20} />
          </Pressable>
          <Pressable
            accessibilityLabel={`Reject ${user.displayName}`}
            accessibilityRole="button"
            onPress={() => onAction('reject', user)}
            style={styles.rejectButton}
          >
            <MaterialIcons color={c.textMuted} name="close" size={20} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    acceptButton: {
      alignItems: 'center',
      backgroundColor: c.accentPrimary,
      borderRadius: radius.md,
      height: 38,
      justifyContent: 'center',
      width: 38,
    },
    actions: { flexDirection: 'row', gap: spacing.xs },
    addButton: {
      alignItems: 'center',
      backgroundColor: c.accentPrimary,
      borderRadius: radius.md,
      height: 38,
      justifyContent: 'center',
      width: 38,
    },
    details: { flex: 1, gap: 2 },
    email: { color: c.textMuted, fontSize: 13 },
    iconButton: {
      alignItems: 'center',
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    mutedLabel: {
      color: c.textMuted,
      fontSize: 12,
      maxWidth: 105,
      textAlign: 'right',
    },
    name: { color: c.textPrimary, fontSize: 16, fontWeight: '600' },
    person: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      gap: spacing.md,
      minWidth: 0,
      paddingVertical: spacing.md,
    },
    pressed: { opacity: 0.7 },
    rejectButton: {
      alignItems: 'center',
      backgroundColor: c.bgSurface,
      borderColor: c.border,
      borderRadius: radius.md,
      borderWidth: 1,
      height: 38,
      justifyContent: 'center',
      width: 38,
    },
    row: {
      alignItems: 'center',
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
  });
