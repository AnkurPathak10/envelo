import { apiRequest } from '@/lib/api/client';

export interface ConversationParticipant {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
}

export interface ConversationListItem {
  id: string;
  createdAt: string;
  updatedAt: string;
  clearedAt: string | null;
  participant: ConversationParticipant;
  lastMessage: {
    id: string;
    senderId: string;
    content: string | null;
    mediaUrl: string | null;
    createdAt: string;
    status: MessageStatus | null;
  } | null;
  unreadCount: number;
}

export type MessageStatus = 'SENT' | 'DELIVERED' | 'READ';

export interface MessageReplyPreview {
  id: string;
  senderId: string;
  senderName: string;
  content: string | null;
  mediaUrl: string | null;
}

export interface TextMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  mediaUrl: string | null;
  replyTo: MessageReplyPreview | null;
  createdAt: string;
  status: MessageStatus | null;
  clientMessageId?: string | null;
}

export interface MessageHistoryPage {
  clearedAt: string | null;
  messages: TextMessage[];
  nextCursor: string | null;
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
    clearedAt: string | null;
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
  clearedAt: string | null;
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

export async function getMessageHistory(
  conversationId: string,
  cursor?: string
): Promise<MessageHistoryPage> {
  const path = `/api/conversations/${encodeURIComponent(conversationId)}/messages`;
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return apiRequest<MessageHistoryPage>(`${path}${query}`);
}

export async function searchConversationMessages(
  conversationId: string,
  query: string
): Promise<TextMessage[]> {
  const path = `/api/conversations/${encodeURIComponent(conversationId)}/messages`;
  const response = await apiRequest<MessageHistoryPage>(
    `${path}?query=${encodeURIComponent(query)}`
  );
  return response.messages;
}

export async function clearConversationMessages(
  conversationId: string
): Promise<string> {
  const response = await apiRequest<{ clearedAt: string }>(
    `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
    { method: 'DELETE' }
  );
  return response.clearedAt;
}

export async function deleteConversation(
  conversationId: string
): Promise<{ clearedAt: string; deletedAt: string }> {
  return apiRequest<{ clearedAt: string; deletedAt: string }>(
    `/api/conversations/${encodeURIComponent(conversationId)}`,
    { method: 'DELETE' }
  );
}
