import { Pressable, StyleSheet, Text, useColorScheme } from 'react-native';

import { colors } from '@/constants/theme';
import type { ConversationListItem } from '@/lib/api/conversations';

interface ConversationRowProps {
  conversation: ConversationListItem;
  onPress: () => void;
}

export function ConversationRow({
  conversation,
  onPress,
}: ConversationRowProps) {
  const scheme = useColorScheme() ?? 'light';
  const c = colors[scheme];
  const styles = createStyles(c);

  return (
    <Pressable
      accessibilityLabel={`Open conversation with ${conversation.participant.displayName}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.containerPressed,
      ]}
    >
      <Text style={styles.name}>{conversation.participant.displayName}</Text>
      <Text style={styles.email}>{conversation.participant.email}</Text>
    </Pressable>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    container: {
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 20,
      paddingVertical: 18,
    },
    containerPressed: { backgroundColor: c.bgSurface },
    email: { color: c.textMuted, fontSize: 14, marginTop: 4 },
    name: { color: c.textPrimary, fontSize: 17, fontWeight: '600' },
  });
