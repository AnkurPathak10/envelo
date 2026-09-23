import { Pressable, StyleSheet, Text, View } from 'react-native';

import { messagingColors as colors, radius, spacing } from '@/constants/theme';
import { type ThemePreference, useAppTheme } from '@/lib/theme/ThemeContext';

const options: { label: string; value: ThemePreference }[] = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'System', value: 'system' },
];

export function ThemeToggle() {
  const { colorScheme, preference, setPreference } = useAppTheme();
  const c = colors[colorScheme];
  const styles = createStyles(c);

  return (
    <View accessibilityRole="radiogroup" style={styles.container}>
      {options.map((option) => {
        const selected = preference === option.value;
        return (
          <Pressable
            accessibilityLabel={`${option.label} theme`}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            key={option.value}
            onPress={() => void setPreference(option.value)}
            style={({ pressed }) => [
              styles.option,
              selected && styles.selectedOption,
              pressed && styles.pressedOption,
            ]}
          >
            <Text style={[styles.label, selected && styles.selectedLabel]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    container: {
      backgroundColor: c.bgSurface,
      borderRadius: radius.sm,
      flexDirection: 'row',
      padding: spacing.xs,
    },
    label: { color: c.textMuted, fontSize: 12, fontWeight: '600' },
    option: {
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    pressedOption: { opacity: 0.72 },
    selectedLabel: { color: c.onAccent },
    selectedOption: { backgroundColor: c.selectedTheme },
  });
