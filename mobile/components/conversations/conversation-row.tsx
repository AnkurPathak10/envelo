import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MessageStatusIcon } from '@/components/chat/message-status-icon';
import { ConversationAvatar } from '@/components/conversations/conversation-avatar';
import { UnreadBadge } from '@/components/conversations/unread-badge';
import { colors, spacing } from '@/constants/theme';
import type { ConversationListItem } from '@/lib/api/conversations';
import { formatInboxTimestamp } from '@/lib/format/timestamp';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

interface ConversationRowProps {
  conversation: ConversationListItem;
  currentUserId: string;
  onPress: () => void;
}

export function ConversationRow({
  conversation,
  currentUserId,
  onPress,
}: ConversationRowProps) {
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const styles = createStyles(c);
  const lastMessage = conversation.lastMessage;
  const isOutgoing = lastMessage?.senderId === currentUserId;

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
      <ConversationAvatar
        avatarUrl={conversation.participant.avatarUrl}
        name={conversation.participant.displayName}
        userId={conversation.participant.id}
      />
      <View style={styles.content}>
        <Text numberOfLines={1} style={styles.name}>
          {conversation.participant.displayName}
        </Text>
        <View style={styles.previewRow}>
          {isOutgoing && lastMessage ? (
            <View style={styles.statusIcon}>
              <MessageStatusIcon
                color={c.textMuted}
                size={15}
                status={lastMessage.status}
              />
            </View>
          ) : null}
          <Text numberOfLines={1} style={styles.preview}>
            {lastMessage
              ? (lastMessage.content ??
                (lastMessage.mediaUrl ? '📷 Photo' : 'Message'))
              : 'No messages yet'}
          </Text>
        </View>
      </View>
      <View style={styles.trailing}>
        <Text style={styles.timestamp}>
          {lastMessage ? formatInboxTimestamp(lastMessage.createdAt) : ''}
        </Text>
        <UnreadBadge count={conversation.unreadCount} />
      </View>
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
      gap: spacing.md,
      minHeight: spacing.xl * 2 + spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    containerPressed: { backgroundColor: c.bgSurface },
    content: { flex: 1, gap: spacing.xs, minWidth: 0 },
    name: { color: c.textPrimary, fontSize: 16, fontWeight: '700' },
    preview: { color: c.textMuted, flex: 1, fontSize: 14 },
    previewRow: { alignItems: 'center', flexDirection: 'row', minWidth: 0 },
    statusIcon: { marginRight: spacing.xs },
    timestamp: { color: c.textMuted, fontSize: 12 },
    trailing: {
      alignSelf: 'stretch',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      paddingVertical: spacing.xs,
    },
  });
