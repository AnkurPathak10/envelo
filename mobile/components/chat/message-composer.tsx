import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { messagingColors as colors, radius } from '@/constants/theme';
import type { SocketConnectionState } from '@/lib/socket/SocketContext';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

interface MessageComposerProps {
  connectionState: SocketConnectionState;
  isMediaBusy: boolean;
  isSending: boolean;
  onAttach: () => void;
  attachmentUri: string | null;
  onRemoveAttachment: () => void;
  onChangeText: (value: string) => void;
  onRetryConnection: () => void;
  onSend: () => void;
  sendError: string | null;
  value: string;
}

function getConnectionNotice(
  connectionState: SocketConnectionState
): string | null {
  if (connectionState === 'connected') return null;
  if (connectionState === 'connecting')
    return 'Connecting… Messages will be queued.';
  if (connectionState === 'reconnecting')
    return 'Reconnecting… Messages will be queued.';
  if (connectionState === 'disconnected')
    return 'Disconnected. Messages will be queued. Tap to retry.';
  return 'Messaging is offline. Messages will be queued.';
}

export function MessageComposer({
  connectionState,
  isMediaBusy,
  isSending,
  onAttach,
  attachmentUri,
  onRemoveAttachment,
  onChangeText,
  onRetryConnection,
  onSend,
  sendError,
  value,
}: MessageComposerProps) {
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const styles = createStyles(c);
  const isSendDisabled =
    isSending || isMediaBusy || (!value.trim() && !attachmentUri);
  const connectionNotice = getConnectionNotice(connectionState);

  return (
    <View style={styles.container}>
      {connectionState === 'disconnected' && connectionNotice ? (
        <Pressable
          accessibilityLabel="Retry messaging connection"
          accessibilityRole="button"
          onPress={onRetryConnection}
          style={({ pressed }) => [
            styles.retryConnection,
            pressed && styles.retryConnectionPressed,
          ]}
        >
          <Text style={styles.connectionNotice}>{connectionNotice}</Text>
        </Pressable>
      ) : connectionNotice ? (
        <Text style={styles.connectionNotice}>{connectionNotice}</Text>
      ) : null}
      {sendError ? <Text style={styles.errorText}>{sendError}</Text> : null}
      {attachmentUri ? (
        <View style={styles.attachmentPreview}>
          <Image
            source={{ uri: attachmentUri }}
            style={styles.attachmentImage}
          />
          <Pressable
            accessibilityLabel="Remove attached photo"
            accessibilityRole="button"
            disabled={isSending}
            onPress={onRemoveAttachment}
            style={styles.removeAttachment}
          >
            <MaterialIcons color={c.textPrimary} name="close" size={20} />
          </Pressable>
        </View>
      ) : null}
      <View style={styles.composerRow}>
        <Pressable
          accessibilityLabel="Attach photo"
          accessibilityRole="button"
          disabled={isMediaBusy}
          onPress={onAttach}
          style={({ pressed }) => [
            styles.attachButton,
            isMediaBusy && styles.buttonDisabled,
            pressed && !isMediaBusy && styles.attachButtonPressed,
          ]}
        >
          <MaterialIcons
            color={c.accentPrimary}
            name={isMediaBusy ? 'hourglass-top' : 'add-photo-alternate'}
            size={24}
          />
        </Pressable>
        <TextInput
          accessibilityLabel="Message"
          maxLength={2000}
          multiline
          onChangeText={onChangeText}
          placeholder="Message"
          placeholderTextColor={c.textMuted}
          style={styles.input}
          value={value}
        />
        <Pressable
          accessibilityRole="button"
          disabled={isSendDisabled}
          onPress={onSend}
          style={({ pressed }) => [
            styles.sendButton,
            isSendDisabled && styles.sendButtonDisabled,
            pressed && !isSendDisabled && styles.sendButtonPressed,
          ]}
        >
          <Text style={styles.sendButtonText}>
            {isSending ? 'Sending…' : 'Send'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    attachmentPreview: {
      alignSelf: 'flex-start',
      marginBottom: 10,
      position: 'relative',
    },
    attachmentImage: {
      borderRadius: radius.sm,
      height: 72,
      width: 72,
    },
    removeAttachment: {
      alignItems: 'center',
      backgroundColor: c.bgSurface,
      borderRadius: 14,
      height: 28,
      justifyContent: 'center',
      position: 'absolute',
      right: -8,
      top: -8,
      width: 28,
    },
    attachButton: {
      alignItems: 'center',
      borderRadius: radius.sm,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    attachButtonPressed: { backgroundColor: c.bgSurface },
    buttonDisabled: { opacity: 0.45 },
    composerRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 10 },
    connectionNotice: {
      color: c.textMuted,
      fontSize: 13,
      marginBottom: 8,
      textAlign: 'center',
    },
    container: {
      backgroundColor: c.bgBase,
      borderTopColor: c.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 12,
      paddingTop: 10,
    },
    errorText: {
      color: c.error,
      fontSize: 13,
      marginBottom: 8,
      textAlign: 'center',
    },
    input: {
      backgroundColor: c.bgSurface,
      borderColor: c.border,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      color: c.textPrimary,
      flex: 1,
      fontSize: 16,
      lineHeight: 21,
      maxHeight: 120,
      minHeight: 44,
      paddingHorizontal: 14,
      paddingVertical: 10,
      textAlignVertical: 'top',
    },
    retryConnection: { alignSelf: 'center' },
    retryConnectionPressed: { opacity: 0.65 },
    sendButton: {
      alignItems: 'center',
      backgroundColor: c.accentPrimary,
      borderRadius: radius.sm,
      justifyContent: 'center',
      minHeight: 44,
      minWidth: 72,
      paddingHorizontal: 14,
    },
    sendButtonDisabled: { opacity: 0.45 },
    sendButtonPressed: { opacity: 0.8 },
    sendButtonText: { color: c.textPrimary, fontSize: 15, fontWeight: '600' },
  });
