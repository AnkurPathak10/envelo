import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ColorValue, StyleProp, TextStyle } from 'react-native';

import type { LocalMessageStatus } from '@/lib/chat/messages';

type MessageStatusIconProps = {
  status: LocalMessageStatus | null;
  color: ColorValue;
  size?: number;
  style?: StyleProp<TextStyle>;
};

export function getMessageStatusLabel(
  status: LocalMessageStatus | null
): string | undefined {
  if (!status) return undefined;
  if (status === 'PENDING') return 'Pending';
  if (status === 'READ') return 'Read';
  if (status === 'DELIVERED') return 'Delivered';
  return 'Sent';
}

export function MessageStatusIcon({
  status,
  color,
  size = 16,
  style,
}: MessageStatusIconProps) {
  if (!status) return null;

  if (status === 'PENDING') {
    return (
      <MaterialIcons
        accessibilityLabel={getMessageStatusLabel(status)}
        color={color}
        name="schedule"
        size={size}
        style={style}
      />
    );
  }

  return (
    <MaterialIcons
      accessibilityLabel={getMessageStatusLabel(status)}
      color={color}
      name={status === 'READ' ? 'done-all' : 'check'}
      size={size}
      style={style}
    />
  );
}
