import { apiRequest, type ApiUser } from '@/lib/api/client';

export async function updateCurrentUserAvatar(
  avatarUrl: string
): Promise<ApiUser> {
  return apiRequest<ApiUser>('/api/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ avatarUrl }),
  });
}
