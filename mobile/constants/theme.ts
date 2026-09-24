/**
 * Design tokens for Envelo (see ui-context.md).
 * Plain JS constants, not CSS — React Native has no CSS engine,
 * so these are imported directly into each screen's
 * StyleSheet.create() calls instead of a shared stylesheet.
 *
 * Use the app's useAppColorScheme() hook to pick the
 * right set at the point a screen builds its styles, e.g.:
 *
 *   import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';
 *   import { colors } from '@/constants/theme';
 *
 *   const scheme = useAppColorScheme();
 *   const c = colors[scheme];
 *   // then use c.bgBase, c.textPrimary, etc.
 */

export const colors = {
  light: {
    bgBase: '#FFFFFF',
    bgSurface: '#F5F7FA',
    textPrimary: '#11181C',
    textMuted: '#5B6572',
    accentPrimary: '#D39A86',
    onAccent: '#FFFFFF',
    border: '#E2E6EA',
    error: '#D93036',
    success: '#1F9D5C',
  },
  dark: {
    bgBase: '#242326',
    bgSurface: '#343236',
    textPrimary: '#F7F2F0',
    textMuted: '#B8AEAB',
    accentPrimary: '#D39A86',
    onAccent: '#FFFFFF',
    border: '#4A464A',
    error: '#E5484D',
    success: '#30A46C',
  },
};

// Feature 18 is scoped to the inbox and open chat, not the global light theme.
export const messagingPalette = {
  rosyTaupe: '#D39A86',
  cottonRose: '#E3C4C9',
  softBlush: '#FEE3E2',
  platinum: '#F1F0F1',
  white: '#FEFFFE',
} as const;

type MessagingColors = typeof colors.light & {
  outgoingBubble: string;
  outgoingText: string;
  unreadBadge: string;
  selectedTheme: string;
  onStateAction: string;
};

export const messagingColors: Record<'light' | 'dark', MessagingColors> = {
  light: {
    ...colors.light,
    bgBase: messagingPalette.white,
    bgSurface: messagingPalette.platinum,
    accentPrimary: messagingPalette.rosyTaupe,
    onAccent: colors.light.textPrimary,
    border: messagingPalette.cottonRose,
    outgoingBubble: messagingPalette.softBlush,
    outgoingText: colors.light.textPrimary,
    unreadBadge: messagingPalette.cottonRose,
    selectedTheme: messagingPalette.cottonRose,
    onStateAction: colors.light.textPrimary,
  },
  dark: {
    ...colors.dark,
    onAccent: colors.light.textPrimary,
    outgoingBubble: messagingPalette.softBlush,
    outgoingText: colors.light.textPrimary,
    unreadBadge: messagingPalette.cottonRose,
    selectedTheme: messagingPalette.cottonRose,
    onStateAction: colors.light.textPrimary,
  },
};

export const messagingAvatarColors = [
  messagingPalette.rosyTaupe,
  messagingPalette.cottonRose,
  messagingPalette.softBlush,
  messagingPalette.platinum,
] as const;

export const authColors = {
  light: {
    brandDeep: '#480200',
    brandPrimary: messagingPalette.rosyTaupe,
    brandSoft: messagingPalette.cottonRose,
    panel: messagingPalette.white,
    input: messagingPalette.platinum,
    textPrimary: colors.light.textPrimary,
    textMuted: colors.light.textMuted,
    textOnBrand: messagingPalette.white,
    link: '#480200',
    error: colors.light.error,
  },
  dark: {
    brandDeep: '#480200',
    brandPrimary: messagingPalette.rosyTaupe,
    brandSoft: '#6B5555',
    panel: colors.dark.bgBase,
    input: colors.dark.bgSurface,
    textPrimary: colors.dark.textPrimary,
    textMuted: colors.dark.textMuted,
    textOnBrand: messagingPalette.white,
    link: messagingPalette.rosyTaupe,
    error: colors.dark.error,
  },
} as const;

export const radius = {
  sm: 8,
  md: 16,
  lg: 20,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;
