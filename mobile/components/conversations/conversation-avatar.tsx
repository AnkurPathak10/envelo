import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/constants/theme';

const avatarColors = [
  '#2563EB',
  '#7C3AED',
  '#DB2777',
  '#DC2626',
  '#D97706',
  '#059669',
  '#0891B2',
] as const;

type ConversationAvatarProps = {
  name: string;
  userId: string;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts.at(-1)?.[0] ?? ''}`.toUpperCase();
}

function getAvatarColor(userId: string): string {
  let hash = 0;
  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) >>> 0;
  }
  return avatarColors[hash % avatarColors.length];
}

export function ConversationAvatar({ name, userId }: ConversationAvatarProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.avatar, { backgroundColor: getAvatarColor(userId) }]}
    >
      <Text style={styles.initials}>{getInitials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    borderRadius: spacing.lg,
    height: spacing.xl + spacing.md,
    justifyContent: 'center',
    width: spacing.xl + spacing.md,
  },
  initials: {
    color: colors.light.onAccent,
    fontSize: 17,
    fontWeight: '700',
  },
});
