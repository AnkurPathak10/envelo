import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

import { colors } from '@/constants/theme';
import type { ConversationParticipant } from '@/lib/api/conversations';

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
  const scheme = useColorScheme() ?? 'light';
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
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    details: { flex: 1 },
    disabled: { opacity: 0.6 },
    email: { color: c.textMuted, fontSize: 14, marginTop: 4 },
    name: { color: c.textPrimary, fontSize: 16, fontWeight: '600' },
    pressed: { backgroundColor: c.bgSurface },
  });
