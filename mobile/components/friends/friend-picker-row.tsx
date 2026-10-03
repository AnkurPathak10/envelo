import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ConversationAvatar } from '@/components/conversations/conversation-avatar';
import { messagingColors as colors, spacing } from '@/constants/theme';
import type { ConversationParticipant } from '@/lib/api/conversations';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

// Shared by group creation and the in-call picker; selection state stays local
// to each workflow, so calling never leaks into GroupCreationContext.
export function FriendPickerRow({
  friend,
  selected = false,
  disabled = false,
  invite = false,
  onPress,
}: {
  friend: ConversationParticipant;
  selected?: boolean;
  disabled?: boolean;
  invite?: boolean;
  onPress: () => void;
}) {
  const c = colors[useAppColorScheme()];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={`${invite ? 'Invite' : selected ? 'Remove' : 'Select'} ${friend.displayName}`}
      accessibilityRole={invite ? 'button' : 'checkbox'}
      accessibilityState={{ checked: invite ? undefined : selected, disabled }}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: c.border },
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <ConversationAvatar
        avatarUrl={friend.avatarUrl}
        name={friend.displayName}
        size={44}
        userId={friend.id}
      />
      <View style={styles.person}>
        <Text numberOfLines={1} style={[styles.name, { color: c.textPrimary }]}>
          {friend.displayName}
        </Text>
        <Text numberOfLines={1} style={{ color: c.textMuted, fontSize: 13 }}>
          {friend.email}
        </Text>
      </View>
      <MaterialIcons
        color={selected || invite ? c.accentPrimary : c.textMuted}
        name={
          invite
            ? 'person-add'
            : selected
              ? 'check-circle'
              : 'radio-button-unchecked'
        }
        size={25}
      />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 70,
    paddingHorizontal: spacing.lg,
  },
  person: { flex: 1, gap: spacing.xs, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '600' },
});
