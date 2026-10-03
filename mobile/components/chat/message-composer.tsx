import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCall } from '@/lib/calls/CallContext';
import { registerChatAudio } from '@/lib/calls/audioOwnership';
import { BlurView } from 'expo-blur';
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { messagingColors as colors } from '@/constants/theme';
import { AttachmentGalleryPanel } from '@/components/chat/attachment-gallery-panel';
import { ExpressionPicker } from '@/components/chat/expression-picker';
import type { GifResult } from '@/lib/giphy';
import type { MessageReplyPreview } from '@/lib/api/conversations';
import type { ImageSource, PreparedAudio } from '@/lib/media/upload';
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
  onSelectGif: (gif: GifResult) => Promise<void>;
  onSelectGalleryImage: (source: ImageSource) => Promise<void>;
  onVoiceRecorded: (audio: PreparedAudio) => Promise<void>;
  onUnavailableAction: (label: string) => void;
  sendError: string | null;
  value: string;
  replyTo: MessageReplyPreview | null;
  onCancelReply: () => void;
}

type AccessoryPanel = 'emoji' | 'attachments' | null;

const MIN_VOICE_DURATION_MS = 300;
const HOLD_TO_RECORD_MS = 320;
const MIN_NATIVE_RECORDING_MS = 800;
const MAX_VOICE_DURATION_SECONDS = 300;
const CANCEL_SWIPE_DISTANCE = -88;
const RECORDING_WAVEFORM_BAR_COUNT = 14;
const VOICE_RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizeMetering(metering: number | undefined): number {
  if (typeof metering !== 'number' || !Number.isFinite(metering)) return 0.12;
  return Math.max(0.12, Math.min(1, (metering + 60) / 60));
}

function formatRecordingDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function removeTemporaryRecording(uri: string): void {
  try {
    if (Platform.OS === 'web') {
      URL.revokeObjectURL(uri);
      return;
    }
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // The OS may already have reclaimed an interrupted temporary recording.
  }
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
  onCamera,
  onContact,
  onLocation,
  attachmentUri,
  onRemoveAttachment,
  onChangeText,
  onRetryConnection,
  onSend,
  onSelectGif,
  onSelectGalleryImage,
  onVoiceRecorded,
  onUnavailableAction,
  sendError,
  value,
  replyTo,
  onCancelReply,
}: MessageComposerProps) {
  const { active } = useCall();
  const inCall = Boolean(active && active.phase !== 'ended');
  const inCallRef = useRef(inCall);
  inCallRef.current = inCall;
  const [accessoryPanel, setAccessoryPanel] = useState<AccessoryPanel>(null);
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const styles = createStyles(c);
  const hasSendableContent = Boolean(value.trim() || attachmentUri);
  const isSendDisabled = isSending || isMediaBusy || !hasSendableContent;
  const connectionNotice = getConnectionNotice(connectionState);
  const [inputHeight, setInputHeight] = useState(44);
  const [isRecording, setIsRecording] = useState(false);
  const [isCancelArmed, setIsCancelArmed] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [recordingLevels, setRecordingLevels] = useState<number[]>(() =>
    Array(RECORDING_WAVEFORM_BAR_COUNT).fill(0.12)
  );
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 100);
  const recordingTranslateX = useRef(new Animated.Value(0)).current;
  const gestureActiveRef = useRef(false);
  const isStartingRecordingRef = useRef(false);
  const isRecordingRef = useRef(false);
  const isStoppingRecordingRef = useRef(false);
  const recordingStartedAtRef = useRef<number | null>(null);
  const pendingFinishRef = useRef<boolean | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maximumDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const isExpanded = inputHeight > 48 || Boolean(replyTo);

  const clearHoldTimer = useCallback((): void => {
    if (!holdTimerRef.current) return;
    clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  }, []);

  const resetRecordingUi = useCallback((): void => {
    isRecordingRef.current = false;
    recordingStartedAtRef.current = null;
    setIsRecording(false);
    setIsCancelArmed(false);
    setRecordingLevels(Array(RECORDING_WAVEFORM_BAR_COUNT).fill(0.12));
    Animated.spring(recordingTranslateX, {
      toValue: 0,
      useNativeDriver: true,
    }).start();
    if (maximumDurationTimerRef.current) {
      clearTimeout(maximumDurationTimerRef.current);
      maximumDurationTimerRef.current = null;
    }
  }, [recordingTranslateX]);

  const finishVoiceRecording = useCallback(
    async (cancel: boolean): Promise<void> => {
      gestureActiveRef.current = false;
      if (isStartingRecordingRef.current && !isRecordingRef.current) {
        pendingFinishRef.current = cancel;
        return;
      }
      if (!isRecordingRef.current || isStoppingRecordingRef.current) return;

      isStoppingRecordingRef.current = true;
      const startedAt = recordingStartedAtRef.current ?? Date.now();
      const statusAtRelease = recorder.getStatus();
      const wallDurationAtRelease = Math.max(0, Date.now() - startedAt);
      const durationMs = Math.min(
        MAX_VOICE_DURATION_SECONDS * 1000,
        Math.max(statusAtRelease.durationMillis, wallDurationAtRelease)
      );
      resetRecordingUi();
      try {
        const safeStopDelay = Math.max(
          0,
          MIN_NATIVE_RECORDING_MS - wallDurationAtRelease
        );
        if (safeStopDelay > 0) await wait(safeStopDelay);
        if (recorder.getStatus().isRecording) await recorder.stop();
        const uri = recorder.uri ?? recorder.getStatus().url;
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
        });

        if (!uri) throw new Error('The voice recording could not be saved.');
        if (cancel || durationMs < MIN_VOICE_DURATION_MS) {
          removeTemporaryRecording(uri);
          if (!cancel) {
            setVoiceNotice('Press and hold to record audio.');
          }
          return;
        }

        const isWeb = Platform.OS === 'web';
        try {
          await onVoiceRecorded({
            uri,
            durationMs: Math.round(durationMs),
            fileName: `voice-${Date.now()}.${isWeb ? 'webm' : 'm4a'}`,
            mimeType: isWeb ? 'audio/webm' : 'audio/mp4',
          });
        } finally {
          removeTemporaryRecording(uri);
        }
      } catch {
        resetRecordingUi();
        setVoiceNotice('Recording was not saved. Press and hold to try again.');
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
        }).catch(() => undefined);
      } finally {
        isStoppingRecordingRef.current = false;
        pendingFinishRef.current = null;
      }
    },
    [onVoiceRecorded, recorder, resetRecordingUi]
  );

  const startVoiceRecording = useCallback(async (): Promise<void> => {
    if (inCallRef.current) {
      setVoiceNotice('Finish your call before recording a voice message.');
      return;
    }
    if (
      isMediaBusy ||
      isSending ||
      isStartingRecordingRef.current ||
      isRecordingRef.current ||
      isStoppingRecordingRef.current
    ) {
      return;
    }

    isStartingRecordingRef.current = true;
    setVoiceError(null);
    setVoiceNotice(null);
    setAccessoryPanel(null);
    Keyboard.dismiss();
    try {
      const existingPermission = await getRecordingPermissionsAsync();
      const permission = existingPermission.granted
        ? existingPermission
        : await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        throw new Error(
          permission.canAskAgain
            ? 'Microphone permission is required to record a voice message.'
            : 'Microphone access is blocked. Enable it in your device settings.'
        );
      }
      if (!existingPermission.granted) {
        gestureActiveRef.current = false;
        setVoiceNotice('Microphone is ready. Press and hold to record audio.');
        return;
      }
      if (!gestureActiveRef.current || inCallRef.current) return;

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      const existingRecorderStatus = recorder.getStatus();
      if (existingRecorderStatus.isRecording) {
        throw new Error('A recording is already in progress.');
      }
      if (!existingRecorderStatus.canRecord) {
        await recorder.prepareToRecordAsync();
      }
      if (!gestureActiveRef.current || inCallRef.current) {
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
        });
        return;
      }

      recorder.record({ forDuration: MAX_VOICE_DURATION_SECONDS });
      recordingStartedAtRef.current = Date.now();
      isRecordingRef.current = true;
      setIsRecording(true);
      maximumDurationTimerRef.current = setTimeout(() => {
        void finishVoiceRecording(false);
      }, MAX_VOICE_DURATION_SECONDS * 1000);
    } catch (error: unknown) {
      resetRecordingUi();
      const message = error instanceof Error ? error.message : '';
      if (/permission|blocked|settings/i.test(message)) {
        setVoiceError(message);
      } else {
        setVoiceNotice(
          'Recording could not start. Press and hold to try again.'
        );
      }
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      }).catch(() => undefined);
    } finally {
      isStartingRecordingRef.current = false;
      if (pendingFinishRef.current !== null && isRecordingRef.current) {
        const shouldCancel = pendingFinishRef.current;
        pendingFinishRef.current = null;
        void finishVoiceRecording(shouldCancel);
      }
    }
  }, [
    finishVoiceRecording,
    isMediaBusy,
    isSending,
    recorder,
    resetRecordingUi,
  ]);

  useEffect(
    () =>
      registerChatAudio(async () => {
        clearHoldTimer();
        gestureActiveRef.current = false;
        pendingFinishRef.current = true;
        // Permission/preparation and an existing stop can still be in flight.
        // Wait for them before handing the native audio session to RealtimeKit.
        while (isStartingRecordingRef.current || isStoppingRecordingRef.current)
          await wait(25);
        if (isRecordingRef.current) await finishVoiceRecording(true);
      }),
    [clearHoldTimer, finishVoiceRecording]
  );

  const voicePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !isMediaBusy && !isSending,
        onMoveShouldSetPanResponder: () => !isMediaBusy && !isSending,
        onPanResponderGrant: () => {
          gestureActiveRef.current = true;
          pendingFinishRef.current = null;
          recordingTranslateX.setValue(0);
          setVoiceError(null);
          setVoiceNotice(null);
          clearHoldTimer();
          holdTimerRef.current = setTimeout(() => {
            holdTimerRef.current = null;
            if (gestureActiveRef.current) void startVoiceRecording();
          }, HOLD_TO_RECORD_MS);
        },
        onPanResponderMove: (_event, gesture) => {
          if (!isRecordingRef.current) return;
          const nextX = Math.max(-120, Math.min(0, gesture.dx));
          recordingTranslateX.setValue(nextX);
          setIsCancelArmed(nextX <= CANCEL_SWIPE_DISTANCE);
        },
        onPanResponderRelease: (_event, gesture) => {
          gestureActiveRef.current = false;
          if (holdTimerRef.current) {
            clearHoldTimer();
            setVoiceNotice('Press and hold to record audio.');
            return;
          }
          if (!isRecordingRef.current && isStartingRecordingRef.current) {
            pendingFinishRef.current = gesture.dx <= CANCEL_SWIPE_DISTANCE;
            setVoiceNotice('Press and hold to record audio.');
            return;
          }
          void finishVoiceRecording(gesture.dx <= CANCEL_SWIPE_DISTANCE);
        },
        onPanResponderTerminate: () => {
          gestureActiveRef.current = false;
          clearHoldTimer();
          void finishVoiceRecording(true);
        },
      }),
    [
      clearHoldTimer,
      finishVoiceRecording,
      isMediaBusy,
      isSending,
      recordingTranslateX,
      startVoiceRecording,
    ]
  );

  useEffect(() => {
    if (!isRecording) return;
    const nextLevel = normalizeMetering(recorderState.metering);
    setRecordingLevels((current) => [...current.slice(1), nextLevel]);
  }, [isRecording, recorderState.metering]);

  useEffect(
    () => () => {
      if (maximumDurationTimerRef.current) {
        clearTimeout(maximumDurationTimerRef.current);
      }
      clearHoldTimer();
      if (isRecordingRef.current) void recorder.stop().catch(() => undefined);
      void setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      }).catch(() => undefined);
    },
    [clearHoldTimer, recorder]
  );

  const togglePanel = (panel: Exclude<AccessoryPanel, null>): void => {
    setVoiceError(null);
    setVoiceNotice(null);
    setAccessoryPanel((current) => {
      if (current === panel) return null;
      Keyboard.dismiss();
      return panel;
    });
  };

  return (
    <View pointerEvents="box-none" style={styles.container}>
      <LinearGradient
        colors={
          scheme === 'dark'
            ? (['rgba(36, 35, 38, 0)', 'rgba(36, 35, 38, 0.96)'] as const)
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

      {(voiceError ?? sendError) ? (
        <View style={styles.errorPill}>
          <Text style={styles.errorText}>{voiceError ?? sendError}</Text>
        </View>
      ) : null}

      {voiceNotice ? (
        <View style={styles.noticePill}>
          <Text style={styles.connectionNotice}>{voiceNotice}</Text>
        </View>
      ) : null}

      {accessoryPanel === 'emoji' ? (
        <View style={styles.accessoryPanel}>
          <ExpressionPicker
            onInsertEmoji={(emoji) => onChangeText(`${value}${emoji}`)}
            onSelectGif={async (gif) => {
              await onSelectGif(gif);
              setAccessoryPanel(null);
            }}
          />
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
        style={[
          styles.composerGlass,
          isExpanded && styles.composerGlassExpanded,
        ]}
        tint={scheme === 'dark' ? 'dark' : 'light'}
      >
        <View style={styles.composerTint}>
          {replyTo ? (
            <View style={styles.replyPreview}>
              <View style={styles.replyAccent} />
              <View style={styles.replyCopy}>
                <Text numberOfLines={1} style={styles.replyName}>
                  Reply to {replyTo.senderName}
                </Text>
                <Text numberOfLines={1} style={styles.replyText}>
                  {replyTo.content ??
                    (replyTo.audioDurationMs
                      ? 'Voice message'
                      : replyTo.mediaUrl
                        ? 'Photo'
                        : 'Message')}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Cancel reply"
                accessibilityRole="button"
                hitSlop={8}
                onPress={onCancelReply}
                style={styles.cancelReply}
              >
                <MaterialIcons color={c.textMuted} name="close" size={20} />
              </Pressable>
            </View>
          ) : null}
          <View style={styles.inputRow}>
            {isRecording ? (
              <View style={styles.recordingStatus}>
                <MaterialIcons
                  color={isCancelArmed ? c.error : c.textMuted}
                  name="delete-outline"
                  size={24}
                />
                <View style={styles.recordingDot} />
                <Text style={styles.recordingTime}>
                  {formatRecordingDuration(recorderState.durationMillis)}
                </Text>
                <View
                  accessibilityLabel="Live recording level"
                  accessibilityRole="progressbar"
                  style={styles.recordingWaveform}
                >
                  {recordingLevels.map((level, index) => (
                    <View
                      key={index}
                      style={[
                        styles.recordingWaveformBar,
                        { height: 4 + Math.round(level * 18) },
                      ]}
                    />
                  ))}
                </View>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.slideToCancel,
                    isCancelArmed && styles.slideToCancelArmed,
                  ]}
                >
                  {isCancelArmed ? 'Release to delete' : '‹ Slide to cancel'}
                </Text>
              </View>
            ) : (
              <>
                <Pressable
                  accessibilityLabel="Open emoji and GIF picker"
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
                  onContentSizeChange={(event) =>
                    setInputHeight(
                      Math.max(
                        44,
                        Math.min(112, event.nativeEvent.contentSize.height)
                      )
                    )
                  }
                  onChangeText={(nextValue) => {
                    setVoiceError(null);
                    setVoiceNotice(null);
                    onChangeText(nextValue);
                    if (!nextValue) setInputHeight(44);
                  }}
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
                    accessoryPanel === 'attachments' &&
                      styles.iconButtonSelected,
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
              </>
            )}

            {hasSendableContent ? (
              <Pressable
                accessibilityLabel="Send message"
                accessibilityRole="button"
                disabled={isSendDisabled}
                onPress={() => {
                  setAccessoryPanel(null);
                  onSend();
                }}
                style={({ pressed }) => [
                  styles.primaryAction,
                  isSendDisabled && styles.buttonDisabled,
                  pressed && styles.primaryActionPressed,
                ]}
              >
                <MaterialIcons color={c.onStateAction} name="send" size={23} />
              </Pressable>
            ) : (
              <Animated.View
                accessibilityHint="Hold to record, release to send, or slide left to delete"
                accessibilityLabel="Record voice message"
                accessibilityRole="button"
                {...voicePanResponder.panHandlers}
                style={[
                  styles.primaryAction,
                  isMediaBusy && styles.buttonDisabled,
                  { transform: [{ translateX: recordingTranslateX }] },
                ]}
              >
                <MaterialIcons
                  color={scheme === 'light' ? '#FFFFFF' : '#11181C'}
                  name="mic"
                  size={23}
                />
              </Animated.View>
            )}
          </View>
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
    composerGlassExpanded: { borderRadius: 24 },
    composerTint: {
      backgroundColor: `${c.bgSurface}B8`,
      minHeight: 52,
      padding: 4,
    },
    inputRow: { alignItems: 'flex-end', flexDirection: 'row' },
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
    primaryAction: {
      alignItems: 'center',
      backgroundColor: c.accentPrimary,
      borderRadius: 22,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    primaryActionPressed: { opacity: 0.76 },
    recordingDot: {
      backgroundColor: c.error,
      borderRadius: 5,
      height: 9,
      marginLeft: 8,
      width: 9,
    },
    recordingStatus: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      height: 44,
      minWidth: 0,
      paddingHorizontal: 8,
    },
    recordingTime: {
      color: c.textPrimary,
      fontSize: 15,
      fontVariant: ['tabular-nums'],
      marginLeft: 7,
    },
    recordingWaveform: {
      alignItems: 'center',
      flexDirection: 'row',
      height: 24,
      marginLeft: 10,
      width: 58,
    },
    recordingWaveformBar: {
      backgroundColor: c.accentPrimary,
      borderRadius: 2,
      flex: 1,
      marginHorizontal: 1,
      maxWidth: 3,
      minHeight: 4,
    },
    slideToCancel: {
      color: c.textMuted,
      flex: 1,
      fontSize: 13,
      marginLeft: 8,
      textAlign: 'center',
    },
    slideToCancelArmed: { color: c.error, fontWeight: '700' },
    cancelReply: {
      alignItems: 'center',
      height: 32,
      justifyContent: 'center',
      width: 32,
    },
    replyAccent: {
      alignSelf: 'stretch',
      backgroundColor: c.accentPrimary,
      borderRadius: 2,
      marginRight: 8,
      width: 3,
    },
    replyCopy: { flex: 1, justifyContent: 'center' },
    replyName: { color: c.accentPrimary, fontSize: 13, fontWeight: '600' },
    replyPreview: {
      alignItems: 'center',
      flexDirection: 'row',
      minHeight: 44,
      paddingHorizontal: 8,
      paddingTop: 4,
    },
    replyText: { color: c.textMuted, fontSize: 13, marginTop: 1 },
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
