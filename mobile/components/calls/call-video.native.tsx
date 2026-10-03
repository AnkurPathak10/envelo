import type { StyleProp, ViewStyle } from 'react-native';
export function CallVideo({
  url,
  mirror,
  overlay,
  style,
}: {
  url: string;
  mirror?: boolean;
  overlay?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  // Rendered only after the native media adapter has initialized successfully.
  // Expo Go must not evaluate this native package before a call is available.
  const { RTCView } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@cloudflare/react-native-webrtc') as typeof import('@cloudflare/react-native-webrtc');
  return (
    <RTCView
      streamURL={url}
      mirror={mirror}
      objectFit="cover"
      zOrder={overlay ? 1 : 0}
      style={style}
    />
  );
}
