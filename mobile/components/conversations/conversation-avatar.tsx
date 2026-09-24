import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { colors, messagingAvatarColors, spacing } from '@/constants/theme';

type ConversationAvatarProps = {
  avatarUrl?: string | null;
  name: string;
  size?: number;
  userId: string;
  variant?: 'default' | 'inbox';
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts.at(-1)?.[0] ?? ''}`.toUpperCase();
}

function getAvatarColor(userId: string, palette: readonly string[]): string {
  let hash = 0;
  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) >>> 0;
  }
  return palette[hash % palette.length];
}

export function ConversationAvatar({
  avatarUrl,
  name,
  size = spacing.xl + spacing.md,
  userId,
}: ConversationAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [avatarUrl]);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.avatar,
        {
          backgroundColor: getAvatarColor(userId, messagingAvatarColors),
          borderRadius: size / 2,
          height: size,
          width: size,
        },
      ]}
    >
      {avatarUrl && !imageFailed ? (
        <Image
          onError={() => setImageFailed(true)}
          resizeMode="cover"
          source={{ uri: avatarUrl }}
          style={styles.image}
        />
      ) : (
        <Text
          style={[
            styles.initials,
            { fontSize: Math.max(16, size * 0.35) },
            { color: colors.light.textPrimary },
          ]}
        >
          {getInitials(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { height: '100%', width: '100%' },
  initials: {
    color: colors.light.onAccent,
    fontWeight: '700',
  },
});
