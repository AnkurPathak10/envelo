import {
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

import { colors, radius } from '@/constants/theme';

interface EmptyConversationListProps {
  onStartConversation: () => void;
}

export function EmptyConversationList({
  onStartConversation,
}: EmptyConversationListProps) {
  const scheme = useColorScheme() ?? 'light';
  const c = colors[scheme];
  const styles = createStyles(c);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>No conversations yet</Text>
      <Text style={styles.description}>
        Start a conversation with someone on Envelo.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onStartConversation}
        style={styles.button}
      >
        <Text style={styles.buttonText}>Start a conversation</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    button: {
      backgroundColor: c.accentPrimary,
      borderRadius: radius.sm,
      marginTop: 24,
      paddingHorizontal: 18,
      paddingVertical: 12,
    },
    buttonText: { color: c.bgBase, fontSize: 15, fontWeight: '600' },
    container: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
      padding: 32,
    },
    description: {
      color: c.textMuted,
      fontSize: 15,
      lineHeight: 22,
      marginTop: 8,
      textAlign: 'center',
    },
    title: { color: c.textPrimary, fontSize: 21, fontWeight: '700' },
  });
