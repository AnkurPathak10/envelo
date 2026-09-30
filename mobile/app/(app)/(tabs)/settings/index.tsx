import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemeToggle } from '@/components/theme/theme-toggle';
import { messagingColors as colors, spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

export default function SettingsScreen() {
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const { signOut } = useAuth();
  const styles = createStyles(c);

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <Text style={styles.title}>Settings</Text>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        <ThemeToggle />
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => void signOut()}
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}
      >
        <MaterialIcons color={c.textPrimary} name="logout" size={23} />
        <Text style={styles.actionText}>Log out</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    action: {
      alignItems: 'center',
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: spacing.md,
      minHeight: 60,
      paddingHorizontal: spacing.lg,
    },
    actionText: {
      color: c.textPrimary,
      flex: 1,
      fontSize: 16,
      fontWeight: '500',
    },
    pressed: { backgroundColor: c.bgSurface },
    screen: { backgroundColor: c.bgBase, flex: 1 },
    section: {
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
    },
    sectionTitle: { color: c.textMuted, fontSize: 14, fontWeight: '600' },
    title: {
      color: c.textPrimary,
      fontSize: 28,
      fontWeight: '700',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
    },
  });
