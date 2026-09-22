import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { MessageStatusIcon } from '@/components/chat/message-status-icon';
import { ImageViewerModal } from '@/components/media/image-viewer-modal';
import { colors, radius } from '@/constants/theme';
import type { RenderableTextMessage } from '@/lib/chat/messages';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

interface MessageBubbleProps {
  message: RenderableTextMessage;
  isOutgoing: boolean;
}

function formatMessageTime(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function MessageBubble({ message, isOutgoing }: MessageBubbleProps) {
  const [isImageLoading, setIsImageLoading] = useState(
    Boolean(message.mediaUrl)
  );
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const styles = createStyles(c);

  useEffect(
    () => setIsImageLoading(Boolean(message.mediaUrl)),
    [message.mediaUrl]
  );

  return (
    <>
      <View
        style={[
          styles.row,
          isOutgoing ? styles.outgoingRow : styles.incomingRow,
        ]}
      >
        <View
          style={[
            styles.bubble,
            isOutgoing ? styles.outgoingBubble : styles.incomingBubble,
          ]}
        >
          {message.mediaUrl ? (
            <Pressable
              accessibilityLabel="View image"
              accessibilityRole="button"
              onPress={() => setIsViewerOpen(true)}
              style={styles.imageContainer}
            >
              {isImageLoading ? (
                <View style={styles.imageLoading}>
                  <ActivityIndicator color={c.textMuted} />
                </View>
              ) : null}
              <Image
                onLoadEnd={() => setIsImageLoading(false)}
                resizeMode="cover"
                source={{ uri: message.mediaUrl }}
                style={styles.messageImage}
              />
            </Pressable>
          ) : null}
          {message.content ? (
            <Text
              style={[
                styles.content,
                message.mediaUrl && styles.caption,
                isOutgoing ? styles.outgoingText : styles.incomingText,
              ]}
            >
              {message.content}
            </Text>
          ) : null}
          <View style={styles.metadataRow}>
            <Text
              style={[
                styles.timestamp,
                isOutgoing
                  ? styles.outgoingTimestamp
                  : styles.incomingTimestamp,
              ]}
            >
              {formatMessageTime(message.createdAt)}
            </Text>
            {isOutgoing ? (
              <MessageStatusIcon
                color={c.textPrimary}
                status={message.status}
                size={14}
                style={styles.statusIcon}
              />
            ) : null}
          </View>
        </View>
      </View>
      {message.mediaUrl ? (
        <ImageViewerModal
          imageUrl={message.mediaUrl}
          onClose={() => setIsViewerOpen(false)}
          visible={isViewerOpen}
        />
      ) : null}
    </>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    bubble: {
      borderRadius: radius.md,
      maxWidth: '82%',
      overflow: 'hidden',
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    caption: { marginTop: 8 },
    content: { fontSize: 16, lineHeight: 22 },
    imageContainer: {
      backgroundColor: c.bgSurface,
      borderRadius: radius.sm,
      height: 220,
      overflow: 'hidden',
      width: 240,
    },
    imageLoading: {
      alignItems: 'center',
      bottom: 0,
      justifyContent: 'center',
      left: 0,
      position: 'absolute',
      right: 0,
      top: 0,
    },
    incomingBubble: {
      backgroundColor: c.bgSurface,
      borderColor: c.border,
      borderWidth: StyleSheet.hairlineWidth,
    },
    incomingRow: { justifyContent: 'flex-start' },
    incomingText: { color: c.textPrimary },
    incomingTimestamp: { color: c.textMuted },
    messageImage: { height: '100%', width: '100%' },
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
