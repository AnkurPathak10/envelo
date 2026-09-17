import { Stack, useLocalSearchParams } from 'expo-router';

import { ChatScreen } from '@/components/chat/chat-screen';

function firstParam(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : (value?.[0] ?? '');
}

export default function ConversationScreen() {
  const params = useLocalSearchParams<{
    conversationId?: string | string[];
    participantName?: string | string[];
  }>();
  const conversationId = firstParam(params.conversationId);
  const participantName = firstParam(params.participantName).trim();

  return (
    <>
      <Stack.Screen options={{ title: participantName || 'Conversation' }} />
      <ChatScreen conversationId={conversationId} />
    </>
  );
}
