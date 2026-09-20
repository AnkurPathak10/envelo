import { Stack } from 'expo-router';

import { colors } from '@/constants/theme';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

export default function AppLayout() {
  const scheme = useAppColorScheme();
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
