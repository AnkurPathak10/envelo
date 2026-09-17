import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';

import { colors, radius } from '@/constants/theme';
import type { SocketConnectionState } from '@/lib/socket/SocketContext';

interface MessageComposerProps {
  connectionState: SocketConnectionState;
  isSending: boolean;
  onChangeText: (value: string) => void;
  onSend: () => void;
  sendError: string | null;
  value: string;
}

function getConnectionNotice(
  connectionState: SocketConnectionState
): string | null {
  if (connectionState === 'connected') return null;
  if (connectionState === 'connecting') return 'Connecting to messaging…';
  return 'Messaging is disconnected. Send is unavailable.';
}

export function MessageComposer({
  connectionState,
  isSending,
  onChangeText,
  onSend,
  sendError,
  value,
}: MessageComposerProps) {
  const scheme = useColorScheme() ?? 'light';
  const c = colors[scheme];
  const styles = createStyles(c);
  const isSendDisabled =
    connectionState !== 'connected' || isSending || !value.trim();
  const connectionNotice = getConnectionNotice(connectionState);

  return (
    <View style={styles.container}>
      {connectionNotice ? (
        <Text style={styles.connectionNotice}>{connectionNotice}</Text>
      ) : null}
      {sendError ? <Text style={styles.errorText}>{sendError}</Text> : null}
      <View style={styles.composerRow}>
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
