import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ContactMessageCard } from '@/components/chat/contact-message-card';
import { LocationMessageCard } from '@/components/chat/location-message-card';
import { MessageStatusIcon } from '@/components/chat/message-status-icon';
import { ImageViewerModal } from '@/components/media/image-viewer-modal';
import { messagingColors as colors, radius } from '@/constants/theme';
import type { RenderableTextMessage } from '@/lib/chat/messages';
import {
  parseSharedContact,
  parseSharedLocation,
} from '@/lib/chat/richMessageContent';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';
import { isGiphyMediaUrl } from '@/lib/giphy';

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
  const sharedLocation = parseSharedLocation(message.content);
  const sharedContact = sharedLocation
    ? null
    : parseSharedContact(message.content);
  const hasInlineMetadata =
    Boolean(message.content) && !sharedLocation && !sharedContact;
  const metadataSpacer = isOutgoing ? '\u00A0'.repeat(15) : '\u00A0'.repeat(10);
  const messageTime = formatMessageTime(message.createdAt);
  const isGif = isGiphyMediaUrl(message.mediaUrl);

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
                autoplay
                contentFit="cover"
                onLoadEnd={() => setIsImageLoading(false)}
                source={message.mediaUrl}
                style={styles.messageImage}
              />
              {isGif ? <Text style={styles.giphyBadge}>GIPHY</Text> : null}
            </Pressable>
          ) : null}
          {sharedLocation ? (
            <LocationMessageCard {...sharedLocation} />
          ) : sharedContact ? (
            <ContactMessageCard {...sharedContact} />
          ) : message.content ? (
            <Text
              style={[
                styles.content,
                message.mediaUrl && styles.caption,
                isOutgoing ? styles.outgoingText : styles.incomingText,
              ]}
            >
              {message.content}
              <Text aria-hidden style={styles.metadataSpacer}>
                {metadataSpacer}
              </Text>
            </Text>
          ) : null}
          <View
            style={[
              styles.metadataRow,
              hasInlineMetadata && styles.anchoredMetadataRow,
            ]}
          >
            <Text
              style={[
                styles.timestamp,
                isOutgoing
                  ? styles.outgoingTimestamp
                  : styles.incomingTimestamp,
              ]}
            >
              {messageTime}
            </Text>
            {isOutgoing ? (
              <MessageStatusIcon
                color={c.outgoingStatus}
                status={message.status}
                size={15}
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
      position: 'relative',
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
    giphyBadge: {
      backgroundColor: 'rgba(0, 0, 0, 0.62)',
      borderRadius: 6,
      bottom: 7,
      color: '#FFFFFF',
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.6,
      paddingHorizontal: 6,
      paddingVertical: 3,
      position: 'absolute',
      right: 7,
    },
    incomingBubble: {
      backgroundColor: c.bgSurface,
      borderColor: c.border,
      borderWidth: StyleSheet.hairlineWidth,
    },
    incomingRow: { justifyContent: 'flex-start' },
    incomingText: { color: c.textPrimary },
    incomingTimestamp: { color: c.textMuted },
    metadataSpacer: { opacity: 0 },
    messageImage: { height: '100%', width: '100%' },
    metadataRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: 5,
    },
    anchoredMetadataRow: {
      bottom: 10,
      marginTop: 0,
      position: 'absolute',
      right: 14,
    },
    outgoingBubble: { backgroundColor: c.outgoingBubble },
    outgoingRow: { justifyContent: 'flex-end' },
    outgoingText: { color: c.outgoingText },
    outgoingTimestamp: { color: c.outgoingText, opacity: 0.72 },
    row: { flexDirection: 'row', marginVertical: 4 },
    statusIcon: { marginLeft: 4 },
    timestamp: { fontSize: 11, textAlign: 'right' },
  });
