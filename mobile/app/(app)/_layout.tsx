import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { colors } from '@/constants/theme';

export default function AppLayout() {
  const scheme = useColorScheme() ?? 'light';
  const c = colors[scheme];

  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: c.bgBase },
        headerStyle: { backgroundColor: c.bgBase },
        headerTintColor: c.textPrimary,
      }}
    >
      <Stack.Screen name="home" options={{ headerShown: false }} />
      <Stack.Screen
        name="new-conversation"
        options={{ headerBackTitle: 'Back', title: 'New conversation' }}
      />
      <Stack.Screen
        name="conversation/[conversationId]"
        options={{ headerBackTitle: 'Back', title: 'Conversation' }}
      />
    </Stack>
  );
}
