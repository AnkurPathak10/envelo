import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Animated,
  PanResponder,
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
  onReply?: (message: RenderableTextMessage) => void;
}

function formatMessageTime(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function replyPreviewText(message: RenderableTextMessage['replyTo']): string {
  if (!message) return '';
  return message.content ?? (message.mediaUrl ? 'Photo' : 'Message');
}

export function MessageBubble({
  message,
  isOutgoing,
  onReply,
}: MessageBubbleProps) {
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
  const messageTime = formatMessageTime(message.createdAt);
  const isGif = isGiphyMediaUrl(message.mediaUrl);
  const canReply = Boolean(onReply) && message.status !== 'PENDING';
  const swipeX = useRef(new Animated.Value(0)).current;
  const replyIconOpacity = swipeX.interpolate({
    inputRange: [-52, -18, -6, 0],
    outputRange: [1, 0.6, 0, 0],
    extrapolate: 'clamp',
  });
  const replyIconTranslateX = swipeX.interpolate({
    inputRange: [-52, 0],
    outputRange: [0, 52],
    extrapolate: 'clamp',
  });
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          canReply &&
          gesture.dx < -6 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderMove: (_event, gesture) =>
          swipeX.setValue(Math.max(-52, Math.min(0, gesture.dx))),
        onPanResponderRelease: (_event, gesture) => {
          const shouldReply = gesture.dx <= -34;
          Animated.spring(swipeX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
          if (shouldReply) onReply?.(message);
        },
        onPanResponderTerminate: () => {
          Animated.spring(swipeX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
      }),
    [canReply, message, onReply, swipeX]
  );

  useEffect(
    () => setIsImageLoading(Boolean(message.mediaUrl)),
    [message.mediaUrl]
  );

  return (
    <>
      <View
        {...(canReply ? panResponder.panHandlers : {})}
        collapsable={false}
        style={[
          styles.row,
          isOutgoing ? styles.outgoingRow : styles.incomingRow,
        ]}
      >
        {canReply ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.replyGestureIcon,
              {
                opacity: replyIconOpacity,
                transform: [{ translateX: replyIconTranslateX }],
              },
            ]}
          >
            <MaterialIcons color={c.accentPrimary} name="reply" size={22} />
          </Animated.View>
        ) : null}
        <Animated.View
          style={[
            styles.bubble,
            isOutgoing ? styles.outgoingBubble : styles.incomingBubble,
            { transform: [{ translateX: swipeX }] },
          ]}
        >
          {message.replyTo ? (
            <View
              style={[
                styles.replyCard,
                isOutgoing
                  ? styles.outgoingReplyCard
                  : styles.incomingReplyCard,
              ]}
            >
              <View style={styles.replyAccent} />
              <View style={styles.replyCopy}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.replySender,
                    isOutgoing
                      ? styles.outgoingReplySender
                      : styles.incomingReplySender,
                  ]}
                >
                  {message.replyTo.senderName}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.replyText,
                    isOutgoing
                      ? styles.outgoingReplyText
                      : styles.incomingReplyText,
                  ]}
                >
                  {replyPreviewText(message.replyTo)}
                </Text>
              </View>
            </View>
          ) : null}
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
                hasInlineMetadata &&
                  (isOutgoing
                    ? styles.outgoingContentReserve
                    : styles.incomingContentReserve),
                message.mediaUrl && styles.caption,
                isOutgoing ? styles.outgoingText : styles.incomingText,
              ]}
            >
              {message.content}
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
        </Animated.View>
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
    incomingContentReserve: { paddingRight: 58 },
    incomingText: { color: c.textPrimary },
    incomingTimestamp: { color: c.textMuted },
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
    outgoingContentReserve: { paddingRight: 78 },
    outgoingRow: { justifyContent: 'flex-end' },
    outgoingText: { color: c.outgoingText },
    outgoingTimestamp: { color: c.outgoingText, opacity: 0.72 },
    row: { flexDirection: 'row', marginVertical: 4, width: '100%' },
    replyAccent: {
      alignSelf: 'stretch',
      backgroundColor: c.accentPrimary,
      borderRadius: 3,
      marginRight: 8,
      width: 3,
    },
    replyCard: {
      borderRadius: radius.sm,
      flexDirection: 'row',
      marginBottom: 8,
      overflow: 'hidden',
      padding: 7,
    },
    replyCopy: { flex: 1 },
    replyGestureIcon: {
      alignItems: 'center',
      bottom: 0,
      justifyContent: 'center',
      position: 'absolute',
      right: 0,
      top: 0,
      width: 44,
    },
    replySender: { fontSize: 12, fontWeight: '700' },
    replyText: { fontSize: 12, marginTop: 1 },
    incomingReplyCard: { backgroundColor: c.bgBase },
    incomingReplySender: { color: c.accentPrimary },
    incomingReplyText: { color: c.textMuted },
    outgoingReplyCard: { backgroundColor: 'rgba(255, 255, 255, 0.22)' },
    outgoingReplySender: { color: c.outgoingText },
    outgoingReplyText: { color: c.outgoingText, opacity: 0.78 },
    statusIcon: { marginLeft: 4 },
    timestamp: { fontSize: 11, textAlign: 'right' },
  });
