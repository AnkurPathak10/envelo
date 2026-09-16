import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth/AuthContext';

export default function HomeScreen() {
  const { signOut, user } = useAuth();
  const scheme = useColorScheme() ?? 'light';
  const c = colors[scheme];
  const styles = createStyles(c);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome, {user?.displayName}</Text>
      <Text style={styles.subtitle}>You are signed in to Envelo.</Text>
      <Pressable onPress={() => void signOut()} style={styles.button}>
        <Text style={styles.buttonText}>Log out</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    button: { backgroundColor: c.bgSurface, borderColor: c.border, borderRadius: 8, borderWidth: 1, marginTop: 32, paddingHorizontal: 20, paddingVertical: 14 },
    buttonText: { color: c.textPrimary, fontSize: 16, fontWeight: '600' },
    container: { alignItems: 'center', backgroundColor: c.bgBase, flex: 1, justifyContent: 'center', padding: 24 },
    subtitle: { color: c.textMuted, fontSize: 16, marginTop: 10 },
    title: { color: c.textPrimary, fontSize: 26, fontWeight: '700', textAlign: 'center' },
  });
