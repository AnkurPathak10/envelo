import { useAppTheme } from './ThemeContext';

export function useAppColorScheme(): 'light' | 'dark' {
  return useAppTheme().colorScheme;
}
