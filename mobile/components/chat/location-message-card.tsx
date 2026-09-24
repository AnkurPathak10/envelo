import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Linking from 'expo-linking';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { messagingColors as colors, radius } from '@/constants/theme';
import { getGoogleMapsUrl } from '@/lib/chat/richMessageContent';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

export interface LocationMessageCardProps {
  latitude: number;
  longitude: number;
}

export function LocationMessageCard({
  latitude,
  longitude,
}: LocationMessageCardProps) {
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const styles = createStyles(c);
  const mapsUrl = getGoogleMapsUrl(latitude, longitude);

  return (
    <Pressable
      accessibilityHint="Opens this location in Google Maps"
      accessibilityLabel={`Location ${latitude}, ${longitude}`}
      accessibilityRole="link"
      onPress={() => {
        void Linking.openURL(mapsUrl).catch(() => undefined);
      }}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.preview}>
        <View style={styles.roadHorizontal} />
        <View style={styles.roadVertical} />
        <MaterialIcons color="#E94444" name="location-pin" size={44} />
      </View>
      <View style={styles.details}>
        <MaterialIcons color={c.accentPrimary} name="map" size={19} />
        <View style={styles.copy}>
          <Text style={styles.title}>Open in Google Maps</Text>
          <Text style={styles.coordinates} numberOfLines={1}>
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </Text>
        </View>
        <MaterialIcons color={c.textMuted} name="open-in-new" size={18} />
      </View>
    </Pressable>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    card: {
      borderColor: c.border,
      borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
      width: 240,
    },
    coordinates: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    copy: { flex: 1, marginHorizontal: 9 },
    details: {
      alignItems: 'center',
      backgroundColor: c.bgSurface,
      flexDirection: 'row',
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    pressed: { opacity: 0.78 },
    preview: {
      alignItems: 'center',
      backgroundColor: c.bgBase,
      height: 142,
      justifyContent: 'center',
      overflow: 'hidden',
    },
    roadHorizontal: {
      backgroundColor: c.bgSurface,
      height: 19,
      left: -20,
      position: 'absolute',
      right: -20,
      top: 54,
      transform: [{ rotate: '-9deg' }],
    },
    roadVertical: {
      backgroundColor: c.bgSurface,
      bottom: -30,
      left: 77,
      position: 'absolute',
      top: -30,
      transform: [{ rotate: '18deg' }],
      width: 15,
    },
    title: { color: c.textPrimary, fontSize: 14, fontWeight: '600' },
  });
