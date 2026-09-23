import { StyleSheet, Text, View } from 'react-native';

import { messagingColors as colors, spacing } from '@/constants/theme';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

export function UnreadBadge({ count }: { count: number }) {
  const colorScheme = useAppColorScheme();
  const c = colors[colorScheme];

  if (count <= 0) return null;

  return (
    <View
      accessibilityLabel={`${count} unread ${count === 1 ? 'message' : 'messages'}`}
      style={[styles.badge, { backgroundColor: c.unreadBadge }]}
    >
      <Text style={[styles.label, { color: c.onAccent }]}>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    borderRadius: spacing.md,
    justifyContent: 'center',
    minHeight: spacing.lg,
    minWidth: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
  },
});
