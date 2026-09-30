import { apiRequest } from '@/lib/api/client';

export interface ConversationParticipant {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
}

export type FriendStatus =
  'NONE' | 'PENDING_OUTGOING' | 'PENDING_INCOMING' | 'FRIENDS' | 'COOLDOWN';

export interface SearchUser extends ConversationParticipant {
  friendStatus: FriendStatus;
  cooldownEndsAt?: string;
  incomingRequestId?: string;
}

interface ConversationListBase {
  id: string;
  createdAt: string;
  updatedAt: string;
  clearedAt: string | null;
  lastMessage: {
    id: string;
    senderId: string;
    content: string | null;
    mediaUrl: string | null;
    audioDurationMs: number | null;
    createdAt: string;
    status: MessageStatus | null;
    preview?: string;
  } | null;
  unreadCount: number;
}

export type ConversationListItem = ConversationListBase &
  (
    | { type: 'DIRECT'; participant: ConversationParticipant }
    | { type: 'GROUP'; name: string; photoUrl: string | null }
  );

export interface GroupDetail {
  id: string;
  name: string;
  photoUrl: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  mutedAt: string | null;
  members: (ConversationParticipant & { role: 'ADMIN' | 'MEMBER' })[];
}

export type MessageStatus = 'SENT' | 'DELIVERED' | 'READ';

export interface MessageReplyPreview {
  id: string;
  senderId: string;
  senderName: string;
  content: string | null;
  mediaUrl: string | null;
  audioDurationMs: number | null;
}

export interface TextMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  mediaUrl: string | null;
  audioDurationMs: number | null;
  replyTo: MessageReplyPreview | null;
  createdAt: string;
  status: MessageStatus | null;
  clientMessageId?: string | null;
  inboxPreview?: string;
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
  users: SearchUser[];
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

export async function searchUsers(query: string): Promise<SearchUser[]> {
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

export async function createGroupConversation(
  name: string,
  memberIds: string[],
  photoUrl?: string
): Promise<GroupDetail> {
  return apiRequest<GroupDetail>('/api/conversations/group', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      memberIds,
      ...(photoUrl ? { photoUrl } : {}),
    }),
  });
}

export async function getGroupConversation(
  conversationId: string
): Promise<GroupDetail> {
  return apiRequest<GroupDetail>(
    `/api/conversations/group/${encodeURIComponent(conversationId)}`
  );
}

const groupPath = (id: string) =>
  `/api/conversations/group/${encodeURIComponent(id)}`;

export async function updateGroupConversation(
  id: string,
  changes: {
    description?: string | null;
    name?: string;
    photoUrl?: string | null;
  }
): Promise<GroupDetail> {
  return apiRequest<GroupDetail>(groupPath(id), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
}

export async function addGroupMembers(
  id: string,
  memberIds: string[]
): Promise<GroupDetail> {
  return apiRequest<GroupDetail>(`${groupPath(id)}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberIds }),
  });
}

export async function removeGroupMember(
  id: string,
  userId: string
): Promise<{ deleted: boolean }> {
  return apiRequest<{ deleted: boolean }>(
    `${groupPath(id)}/members/${encodeURIComponent(userId)}`,
    { method: 'DELETE' }
  );
}

export async function setGroupMemberRole(
  id: string,
  userId: string,
  role: 'ADMIN' | 'MEMBER'
): Promise<GroupDetail> {
  const action = role === 'ADMIN' ? 'promote' : 'demote';
  return apiRequest<GroupDetail>(
    `${groupPath(id)}/members/${encodeURIComponent(userId)}/${action}`,
    { method: 'POST' }
  );
}

export async function setGroupMuted(
  id: string,
  muted: boolean
): Promise<GroupDetail> {
  return apiRequest<GroupDetail>(
    `${groupPath(id)}/${muted ? 'mute' : 'unmute'}`,
    {
      method: 'POST',
    }
  );
}

export async function dissolveGroup(id: string): Promise<{ deleted: boolean }> {
  return apiRequest<{ deleted: boolean }>(groupPath(id), { method: 'DELETE' });
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
