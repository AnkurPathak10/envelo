import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { messagingColors as colors } from '@/constants/theme';
import { AttachmentGalleryPanel } from '@/components/chat/attachment-gallery-panel';
import type { ImageSource } from '@/lib/media/upload';
import type { SocketConnectionState } from '@/lib/socket/SocketContext';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

interface MessageComposerProps {
  connectionState: SocketConnectionState;
  isMediaBusy: boolean;
  isSending: boolean;
  onAttach: () => Promise<void>;
  onCamera: () => Promise<void>;
  onContact: () => Promise<void>;
  onLocation: () => Promise<void>;
  attachmentUri: string | null;
  onRemoveAttachment: () => void;
  onChangeText: (value: string) => void;
  onRetryConnection: () => void;
  onSend: () => void;
  onSelectGalleryImage: (source: ImageSource) => Promise<void>;
  onUnavailableAction: (label: string) => void;
  sendError: string | null;
  value: string;
}

type AccessoryPanel = 'emoji' | 'attachments' | null;
type ExpressionTab = 'emoji' | 'gif' | 'stickers';

const emojis = [
  '😀',
  '😂',
  '🥰',
  '😍',
  '😊',
  '😭',
  '😅',
  '🤔',
  '😎',
  '🥳',
  '😴',
  '😡',
  '👍',
  '👏',
  '🙏',
  '❤️',
  '🔥',
  '✨',
  '🎉',
  '💯',
  '👀',
  '🤝',
  '💬',
  '📸',
] as const;

const expressionTabs: { label: string; value: ExpressionTab }[] = [
  { label: 'Emoji', value: 'emoji' },
  { label: 'GIFs', value: 'gif' },
  { label: 'Stickers', value: 'stickers' },
];

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
  onCamera,
  onContact,
  onLocation,
  attachmentUri,
  onRemoveAttachment,
  onChangeText,
  onRetryConnection,
  onSend,
  onSelectGalleryImage,
  onUnavailableAction,
  sendError,
  value,
}: MessageComposerProps) {
  const [accessoryPanel, setAccessoryPanel] = useState<AccessoryPanel>(null);
  const [expressionTab, setExpressionTab] = useState<ExpressionTab>('emoji');
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const styles = createStyles(c);
  const hasSendableContent = Boolean(value.trim() || attachmentUri);
  const isSendDisabled = isSending || isMediaBusy || !hasSendableContent;
  const connectionNotice = getConnectionNotice(connectionState);

  const togglePanel = (panel: Exclude<AccessoryPanel, null>): void => {
    setAccessoryPanel((current) => {
      if (current === panel) return null;
      Keyboard.dismiss();
      return panel;
    });
  };

  const selectUnavailableAction = (label: string): void => {
    setAccessoryPanel(null);
    onUnavailableAction(label);
  };

  return (
    <View pointerEvents="box-none" style={styles.container}>
      <LinearGradient
        colors={
          scheme === 'dark'
            ? (['rgba(11, 15, 20, 0)', 'rgba(11, 15, 20, 0.96)'] as const)
            : (['rgba(254, 255, 254, 0)', 'rgba(254, 255, 254, 0.98)'] as const)
        }
        pointerEvents="none"
        style={styles.bottomFade}
      />
      {connectionState === 'disconnected' && connectionNotice ? (
        <Pressable
          accessibilityLabel="Retry messaging connection"
          accessibilityRole="button"
          onPress={onRetryConnection}
          style={({ pressed }) => [
            styles.noticePill,
            pressed && styles.noticePressed,
          ]}
        >
          <Text style={styles.connectionNotice}>{connectionNotice}</Text>
        </Pressable>
      ) : connectionNotice ? (
        <View style={styles.noticePill}>
          <Text style={styles.connectionNotice}>{connectionNotice}</Text>
        </View>
      ) : null}

      {sendError ? (
        <View style={styles.errorPill}>
          <Text style={styles.errorText}>{sendError}</Text>
        </View>
      ) : null}

      {accessoryPanel === 'emoji' ? (
        <View style={styles.accessoryPanel}>
          <View style={styles.expressionTabs}>
            {expressionTabs.map((tab) => (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: expressionTab === tab.value }}
                key={tab.value}
                onPress={() => setExpressionTab(tab.value)}
                style={[
                  styles.expressionTab,
                  expressionTab === tab.value && styles.expressionTabSelected,
                ]}
              >
                <Text
                  style={[
                    styles.expressionTabText,
                    expressionTab === tab.value &&
                      styles.expressionTabTextSelected,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {expressionTab === 'emoji' ? (
            <ScrollView
              contentContainerStyle={styles.emojiGrid}
              keyboardShouldPersistTaps="handled"
            >
              {emojis.map((emoji) => (
                <Pressable
                  accessibilityLabel={`Insert ${emoji}`}
                  accessibilityRole="button"
                  key={emoji}
                  onPress={() => onChangeText(`${value}${emoji}`)}
                  style={({ pressed }) => [
                    styles.emojiButton,
                    pressed && styles.emojiButtonPressed,
                  ]}
                >
                  <Text style={styles.emoji}>{emoji}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.pendingExpression}>
              <Text style={styles.pendingExpressionText}>
                {expressionTab === 'gif' ? 'GIFs' : 'Stickers'} need a media
                provider before they can be sent safely.
              </Text>
            </View>
          )}
        </View>
      ) : null}

      {accessoryPanel === 'attachments' ? (
        <View style={styles.accessoryPanel}>
          <AttachmentGalleryPanel
            isBusy={isMediaBusy || isSending}
            onCamera={async () => {
              await onCamera();
              setAccessoryPanel(null);
            }}
            onOpenSystemPicker={async () => {
              await onAttach();
              setAccessoryPanel(null);
            }}
            onSelectImage={async (source) => {
              await onSelectGalleryImage(source);
              setAccessoryPanel(null);
            }}
            onContact={async () => {
              await onContact();
              setAccessoryPanel(null);
            }}
            onLocation={async () => {
              await onLocation();
              setAccessoryPanel(null);
            }}
            onUnavailableAction={onUnavailableAction}
          />
        </View>
      ) : null}

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
            <MaterialIcons color={c.textPrimary} name="close" size={19} />
          </Pressable>
        </View>
      ) : null}

      <BlurView
        experimentalBlurMethod={
          Platform.OS === 'android' ? 'dimezisBlurView' : undefined
        }
        intensity={Platform.OS === 'android' ? 28 : 55}
        style={styles.composerGlass}
        tint={scheme === 'dark' ? 'dark' : 'light'}
      >
        <View style={styles.composerTint}>
          <Pressable
            accessibilityLabel="Open emoji, GIF, and sticker picker"
            accessibilityRole="button"
            onPress={() => togglePanel('emoji')}
            style={({ pressed }) => [
              styles.iconButton,
              accessoryPanel === 'emoji' && styles.iconButtonSelected,
              pressed && styles.iconButtonPressed,
            ]}
          >
            <MaterialIcons
              color={c.textMuted}
              name="sentiment-satisfied-alt"
              size={25}
            />
          </Pressable>

          <TextInput
            accessibilityLabel="Message"
            maxLength={2000}
            multiline
            onChangeText={onChangeText}
            onFocus={() => setAccessoryPanel(null)}
            placeholder="Message"
            placeholderTextColor={c.textMuted}
            style={styles.input}
            value={value}
          />

          <Pressable
            accessibilityLabel="Open attachment menu"
            accessibilityRole="button"
            disabled={isMediaBusy}
            onPress={() => togglePanel('attachments')}
            style={({ pressed }) => [
              styles.iconButton,
              accessoryPanel === 'attachments' && styles.iconButtonSelected,
              isMediaBusy && styles.buttonDisabled,
              pressed && !isMediaBusy && styles.iconButtonPressed,
            ]}
          >
            <MaterialIcons
              color={c.textMuted}
              name={isMediaBusy ? 'hourglass-top' : 'attach-file'}
              size={25}
            />
          </Pressable>

          <Pressable
            accessibilityLabel={
              hasSendableContent ? 'Send message' : 'Record voice message'
            }
            accessibilityRole="button"
            disabled={hasSendableContent ? isSendDisabled : isMediaBusy}
            onPress={
              hasSendableContent
                ? () => {
                    setAccessoryPanel(null);
                    onSend();
                  }
                : () => selectUnavailableAction('Voice messages')
            }
            style={({ pressed }) => [
              styles.primaryAction,
              (hasSendableContent ? isSendDisabled : isMediaBusy) &&
                styles.buttonDisabled,
              pressed && styles.primaryActionPressed,
            ]}
          >
            <MaterialIcons
              color={c.onStateAction}
              name={hasSendableContent ? 'send' : 'mic'}
              size={23}
            />
          </Pressable>
        </View>
      </BlurView>
    </View>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    accessoryPanel: {
      backgroundColor: c.bgBase,
      borderColor: c.border,
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      elevation: 6,
      marginBottom: 8,
      overflow: 'hidden',
      shadowColor: '#000000',
      shadowOffset: { height: 3, width: 0 },
      shadowOpacity: 0.14,
      shadowRadius: 10,
    },
    attachmentImage: { borderRadius: 12, height: 72, width: 72 },
    attachmentPreview: {
      alignSelf: 'flex-start',
      backgroundColor: c.bgBase,
      borderColor: c.border,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: 8,
      padding: 5,
      position: 'relative',
    },
    buttonDisabled: { opacity: 0.42 },
    bottomFade: {
      bottom: -80,
      height: 184,
      left: -8,
      position: 'absolute',
      right: -8,
    },
    composerGlass: {
      borderColor: c.border,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      elevation: 8,
      overflow: 'hidden',
      shadowColor: '#000000',
      shadowOffset: { height: 3, width: 0 },
      shadowOpacity: 0.16,
      shadowRadius: 10,
    },
    composerTint: {
      alignItems: 'flex-end',
      backgroundColor: `${c.bgSurface}B8`,
      flexDirection: 'row',
      minHeight: 52,
      padding: 4,
    },
    connectionNotice: {
      color: c.textMuted,
      fontSize: 12,
      textAlign: 'center',
    },
    container: {
      backgroundColor: 'transparent',
      paddingHorizontal: 8,
      paddingTop: 6,
    },
    emoji: { fontSize: 27 },
    emojiButton: {
      alignItems: 'center',
      borderRadius: 12,
      height: 42,
      justifyContent: 'center',
      width: '16.6667%',
    },
    emojiButtonPressed: { backgroundColor: c.bgSurface },
    emojiGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingBottom: 8,
      paddingHorizontal: 8,
    },
    errorPill: {
      alignSelf: 'center',
      backgroundColor: c.bgBase,
      borderColor: c.error,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: 6,
      maxWidth: '92%',
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    errorText: { color: c.error, fontSize: 12, textAlign: 'center' },
    expressionTab: {
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    expressionTabSelected: { backgroundColor: c.bgSurface },
    expressionTabText: { color: c.textMuted, fontSize: 13 },
    expressionTabTextSelected: { color: c.textPrimary, fontWeight: '600' },
    expressionTabs: { flexDirection: 'row', gap: 4, padding: 8 },
    iconButton: {
      alignItems: 'center',
      borderRadius: 22,
      height: 44,
      justifyContent: 'center',
      width: 40,
    },
    iconButtonPressed: { backgroundColor: c.bgSurface },
    iconButtonSelected: { backgroundColor: c.bgBase },
    input: {
      color: c.textPrimary,
      flex: 1,
      fontSize: 16,
      lineHeight: 21,
      maxHeight: 112,
      minHeight: 44,
      paddingHorizontal: 6,
      paddingVertical: 11,
      textAlignVertical: 'top',
    },
    noticePill: {
      alignSelf: 'center',
      backgroundColor: c.bgBase,
      borderColor: c.border,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: 6,
      maxWidth: '92%',
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    noticePressed: { opacity: 0.68 },
    pendingExpression: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 112,
      padding: 18,
    },
    pendingExpressionText: {
      color: c.textMuted,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
    },
    primaryAction: {
      alignItems: 'center',
      backgroundColor: c.accentPrimary,
      borderRadius: 22,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    primaryActionPressed: { opacity: 0.76 },
    removeAttachment: {
      alignItems: 'center',
      backgroundColor: c.bgBase,
      borderColor: c.border,
      borderRadius: 13,
      borderWidth: StyleSheet.hairlineWidth,
      height: 26,
      justifyContent: 'center',
      position: 'absolute',
      right: -8,
      top: -8,
      width: 26,
    },
  });
