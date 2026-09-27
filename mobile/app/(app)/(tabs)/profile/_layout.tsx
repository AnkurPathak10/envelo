import { Stack } from 'expo-router';

import { colors } from '@/constants/theme';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

export default function ProfileLayout() {
  const c = colors[useAppColorScheme()];
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.bgBase },
        headerTintColor: c.textPrimary,
        contentStyle: { backgroundColor: c.bgBase },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="friends" options={{ title: 'Friends' }} />
      <Stack.Screen name="requests" options={{ title: 'Friend requests' }} />
    </Stack>
  );
}
