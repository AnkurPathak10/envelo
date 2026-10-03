import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MessageStatusIcon } from '@/components/chat/message-status-icon';
import { ConversationAvatar } from '@/components/conversations/conversation-avatar';
import { messagingColors as colors } from '@/constants/theme';
import type { LocalMessageStatus } from '@/lib/chat/messages';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';
import { useCall } from '@/lib/calls/CallContext';
import { registerChatAudio } from '@/lib/calls/audioOwnership';

interface VoiceMessagePlayerProps {
  audioUrl: string;
  avatarUrl: string | null;
  durationMs: number;
  isOutgoing: boolean;
  messageId: string;
  senderId: string;
  senderName: string;
  status: LocalMessageStatus | null;
  timestamp: string;
}

const PLAYBACK_SPEEDS = [0.5, 1, 1.5, 2] as const;
const WAVEFORM_BAR_COUNT = 28;

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${(safeSeconds % 60).toString().padStart(2, '0')}`;
}

function waveformForMessage(messageId: string): number[] {
  let seed = 0;
  for (let index = 0; index < messageId.length; index += 1) {
    seed = (seed * 31 + messageId.charCodeAt(index)) >>> 0;
  }
  return Array.from({ length: WAVEFORM_BAR_COUNT }, (_, index) => {
    seed = (seed * 1664525 + 1013904223 + index) >>> 0;
    return 5 + (seed % 14);
  });
}

export function VoiceMessagePlayer({
  audioUrl,
  avatarUrl,
  durationMs,
  isOutgoing,
  messageId,
  senderId,
  senderName,
  status: messageStatus,
  timestamp,
}: VoiceMessagePlayerProps) {
  const { active } = useCall();
  const inCall = Boolean(active && active.phase !== 'ended');
  const inCallRef = useRef(inCall);
  inCallRef.current = inCall;
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const styles = createStyles(isOutgoing ? c.outgoingText : c.textPrimary);
  const player = useAudioPlayer(audioUrl, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  useEffect(
    () =>
      registerChatAudio(async () => {
        player.pause();
      }),
    [player]
  );
  useEffect(() => {
    if (inCall) player.pause();
  }, [inCall, player]);
  const [speed, setSpeed] = useState<(typeof PLAYBACK_SPEEDS)[number]>(1);
  const bars = useMemo(() => waveformForMessage(messageId), [messageId]);
  const durationSeconds = status.duration || durationMs / 1000;
  const progress = durationSeconds
    ? Math.min(1, status.currentTime / durationSeconds)
    : 0;
  const completedBars = Math.round(progress * bars.length);

  useEffect(() => {
    player.loop = false;
  }, [player]);

  useEffect(() => {
    if (!status.didJustFinish) return;
    player.pause();
    void player.seekTo(0);
  }, [player, status.didJustFinish]);

  const togglePlayback = async (): Promise<void> => {
    if (inCallRef.current) return;
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
    });
    if (inCallRef.current) return;
    if (status.playing) {
      player.pause();
      return;
    }
    if (durationSeconds && status.currentTime >= durationSeconds - 0.05) {
      await player.seekTo(0);
    }
    player.setPlaybackRate(speed, 'medium');
    player.play();
  };

  const cycleSpeed = (): void => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(speed);
    const nextSpeed =
      PLAYBACK_SPEEDS[(currentIndex + 1) % PLAYBACK_SPEEDS.length];
    setSpeed(nextSpeed);
    player.setPlaybackRate(nextSpeed, 'medium');
  };

  return (
    <View style={styles.container}>
      {status.playing ? (
        <Pressable
          accessibilityHint="Cycles through 0.5, 1, 1.5, and 2 times speed"
          accessibilityLabel={`Playback speed ${speed} times`}
          accessibilityRole="button"
          onPress={cycleSpeed}
          style={({ pressed }) => [
            styles.speedButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.speedText}>{speed}×</Text>
        </Pressable>
      ) : (
        <ConversationAvatar
          avatarUrl={avatarUrl}
          name={senderName}
          size={38}
          userId={senderId}
        />
      )}

      <Pressable
        accessibilityLabel={
          status.playing ? 'Pause voice message' : 'Play voice message'
        }
        accessibilityRole="button"
        disabled={inCall}
        accessibilityHint={
          inCall ? 'Voice messages are paused during a call' : undefined
        }
        onPress={() => void togglePlayback()}
        style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
      >
        <MaterialIcons
          color={isOutgoing ? c.outgoingText : c.textPrimary}
          name={status.playing ? 'pause' : 'play-arrow'}
          size={30}
        />
      </Pressable>

      <View style={styles.waveformArea}>
        <View accessibilityElementsHidden style={styles.waveform}>
          {bars.map((height, index) => (
            <View
              key={`${messageId}-${index}`}
              style={[
                styles.waveformBar,
                { height },
                index < completedBars && styles.waveformBarPlayed,
              ]}
            />
          ))}
        </View>
        <View style={styles.footer}>
          <Text style={styles.duration}>
            {formatDuration(
              status.playing || status.currentTime > 0
                ? status.currentTime
                : durationMs / 1000
            )}
          </Text>
          <View style={styles.metadata}>
            <Text style={styles.timestamp}>{timestamp}</Text>
            {isOutgoing ? (
              <MessageStatusIcon
                color={c.outgoingStatus}
                size={15}
                status={messageStatus}
                style={styles.statusIcon}
              />
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const createStyles = (foreground: string) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      flexDirection: 'row',
      minWidth: 245,
    },
    duration: {
      color: foreground,
      fontSize: 11,
      opacity: 0.72,
    },
    footer: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 3,
    },
    metadata: { alignItems: 'center', flexDirection: 'row', marginLeft: 8 },
    playButton: {
      alignItems: 'center',
      height: 40,
      justifyContent: 'center',
      marginHorizontal: 5,
      width: 36,
    },
    pressed: { opacity: 0.65 },
    speedButton: {
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.18)',
      borderRadius: 19,
      height: 38,
      justifyContent: 'center',
      width: 38,
    },
    speedText: { color: foreground, fontSize: 13, fontWeight: '700' },
    statusIcon: { marginLeft: 4 },
    timestamp: { color: foreground, fontSize: 11, opacity: 0.72 },
    waveform: {
      alignItems: 'center',
      flexDirection: 'row',
      height: 22,
      overflow: 'hidden',
    },
    waveformArea: { flex: 1, minWidth: 0 },
    waveformBar: {
      backgroundColor: foreground,
      borderRadius: 1,
      flex: 1,
      marginHorizontal: 1,
      maxWidth: 3,
      opacity: 0.32,
      width: 2,
    },
    waveformBarPlayed: { opacity: 0.9 },
  });
