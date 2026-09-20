import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, useColorScheme as useSystemColorScheme } from 'react-native';

export type ThemePreference = 'light' | 'dark' | 'system';
export type AppColorScheme = 'light' | 'dark';

type ThemeContextValue = {
  preference: ThemePreference;
  colorScheme: AppColorScheme;
  setPreference: (preference: ThemePreference) => Promise<void>;
};

const THEME_PREFERENCE_KEY = 'envelo_theme_preference_v1';
const ThemeContext = createContext<ThemeContextValue | null>(null);

let storageMutation = Promise.resolve();

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function AppThemeProvider({ children }: PropsWithChildren) {
  const systemColorScheme = useSystemColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [hasHydrated, setHasHydrated] = useState(Platform.OS !== 'web');
  const preferenceRevision = useRef(0);

  useEffect(() => {
    if (Platform.OS === 'web') setHasHydrated(true);
  }, []);

  useEffect(() => {
    const revision = preferenceRevision.current;

    void AsyncStorage.getItem(THEME_PREFERENCE_KEY)
      .then((storedPreference) => {
        if (
          revision === preferenceRevision.current &&
          isThemePreference(storedPreference)
        ) {
          setPreferenceState(storedPreference);
        }
      })
      .catch(() => {
        // Keep the safe system default when preference storage is unavailable.
      });
  }, []);

  const setPreference = useCallback(
    async (nextPreference: ThemePreference): Promise<void> => {
      preferenceRevision.current += 1;
      setPreferenceState(nextPreference);

      storageMutation = storageMutation
        .catch(() => undefined)
        .then(() => AsyncStorage.setItem(THEME_PREFERENCE_KEY, nextPreference));

      try {
        await storageMutation;
      } catch {
        // The in-memory choice remains usable for this session.
      }
    },
    []
  );

  const colorScheme: AppColorScheme =
    preference === 'system'
      ? hasHydrated
        ? (systemColorScheme ?? 'light')
        : 'light'
      : preference;
  const value = useMemo(
    () => ({ preference, colorScheme, setPreference }),
    [colorScheme, preference, setPreference]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useAppTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used within AppThemeProvider');
  }

  return context;
}
