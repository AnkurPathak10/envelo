import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAudioPlayer } from 'expo-audio';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ComponentProps } from 'react';
import {
  Alert,
  AppState,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  Vibration,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConversationAvatar } from '@/components/conversations/conversation-avatar';
import { colors, spacing } from '@/constants/theme';
import { useCall } from '@/lib/calls/CallContext';
import { useAuth } from '@/lib/auth/AuthContext';
import { durationLabel } from '@/lib/calls/contracts';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';
import { CallVideo } from './call-video';
import { CallFriendPicker } from './call-friend-picker';

function IncomingTone({ ringing }: { ringing: boolean }) {
  const player = useAudioPlayer(require('@/assets/audio/incoming-call.wav'));
  useEffect(() => {
    if (!ringing) return;
    player.loop = true;
    const play = () => {
      void player.seekTo(0);
      player.play();
      Vibration.vibrate([0, 400, 300, 400, 1900], true);
    };
    const stop = () => {
      player.pause();
      Vibration.cancel();
    };
    if (AppState.currentState === 'active') play();
    const listener = AppState.addEventListener('change', (state) =>
      state === 'active' ? play() : stop()
    );
    return () => {
      listener.remove();
      stop();
    };
  }, [player, ringing]);
  return null;
}

export function CallOverlay() {
  const call = useCall();
  const { user } = useAuth();
  const { active, media, minimized, busy } = call;
  const scheme = useAppColorScheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [now, setNow] = useState(Date.now());
  const [more, setMore] = useState(false);
  const [picker, setPicker] = useState(false);
  const grid = Boolean(active?.groupCall);
  const video = grid || Boolean(media.remoteVideo || media.localVideo);
  const c = colors[video ? 'dark' : scheme];
  const styles = createStyles(c);
  const activeId = active?.record?.id;
  useEffect(() => {
    setMore(false);
    setPicker(false);
  }, [activeId, minimized]);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  useEffect(() => {
    if (call.error && !active) {
      Alert.alert('Calling', call.error);
      call.clearError();
    }
  }, [active, call]);
  if (!active) return null;
  const incoming = active.incoming && active.phase === 'ringing';
  const ringing =
    incoming &&
    now <
      (active.expiresAt
        ? Date.parse(active.expiresAt)
        : Date.parse(active.record?.createdAt ?? '') + 46_000);
  const elapsed = active.record?.connectedAt
    ? Math.max(0, (now - Date.parse(active.record.connectedAt)) / 1000)
    : 0;
  const status =
    active.phase === 'connected'
      ? durationLabel(elapsed)
      : active.phase === 'ended'
        ? active.notice
        : (active.notice ??
          (incoming
            ? 'Incoming voice call'
            : active.phase === 'connecting'
              ? 'Connecting…'
              : 'Calling…'));
  const share = async () => {
    setMore(false);
    // Share the chat deep link, never provider credentials or a private meeting URL.
    try {
      await Share.share({
        message: active.guest
          ? 'Call and chat with me on Envelo.'
          : `Open this conversation in Envelo: envelo://chats/conversation/${encodeURIComponent(active.conversationId)}`,
      });
    } catch {
      Alert.alert('Unable to share', 'Please try again.');
    }
  };
  const avatar = (size: number) => (
    <ConversationAvatar
      avatarUrl={active.peer.avatarUrl}
      name={active.peer.displayName}
      userId={active.peer.id}
      size={size}
    />
  );
  const control = (
    label: string,
    icon: ComponentProps<typeof MaterialIcons>['name'],
    action: () => void,
    selected = false,
    tone?: 'danger' | 'success'
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: busy && tone !== 'danger' }}
      disabled={busy && tone !== 'danger'}
      onPress={action}
      style={({ pressed }) => [
        styles.control,
        pressed && { opacity: 0.65 },
        busy && tone !== 'danger' && { opacity: 0.5 },
      ]}
    >
      <View
        style={[
          styles.circle,
          video && styles.compactCircle,
          selected && { backgroundColor: c.accentPrimary },
          tone && { backgroundColor: tone === 'danger' ? c.error : c.success },
        ]}
      >
        <MaterialIcons
          name={icon}
          size={video ? 24 : 28}
          color={selected || tone ? c.onAccent : c.textPrimary}
        />
      </View>
      {!video && <Text style={styles.controlLabel}>{label}</Text>}
    </Pressable>
  );
  return (
    <>
      <IncomingTone ringing={ringing} />
      {minimized && (
        <View
          pointerEvents="box-none"
          style={[styles.bubbleLayer, { top: insets.top + spacing.sm }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Return to call with ${active.peer.displayName}, ${status}`}
            onPress={call.restore}
            style={styles.bubble}
          >
            {avatar(36)}
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={styles.bubbleName}>
                {active.peer.displayName}
              </Text>
              <Text style={styles.subtitle}>{status}</Text>
            </View>
            <MaterialIcons name="call" size={22} color={c.accentPrimary} />
          </Pressable>
        </View>
      )}
      <Modal
        visible={!minimized}
        animationType="fade"
        onRequestClose={() =>
          picker ? setPicker(false) : more ? setMore(false) : call.minimize()
        }
        statusBarTranslucent
        navigationBarTranslucent
      >
        <View
          style={[
            styles.screen,
            {
              paddingTop: insets.top,
              paddingBottom: Math.max(insets.bottom, spacing.md),
            },
          ]}
        >
          <StatusBar style={video || scheme === 'dark' ? 'light' : 'dark'} />
          {!grid && media.remoteVideo ? (
            <CallVideo
              url={media.remoteVideo}
              style={StyleSheet.absoluteFill}
            />
          ) : !grid && video && media.localVideo && !media.remoteJoined ? (
            <CallVideo
              url={media.localVideo}
              mirror
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          <View style={[styles.header, video && styles.videoHeader]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Minimize call"
              onPress={call.minimize}
              style={styles.smallButton}
            >
              <MaterialIcons
                name="expand-more"
                size={28}
                color={c.textPrimary}
              />
            </Pressable>
            <View style={styles.heading}>
              <Text numberOfLines={2} style={styles.name}>
                {grid
                  ? `Group call · ${active.participants?.length ?? 0}`
                  : active.peer.displayName}
              </Text>
              <Text accessibilityLiveRegion="polite" style={styles.subtitle}>
                {status}
              </Text>
            </View>
            <View style={styles.headerActions}>
              {active.phase === 'connected' && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add person to call"
                  disabled={busy}
                  onPress={() => setPicker(true)}
                  style={styles.smallButton}
                >
                  <MaterialIcons
                    name="person-add"
                    size={26}
                    color={c.textPrimary}
                  />
                </Pressable>
              )}
              {video && media.cameraOn ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Flip camera"
                  disabled={busy}
                  onPress={() => void call.flipCamera()}
                  style={styles.smallButton}
                >
                  <MaterialIcons
                    name="flip-camera-ios"
                    size={26}
                    color={c.textPrimary}
                  />
                </Pressable>
              ) : (
                <View style={styles.smallButtonPlaceholder} />
              )}
            </View>
          </View>
          <View style={styles.stage}>
            {grid ? (
              <ScrollView
                style={styles.gridScroll}
                contentContainerStyle={styles.grid}
              >
                {(active.participants ?? []).map((person) => {
                  const self = person.id === user?.id;
                  const remote = (media.participants ?? []).find(
                    (p) => p.userId === person.id
                  );
                  const url = self ? media.localVideo : remote?.video;
                  return (
                    <View
                      key={person.id}
                      style={[
                        styles.tile,
                        { width: (width - spacing.md * 2 - spacing.sm) / 2 },
                      ]}
                    >
                      {url ? (
                        <CallVideo
                          url={url}
                          mirror={self}
                          style={StyleSheet.absoluteFill}
                        />
                      ) : (
                        <ConversationAvatar
                          avatarUrl={person.avatarUrl}
                          name={person.displayName}
                          userId={person.id}
                          size={68}
                        />
                      )}
                      <View style={styles.tileCaption}>
                        <Text numberOfLines={1} style={styles.tileName}>
                          {self ? 'You' : person.displayName}
                        </Text>
                        {!(self
                          ? media.microphoneOn
                          : (remote?.microphoneOn ?? true)) && (
                          <MaterialIcons
                            name="mic-off"
                            color={c.textPrimary}
                            size={16}
                          />
                        )}
                        {!self && !remote && (
                          <Text style={styles.subtitle}>Connecting…</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            ) : null}
            {!grid &&
              !media.remoteVideo &&
              (!media.localVideo || media.remoteJoined) && (
                <View style={styles.identity}>
                  {avatar(Math.min(width * 0.58, height * 0.28, 260))}
                  {video && <Text style={styles.subtitle}>Camera off</Text>}
                </View>
              )}
            {!grid && media.localVideo && media.remoteJoined && (
              <View style={styles.selfPreview}>
                <CallVideo
                  url={media.localVideo}
                  mirror
                  overlay
                  style={StyleSheet.absoluteFill}
                />
                <Text style={styles.previewLabel}>You</Text>
              </View>
            )}
          </View>
          {call.error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {call.error}
            </Text>
          )}
          <ScrollView
            style={styles.controlsScroll}
            contentContainerStyle={styles.controlsContainer}
            bounces={false}
          >
            {active.phase === 'ended' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => call.dismiss()}
                style={styles.done}
              >
                <Text style={styles.controlLabel}>Back to chat</Text>
              </Pressable>
            ) : incoming ? (
              <View style={styles.dock}>
                {control(
                  'Decline',
                  'call-end',
                  () => void call.end(),
                  false,
                  'danger'
                )}
                {control(
                  'Accept',
                  'call',
                  () => void call.accept(),
                  false,
                  'success'
                )}
              </View>
            ) : (
              <View style={[styles.dock, !video && styles.voiceDock]}>
                <View style={styles.controlRow}>
                  {video && control('More', 'more-horiz', () => setMore(true))}
                  {control(
                    'Speaker',
                    'volume-up',
                    () => void call.toggleSpeaker(),
                    media.speakerOn
                  )}
                  {control(
                    'Video',
                    media.cameraOn ? 'videocam' : 'videocam-off',
                    () => void call.toggleCamera(),
                    media.cameraOn
                  )}
                  {control(
                    media.microphoneOn ? 'Mute' : 'Unmute',
                    media.microphoneOn ? 'mic' : 'mic-off',
                    () => void call.toggleMicrophone(),
                    !media.microphoneOn
                  )}
                  {video &&
                    control(
                      'End call',
                      'call-end',
                      () => void call.end(),
                      false,
                      'danger'
                    )}
                </View>
                {!video && (
                  <View style={styles.controlRow}>
                    {control('More', 'more-horiz', () => setMore(true))}
                    {control('Share', 'share', () => void share())}
                    {control(
                      'End call',
                      'call-end',
                      () => void call.end(),
                      false,
                      'danger'
                    )}
                  </View>
                )}
              </View>
            )}
          </ScrollView>
          {more && (
            <View style={styles.sheetLayer}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close call options"
                onPress={() => setMore(false)}
                style={StyleSheet.absoluteFill}
              />
              <View
                accessibilityViewIsModal
                style={[
                  styles.sheet,
                  { marginBottom: Math.max(insets.bottom, spacing.md) },
                ]}
              >
                <Text style={styles.sheetTitle}>Call options</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setMore(false);
                    call.sendMessage();
                  }}
                  style={styles.sheetRow}
                >
                  <MaterialIcons
                    name="chat-bubble-outline"
                    color={c.textPrimary}
                    size={25}
                  />
                  <Text style={styles.sheetText}>Send message</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void share()}
                  style={styles.sheetRow}
                >
                  <MaterialIcons name="share" color={c.textPrimary} size={25} />
                  <Text style={styles.sheetText}>Share conversation</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setMore(false)}
                  style={styles.sheetRow}
                >
                  <Text style={styles.subtitle}>Close</Text>
                </Pressable>
              </View>
            </View>
          )}
          {picker && active.phase === 'connected' && (
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  top: insets.top,
                  bottom: Math.max(insets.bottom, spacing.md),
                },
              ]}
            >
              <CallFriendPicker close={() => setPicker(false)} />
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}
const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgBase },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.md,
      gap: spacing.sm,
    },
    videoHeader: { backgroundColor: `${c.bgBase}CC` },
    heading: { flex: 1, alignItems: 'center', gap: spacing.xs },
    name: {
      fontSize: 23,
      fontWeight: '700',
      color: c.textPrimary,
      textAlign: 'center',
    },
    subtitle: { fontSize: 14, color: c.textMuted, textAlign: 'center' },
    smallButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: c.bgSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    smallButtonPlaceholder: { width: 48 },
    headerActions: { flexDirection: 'row', gap: spacing.xs },
    gridScroll: { flex: 1, alignSelf: 'stretch' },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      padding: spacing.md,
      gap: spacing.sm,
    },
    tile: {
      aspectRatio: 0.85,
      borderRadius: 22,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.bgSurface,
    },
    tileCaption: {
      position: 'absolute',
      bottom: 8,
      left: 8,
      right: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: `${c.bgBase}CC`,
      borderRadius: 12,
      padding: 6,
    },
    tileName: {
      color: c.textPrimary,
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
    },
    stage: {
      flex: 1,
      minHeight: 100,
      justifyContent: 'center',
      alignItems: 'center',
    },
    identity: { alignItems: 'center', gap: spacing.md },
    selfPreview: {
      position: 'absolute',
      bottom: spacing.md,
      right: spacing.md,
      width: 104,
      height: 152,
      borderRadius: 20,
      overflow: 'hidden',
      backgroundColor: c.bgSurface,
      borderWidth: 2,
      borderColor: c.border,
    },
    previewLabel: {
      position: 'absolute',
      bottom: 8,
      left: 8,
      color: colors.dark.textPrimary,
      backgroundColor: `${colors.dark.bgBase}CC`,
      paddingHorizontal: 6,
      borderRadius: 8,
    },
    controlsScroll: { flexGrow: 0, maxHeight: '48%' },
    controlsContainer: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
    },
    dock: {
      flexDirection: 'row',
      justifyContent: 'space-evenly',
      backgroundColor: c.bgSurface,
      borderRadius: 36,
      padding: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      gap: spacing.sm,
    },
    voiceDock: {
      flexDirection: 'column',
      gap: spacing.lg,
      paddingVertical: spacing.lg,
    },
    controlRow: {
      flexDirection: 'row',
      justifyContent: 'space-evenly',
      flex: 1,
      gap: spacing.xs,
    },
    control: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      flex: 1,
      minHeight: 48,
    },
    circle: {
      width: 60,
      height: 60,
      borderRadius: 30,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.bgBase,
    },
    compactCircle: { width: 48, height: 48, borderRadius: 24 },
    controlLabel: { color: c.textPrimary, fontSize: 14, textAlign: 'center' },
    error: {
      color: c.error,
      textAlign: 'center',
      padding: spacing.md,
      backgroundColor: c.bgBase,
    },
    done: {
      backgroundColor: c.bgSurface,
      padding: spacing.lg,
      borderRadius: 32,
      alignItems: 'center',
    },
    bubbleLayer: {
      position: 'absolute',
      right: spacing.md,
      left: spacing.md,
      zIndex: 1000,
      alignItems: 'flex-end',
    },
    bubble: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: 10,
      borderRadius: 30,
      borderWidth: 1,
      borderColor: c.accentPrimary,
      backgroundColor: c.bgSurface,
      width: 238,
      elevation: 12,
      shadowColor: colors.light.textPrimary,
      shadowOpacity: 0.2,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    bubbleName: { color: c.textPrimary, fontWeight: '600', fontSize: 14 },
    sheetLayer: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-end',
      backgroundColor: `${colors.dark.bgBase}88`,
    },
    sheet: {
      backgroundColor: c.bgSurface,
      borderRadius: 32,
      padding: spacing.lg,
      marginHorizontal: spacing.md,
      borderColor: c.border,
      borderWidth: 1,
    },
    sheetTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.textPrimary,
      marginBottom: spacing.sm,
    },
    sheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 56,
      gap: spacing.md,
    },
    sheetText: { fontSize: 17, color: c.textPrimary },
  });
