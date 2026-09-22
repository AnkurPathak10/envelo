import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ApiUser } from '@/lib/api/client';

const AUTH_USER_KEY = 'envelo_authenticated_user_v1';

function isApiUser(value: unknown): value is ApiUser {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ApiUser>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.email === 'string' &&
    typeof candidate.displayName === 'string' &&
    (candidate.avatarUrl === undefined ||
      candidate.avatarUrl === null ||
      typeof candidate.avatarUrl === 'string')
  );
}

export async function getCachedUser(): Promise<ApiUser | null> {
  const stored = await AsyncStorage.getItem(AUTH_USER_KEY);
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    return isApiUser(parsed)
      ? { ...parsed, avatarUrl: parsed.avatarUrl ?? null }
      : null;
  } catch {
    return null;
  }
}

export function saveCachedUser(user: ApiUser): Promise<void> {
  return AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function clearCachedUser(): Promise<void> {
  return AsyncStorage.removeItem(AUTH_USER_KEY);
}
