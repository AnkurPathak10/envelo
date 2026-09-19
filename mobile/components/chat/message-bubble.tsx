import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';

import { colors, radius } from '@/constants/theme';
import type { RenderableTextMessage } from '@/lib/chat/messages';

interface MessageBubbleProps {
  message: RenderableTextMessage;
  isOutgoing: boolean;
}

function formatMessageTime(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function outgoingStatusPresentation(status: RenderableTextMessage['status']): {
  accessibilityLabel: string;
  icon: 'schedule' | 'check' | 'done-all';
} {
  if (status === 'PENDING') {
    return { accessibilityLabel: 'Pending', icon: 'schedule' };
  }
  if (status === 'READ') {
    return { accessibilityLabel: 'Read', icon: 'done-all' };
  }
  if (status === 'DELIVERED') {
    return { accessibilityLabel: 'Delivered', icon: 'check' };
  }
  return { accessibilityLabel: 'Sent', icon: 'check' };
}

export function MessageBubble({ message, isOutgoing }: MessageBubbleProps) {
  const scheme = useColorScheme() ?? 'light';
  const c = colors[scheme];
  const styles = createStyles(c);
  const status = outgoingStatusPresentation(message.status);

  return (
    <View
      style={[styles.row, isOutgoing ? styles.outgoingRow : styles.incomingRow]}
    >
      <View
        style={[
          styles.bubble,
          isOutgoing ? styles.outgoingBubble : styles.incomingBubble,
        ]}
      >
        <Text
          style={[
            styles.content,
            isOutgoing ? styles.outgoingText : styles.incomingText,
          ]}
        >
          {message.content}
        </Text>
        <View style={styles.metadataRow}>
          <Text
            style={[
              styles.timestamp,
              isOutgoing ? styles.outgoingTimestamp : styles.incomingTimestamp,
            ]}
          >
            {formatMessageTime(message.createdAt)}
          </Text>
          {isOutgoing ? (
            <MaterialIcons
              accessibilityLabel={status.accessibilityLabel}
              color={c.textPrimary}
              name={status.icon}
              size={14}
              style={styles.statusIcon}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    bubble: {
      borderRadius: radius.md,
      maxWidth: '82%',
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    content: { fontSize: 16, lineHeight: 22 },
    incomingBubble: {
      backgroundColor: c.bgSurface,
      borderColor: c.border,
      borderWidth: StyleSheet.hairlineWidth,
    },
    incomingRow: { justifyContent: 'flex-start' },
    incomingText: { color: c.textPrimary },
    incomingTimestamp: { color: c.textMuted },
    metadataRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: 5,
    },
    outgoingBubble: { backgroundColor: c.accentPrimary },
    outgoingRow: { justifyContent: 'flex-end' },
    outgoingText: { color: c.textPrimary },
    outgoingTimestamp: { color: c.textPrimary, opacity: 0.72 },
    row: { flexDirection: 'row', marginVertical: 4 },
    statusIcon: { marginLeft: 4, opacity: 0.72 },
    timestamp: { fontSize: 11, textAlign: 'right' },
  });
