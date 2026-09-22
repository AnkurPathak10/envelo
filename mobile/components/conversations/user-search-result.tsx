import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ConversationAvatar } from '@/components/conversations/conversation-avatar';
import { colors } from '@/constants/theme';
import type { ConversationParticipant } from '@/lib/api/conversations';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

interface UserSearchResultProps {
  isCreating: boolean;
  isDisabled: boolean;
  onPress: () => void;
  user: ConversationParticipant;
}

export function UserSearchResult({
  isCreating,
  isDisabled,
  onPress,
  user,
}: UserSearchResultProps) {
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const styles = createStyles(c);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}
    >
      <ConversationAvatar
        avatarUrl={user.avatarUrl}
        name={user.displayName}
        size={44}
        userId={user.id}
      />
      <View style={styles.details}>
        <Text style={styles.name}>{user.displayName}</Text>
        <Text style={styles.email}>{user.email}</Text>
      </View>
      {isCreating ? <ActivityIndicator color={c.accentPrimary} /> : null}
    </Pressable>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    details: { flex: 1 },
    disabled: { opacity: 0.6 },
    email: { color: c.textMuted, fontSize: 14, marginTop: 4 },
    name: { color: c.textPrimary, fontSize: 16, fontWeight: '600' },
    pressed: { backgroundColor: c.bgSurface },
  });
