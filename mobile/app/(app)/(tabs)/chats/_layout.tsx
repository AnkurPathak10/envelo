import { Stack } from 'expo-router';

import { colors, messagingColors } from '@/constants/theme';
import { GroupCreationProvider } from '@/lib/groups/GroupCreationContext';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

export default function ChatsLayout() {
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  return (
    <GroupCreationProvider>
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
          name="new-group"
          options={{ headerBackTitle: 'Chats', title: 'New group' }}
        />
        <Stack.Screen
          name="new-group-details"
          options={{ headerBackTitle: 'Members', title: 'Group details' }}
        />
        <Stack.Screen
          name="group-info/[groupId]"
          options={{ title: 'Group info' }}
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
    </GroupCreationProvider>
  );
}
