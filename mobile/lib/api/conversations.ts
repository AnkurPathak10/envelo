import { apiRequest } from '@/lib/api/client';

export interface ConversationParticipant {
  id: string;
  displayName: string;
  email: string;
}

export interface ConversationListItem {
  id: string;
  createdAt: string;
  updatedAt: string;
  participant: ConversationParticipant;
}

interface ConversationListResponse {
  conversations: ConversationListItem[];
}

interface UserSearchResponse {
  users: ConversationParticipant[];
}

interface DirectConversationResponse {
  conversation: {
    id: string;
    createdAt: string;
    participant: ConversationParticipant;
  };
}

export async function getConversations(): Promise<ConversationListItem[]> {
  const response =
    await apiRequest<ConversationListResponse>('/api/conversations');
  return response.conversations;
}

export async function searchUsers(
  query: string
): Promise<ConversationParticipant[]> {
  const response = await apiRequest<UserSearchResponse>(
    `/api/users?query=${encodeURIComponent(query)}`
  );
  return response.users;
}

export async function createDirectConversation(participantId: string): Promise<{
  id: string;
  createdAt: string;
  participant: ConversationParticipant;
}> {
  const response = await apiRequest<DirectConversationResponse>(
    '/api/conversations/direct',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantId }),
    }
  );
  return response.conversation;
}
