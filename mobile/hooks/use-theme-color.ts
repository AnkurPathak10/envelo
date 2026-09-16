import { useColorScheme } from 'react-native';
import { colors } from '@/constants/theme';

export function useThemeColor(props: { light?: string; dark?: string }, colorName: keyof typeof colors.light) {
  const scheme = useColorScheme() ?? 'light';
  return props[scheme] ?? colors[scheme][colorName];
}
