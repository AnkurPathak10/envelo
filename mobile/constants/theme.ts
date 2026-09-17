/**
 * Design tokens for Envelo (see ui-context.md).
 * Plain JS constants, not CSS — React Native has no CSS engine,
 * so these are imported directly into each screen's
 * StyleSheet.create() calls instead of a shared stylesheet.
 *
 * Use the useColorScheme() hook from 'react-native' to pick the
 * right set at the point a screen builds its styles, e.g.:
 *
 *   import { useColorScheme } from 'react-native';
 *   import { colors } from '@/constants/theme';
 *
 *   const scheme = useColorScheme() ?? 'light';
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
    border: '#242B33',
    error: '#E5484D',
    success: '#30A46C',
  },
};

export const radius = {
  sm: 8,
  md: 16,
  lg: 20,
};
