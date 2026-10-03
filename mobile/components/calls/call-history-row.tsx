import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { messagingColors, spacing } from '@/constants/theme';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';
import { durationLabel, type CallRecord } from '@/lib/calls/contracts';

export function CallHistoryRow({
  call,
  outgoing,
  onRedial,
}: {
  call: CallRecord;
  outgoing: boolean;
  onRedial?: () => void;
}) {
  const c = messagingColors[useAppColorScheme()];
  const missed = call.status === 'MISSED';
  const label = missed
    ? outgoing
      ? 'No answer'
      : 'Missed call'
    : call.status === 'DECLINED'
      ? 'Declined call'
      : call.status === 'COMPLETED'
        ? `${outgoing ? 'Outgoing' : 'Incoming'} ${call.hadVideo ? 'video' : 'voice'} call`
        : 'Call in progress';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}${call.status === 'COMPLETED' ? `, ${durationLabel(call.durationSeconds)}` : ''}. Call again`}
      disabled={!onRedial}
      onPress={onRedial}
      style={[
        styles.row,
        {
          backgroundColor: c.bgSurface,
          borderColor: c.border,
          alignSelf: outgoing ? 'flex-end' : 'flex-start',
        },
      ]}
    >
      <MaterialIcons
        name={call.hadVideo ? 'videocam' : 'call'}
        size={24}
        color={missed ? c.error : c.accentPrimary}
      />
      <View style={{ flex: 1 }}>
        <Text
          style={{ color: missed ? c.error : c.textPrimary, fontWeight: '600' }}
        >
          {label}
        </Text>
        <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>
          {call.status === 'COMPLETED'
            ? `${durationLabel(call.durationSeconds)} · `
            : ''}
          {new Date(call.createdAt).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </Text>
      </View>
      <MaterialIcons name="call-made" size={18} color={c.textMuted} />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    padding: spacing.md,
    marginVertical: spacing.xs,
    minHeight: 64,
    width: '84%',
    maxWidth: 340,
  },
});
