import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
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
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
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
