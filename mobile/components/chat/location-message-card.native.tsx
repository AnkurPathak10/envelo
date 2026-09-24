import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Linking from 'expo-linking';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { messagingColors as colors, radius } from '@/constants/theme';
import type { LocationMessageCardProps } from '@/components/chat/location-message-card';
import { getGoogleMapsUrl } from '@/lib/chat/richMessageContent';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

export function LocationMessageCard({
  latitude,
  longitude,
}: LocationMessageCardProps) {
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const styles = createStyles(c);
  const mapsUrl = getGoogleMapsUrl(latitude, longitude);
  const coordinate = { latitude, longitude };

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
      <View pointerEvents="none" style={styles.mapFrame}>
        <MapView
          initialRegion={{
            ...coordinate,
            latitudeDelta: 0.006,
            longitudeDelta: 0.006,
          }}
          loadingEnabled
          pitchEnabled={false}
          rotateEnabled={false}
          scrollEnabled={false}
          style={styles.map}
          toolbarEnabled={false}
          zoomEnabled={false}
        >
          <Marker coordinate={coordinate} />
        </MapView>
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
    map: { height: '100%', width: '100%' },
    mapFrame: { height: 142, width: '100%' },
    pressed: { opacity: 0.78 },
    title: { color: c.textPrimary, fontSize: 14, fontWeight: '600' },
  });
