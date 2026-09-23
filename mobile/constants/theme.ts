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
    accentPrimary: '#2F80ED',
    onAccent: '#FFFFFF',
    border: '#E2E6EA',
    error: '#D93036',
    success: '#1F9D5C',
  },
  dark: {
    bgBase: '#0B0F14',
    bgSurface: '#151A21',
    textPrimary: '#F5F7FA',
    textMuted: '#8A93A2',
    accentPrimary: '#2F80ED',
    onAccent: '#FFFFFF',
    border: '#242B33',
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
    unreadBadge: messagingPalette.cottonRose,
    selectedTheme: messagingPalette.cottonRose,
    onStateAction: colors.light.textPrimary,
  },
  dark: {
    ...colors.dark,
    outgoingBubble: colors.dark.accentPrimary,
    unreadBadge: colors.dark.accentPrimary,
    selectedTheme: colors.dark.accentPrimary,
    onStateAction: colors.dark.bgBase,
  },
};

export const messagingAvatarColors = [
  messagingPalette.rosyTaupe,
  messagingPalette.cottonRose,
  messagingPalette.softBlush,
  messagingPalette.platinum,
] as const;

export const authColors = {
  brandDeep: '#480200',
  brandPrimary: '#D39A86',
  brandSoft: '#E3C4C9',
  panel: '#FEFFFE',
  input: '#F1F0F1',
  textPrimary: '#11181C',
  textMuted: '#5B6572',
  textOnBrand: '#FEFFFE',
  error: '#D93036',
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
