import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import 'react-native-reanimated';

import { colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth/AuthContext';
import { SocketProvider } from '@/lib/socket/SocketContext';

function RootNavigator() {
  const { isLoading, user } = useAuth();
  const scheme = useColorScheme() ?? 'light';
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
  const scheme = useColorScheme() ?? 'light';
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
