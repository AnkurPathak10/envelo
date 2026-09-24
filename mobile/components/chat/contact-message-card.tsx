import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Linking from 'expo-linking';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { messagingColors as colors, radius } from '@/constants/theme';
import type { SharedContactContent } from '@/lib/chat/richMessageContent';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

export function ContactMessageCard({
  email,
  name,
  phoneNumber,
}: SharedContactContent) {
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const styles = createStyles(c);
  const dialableNumber = phoneNumber?.replace(/[^\d+*#,;]/g, '') ?? '';

  return (
    <View accessibilityLabel={`Shared contact ${name}`} style={styles.card}>
      <View style={styles.avatar}>
        <MaterialIcons color={c.accentPrimary} name="person" size={27} />
      </View>
      <View style={styles.details}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {phoneNumber ? (
          <Pressable
            accessibilityHint="Opens the phone dialer"
            accessibilityLabel={`Call ${name} at ${phoneNumber}`}
            accessibilityRole="link"
            disabled={!dialableNumber}
            onPress={() => {
              void Linking.openURL(`tel:${dialableNumber}`).catch(
                () => undefined
              );
            }}
          >
            <Text style={styles.phone}>{phoneNumber}</Text>
          </Pressable>
        ) : null}
        {email ? <Text style={styles.email}>{email}</Text> : null}
      </View>
      {phoneNumber ? (
        <MaterialIcons color={c.accentPrimary} name="call" size={23} />
      ) : null}
    </View>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    avatar: {
      alignItems: 'center',
      backgroundColor: c.bgBase,
      borderRadius: 22,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    card: {
      alignItems: 'center',
      borderColor: c.border,
      borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      minWidth: 220,
      padding: 10,
    },
    details: { flex: 1, marginHorizontal: 10 },
    email: { color: c.textMuted, fontSize: 12, marginTop: 3 },
    name: { color: c.textPrimary, fontSize: 16, fontWeight: '600' },
    phone: {
      color: c.accentPrimary,
      fontSize: 15,
      marginTop: 3,
      textDecorationLine: 'underline',
    },
  });
