export interface MediaParticipant {
  id: string;
  userId: string;
  name: string;
  picture: string | null;
  video: string | null;
  microphoneOn: boolean;
}
export interface MediaState {
  participants: MediaParticipant[];
  joined: boolean;
  microphoneOn: boolean;
  cameraOn: boolean;
  speakerOn: boolean;
  localVideo: string | null;
  remoteVideo: string | null;
  remoteJoined: boolean;
}
export const emptyMedia: MediaState = {
  participants: [],
  joined: false,
  microphoneOn: true,
  cameraOn: false,
  speakerOn: false,
  localVideo: null,
  remoteVideo: null,
  remoteJoined: false,
};
export interface CallMedia {
  join: () => Promise<void>;
  leave: () => Promise<void>;
  microphone: (enabled: boolean) => Promise<void>;
  camera: (enabled: boolean) => Promise<void>;
  speaker: (enabled: boolean) => Promise<void>;
  flip: () => Promise<void>;
}
