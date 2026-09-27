import { apiRequest } from '@/lib/api/client';
import type { ConversationParticipant } from '@/lib/api/conversations';

export interface FriendRequest {
  id: string;
  createdAt: string;
  requester: ConversationParticipant;
}

interface FriendshipResponse {
  friendship: {
    id: string;
    requesterId: string;
    addresseeId: string;
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  };
}

export async function sendFriendRequest(addresseeId: string) {
  return apiRequest<FriendshipResponse>('/api/friends/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ addresseeId }),
  });
}

export async function acceptFriendRequest(id: string) {
  return apiRequest<FriendshipResponse>(
    `/api/friends/requests/${encodeURIComponent(id)}/accept`,
    {
      method: 'POST',
    }
  );
}

export async function rejectFriendRequest(id: string) {
  return apiRequest<FriendshipResponse>(
    `/api/friends/requests/${encodeURIComponent(id)}/reject`,
    {
      method: 'POST',
    }
  );
}

export async function getFriends(): Promise<ConversationParticipant[]> {
  const response = await apiRequest<{ friends: ConversationParticipant[] }>(
    '/api/friends'
  );
  return response.friends;
}

export async function getPendingRequests(): Promise<FriendRequest[]> {
  const response = await apiRequest<{ requests: FriendRequest[] }>(
    '/api/friends/requests'
  );
  return response.requests;
}
