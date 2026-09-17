import { StyleSheet, Text, useColorScheme, View } from 'react-native';

import { colors } from '@/constants/theme';
import type { ConversationListItem } from '@/lib/api/conversations';

interface ConversationRowProps {
  conversation: ConversationListItem;
}

export function ConversationRow({ conversation }: ConversationRowProps) {
  const scheme = useColorScheme() ?? 'light';
  const c = colors[scheme];
  const styles = createStyles(c);

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{conversation.participant.displayName}</Text>
      <Text style={styles.email}>{conversation.participant.email}</Text>
    </View>
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
    email: { color: c.textMuted, fontSize: 14, marginTop: 4 },
    name: { color: c.textPrimary, fontSize: 17, fontWeight: '600' },
  });
