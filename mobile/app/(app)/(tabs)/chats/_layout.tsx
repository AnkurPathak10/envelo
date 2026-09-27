import { Stack } from 'expo-router';

import { colors, messagingColors } from '@/constants/theme';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

export default function ChatsLayout() {
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
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="new-conversation"
        options={{ headerBackTitle: 'Back', title: 'New conversation' }}
      />
      <Stack.Screen
        name="conversation/[conversationId]"
        options={{
          animation: 'none',
          headerShown: false,
          contentStyle: { backgroundColor: messagingColors[scheme].bgBase },
        }}
      />
    </Stack>
  );
}
