import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionSheet } from '@/components/ui/action-sheet';
import { messagingColors as colors, spacing } from '@/constants/theme';
import { type ThemePreference, useAppTheme } from '@/lib/theme/ThemeContext';

export const themeLabels: Record<ThemePreference, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};
const icons = {
  light: 'light-mode',
  dark: 'dark-mode',
  system: 'brightness-auto',
} as const;

export function ThemePicker({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { preference, setPreference } = useAppTheme();
  return (
    <ActionSheet
      visible={visible}
      title="Appearance"
      description="Choose how Envelo looks on this device."
      onClose={onClose}
      actions={(['light', 'dark', 'system'] as const).map((value) => ({
        label: themeLabels[value],
        icon: icons[value],
        selected: preference === value,
        description:
          value === 'system' ? 'Follow your device settings' : undefined,
        onPress: () => {
          onClose();
          void setPreference(value);
        },
      }))}
    />
  );
}

export function ThemeToggle() {
  const { colorScheme, preference } = useAppTheme();
  const c = colors[colorScheme];
  const styles = createStyles(c);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Appearance, ${themeLabels[preference]}. Change theme`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.row,
          pressed && { backgroundColor: c.bgSurface },
        ]}
      >
        <Text style={styles.label}>Appearance</Text>
        <View style={styles.value}>
          <Text style={styles.valueText}>{themeLabels[preference]}</Text>
          <MaterialIcons name="expand-more" size={22} color={c.textMuted} />
        </View>
      </Pressable>
      <ThemePicker visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      minHeight: 64,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    label: { color: c.textPrimary, fontSize: 16, fontWeight: '500', flex: 1 },
    value: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    valueText: { color: c.textMuted, fontSize: 15 },
  });
