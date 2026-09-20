import { colors } from '@/constants/theme';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof colors.light
) {
  const scheme = useAppColorScheme();
  return props[scheme] ?? colors[scheme][colorName];
}
