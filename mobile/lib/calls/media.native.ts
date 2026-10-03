import { AppState, NativeModules, Platform } from 'react-native';
import type {
  MediaStreamTrack as NativeTrack,
  MediaStream as NativeStream,
} from '@cloudflare/react-native-webrtc';
import type { CallMedia, MediaState } from './mediaTypes';

// Lazy loading keeps Expo Go and older builds usable for messaging.
export const callingAvailable = Boolean(
  NativeModules.WebRTCModule && NativeModules.RTKRNPermissions
);

export async function createCallMedia(
  token: string,
  update: (state: MediaState) => void,
  left: () => void
): Promise<CallMedia> {
  if (!callingAvailable)
    throw new Error('Install a new Envelo development build to use calls.');
  const { default: RealtimeKit } =
    await import('@cloudflare/realtimekit-react-native');
  const { MediaStream } = await import('@cloudflare/react-native-webrtc');
  const meeting = await RealtimeKit.init({
    authToken: token,
    defaults: { audio: true, video: false },
  });
  let disposed = false;
  const streams = new Map<string, NativeStream>();
  const streamUrl = (track: MediaStreamTrack | undefined): string | null => {
    if (!track) return null;
    if (!streams.has(track.id))
      streams.set(track.id, new MediaStream([track as unknown as NativeTrack]));
    return streams.get(track.id)!.toURL();
  };
  const publish = () => {
    if (disposed) return;
    const remotes = meeting.participants.joined.toArray();
    const remote = remotes[0];
    const participants = remotes.map((p) => ({
      id: p.id,
      userId: p.customParticipantId?.split(':').slice(2).join(':') ?? p.userId,
      name: p.name,
      picture: p.picture ?? null,
      video: p.videoEnabled ? streamUrl(p.videoTrack) : null,
      microphoneOn: p.audioEnabled,
    }));
    const liveTracks = new Set([
      meeting.self.videoTrack?.id,
      ...remotes.map((p) => p.videoTrack?.id),
    ]);
    for (const [id, stream] of streams)
      if (!liveTracks.has(id)) {
        stream.release(false);
        streams.delete(id);
      }
    update({
      participants,
      joined: meeting.self.roomJoined,
      microphoneOn: meeting.self.audioEnabled,
      cameraOn: meeting.self.videoEnabled,
      speakerOn: /speaker/i.test(
        meeting.self.getCurrentDevices().speaker?.deviceId ?? ''
      ),
      localVideo: meeting.self.videoEnabled
        ? streamUrl(meeting.self.videoTrack)
        : null,
      remoteVideo: remote?.videoEnabled ? streamUrl(remote.videoTrack) : null,
      remoteJoined: Boolean(remote),
    });
  };
  const onLeft = () => {
    if (!disposed) left();
  };
  meeting.self.on('*', publish);
  meeting.self.on('roomLeft', onLeft);
  meeting.participants.joined.on('videoUpdate', publish);
  meeting.participants.joined.on('audioUpdate', publish);
  meeting.participants.joined.on('participantJoined', publish);
  meeting.participants.joined.on('participantLeft', publish);
  // Pause the camera when leaving the foreground. Resuming video is explicit.
  const appState = AppState.addEventListener('change', (state) => {
    if (state !== 'active' && meeting.self.videoEnabled)
      void meeting.self
        .disableVideo()
        .then(publish)
        .catch(() => undefined);
  });
  const service = NativeModules.EnveloCallService as
    { start: () => Promise<void>; stop: () => void } | undefined;
  const leave = async () => {
    if (disposed) return;
    disposed = true;
    appState.remove();
    meeting.self.removeListener('*', publish);
    meeting.self.removeListener('roomLeft', onLeft);
    meeting.participants.joined.removeListener('videoUpdate', publish);
    meeting.participants.joined.removeListener('audioUpdate', publish);
    meeting.participants.joined.removeListener('participantJoined', publish);
    meeting.participants.joined.removeListener('participantLeft', publish);
    try {
      await meeting.leaveRoom();
    } finally {
      service?.stop();
      // These wrappers don't own the SDK's tracks.
      for (const stream of streams.values()) stream.release(false);
      streams.clear();
    }
  };
  return {
    join: async () => {
      try {
        if (Platform.OS === 'android') await service?.start();
        await meeting.joinRoom();
        const devices = await meeting.self.getSpeakerDevices();
        const earpiece = devices.find((d) => /earpiece/i.test(d.deviceId));
        const headset = devices.find((d) =>
          /bluetooth|wired|headset/i.test(d.deviceId)
        );
        if (headset ?? earpiece)
          await meeting.self.setDevice((headset ?? earpiece)!);
        publish();
      } catch (error) {
        await leave();
        throw error;
      }
    },
    leave,
    microphone: async (enabled) => {
      await (enabled
        ? meeting.self.enableAudio()
        : meeting.self.disableAudio());
      publish();
    },
    camera: async (enabled) => {
      await (enabled
        ? meeting.self.enableVideo()
        : meeting.self.disableVideo());
      publish();
      if (enabled && !meeting.self.videoEnabled)
        throw new Error(
          'Camera access is needed. Enable it in your device settings and try again.'
        );
    },
    speaker: async (enabled) => {
      const devices = await meeting.self.getSpeakerDevices();
      const device = devices.find((d) =>
        (enabled ? /speaker/i : /earpiece/i).test(d.deviceId)
      );
      if (!device)
        throw new Error('That audio output is unavailable on this device.');
      await meeting.self.setDevice(device);
      publish();
    },
    flip: async () => {
      const devices = await meeting.self.getVideoDevices();
      const current = meeting.self.getCurrentDevices().video;
      const next = devices.find((d) => d.deviceId !== current?.deviceId);
      if (next) await meeting.self.setDevice(next);
      publish();
    },
  };
}
