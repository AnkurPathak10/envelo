import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import {
  ShadowsIntoLight_400Regular,
  useFonts,
} from '@expo-google-fonts/shadows-into-light';
import 'react-native-reanimated';

import { colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth/AuthContext';
import { SocketProvider } from '@/lib/socket/SocketContext';
import { AppThemeProvider } from '@/lib/theme/ThemeContext';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

function RootNavigator() {
  const { isLoading, user } = useAuth();
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const styles = createStyles(c);

  if (isLoading)
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={c.accentPrimary} size="large" />
      </View>
    );

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={Boolean(user)}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    ShadowsIntoLight_400Regular,
  });

  if (!fontsLoaded && !fontError) return null;

  return (
    <KeyboardProvider enabled={false} preload={false}>
      <AppThemeProvider>
        <ThemedRootLayout />
      </AppThemeProvider>
    </KeyboardProvider>
  );
}

function ThemedRootLayout() {
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const navigationTheme = {
    ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(scheme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: c.bgBase,
      border: c.border,
      card: c.bgBase,
      notification: c.accentPrimary,
      primary: c.accentPrimary,
      text: c.textPrimary,
    },
  };

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(c.bgBase);
  }, [c.bgBase]);

  return (
    <ThemeProvider value={navigationTheme}>
      <AuthProvider>
        <SocketProvider>
          <RootNavigator />
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        </SocketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    loadingContainer: {
      alignItems: 'center',
      backgroundColor: c.bgBase,
      flex: 1,
      justifyContent: 'center',
    },
  });
