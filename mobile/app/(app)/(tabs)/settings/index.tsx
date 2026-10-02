import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemeToggle } from '@/components/theme/theme-toggle';
import { messagingColors as colors, spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/AuthContext';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';
import { useFloatingTabLayout } from '@/lib/navigation/floatingTabs';

export default function SettingsScreen() {
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const { signOut } = useAuth();
  const styles = createStyles(c);
  const floatingTabs = useFloatingTabLayout();

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.screen, { paddingBottom: floatingTabs.contentBottom }]}
    >
      <Text style={styles.title}>Settings</Text>
      <ThemeToggle />
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
    title: {
      color: c.textPrimary,
      fontSize: 28,
      fontWeight: '700',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
    },
  });
