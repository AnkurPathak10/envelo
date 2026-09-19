import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const AUTH_SESSION_KEY = 'envelo_auth_session_v2';
const LEGACY_ACCESS_TOKEN_KEY = 'envelo_access_token';
const LEGACY_REFRESH_TOKEN_KEY = 'envelo_refresh_token';
const webTokens = new Map<string, string>();

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

function isAuthTokens(value: unknown): value is AuthTokens {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AuthTokens>;
  return (
    typeof candidate.accessToken === 'string' &&
    candidate.accessToken.length > 0 &&
    typeof candidate.refreshToken === 'string' &&
    candidate.refreshToken.length > 0 &&
    typeof candidate.userId === 'string' &&
    candidate.userId.length > 0
  );
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS !== 'web') return SecureStore.getItemAsync(key);

  return webTokens.get(key) ?? null;
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS !== 'web') {
    await SecureStore.setItemAsync(key, value);
    return;
  }

  // Web tokens intentionally live only for this page lifecycle. A persistent
  // web session requires a separate backend-owned HttpOnly refresh cookie flow.
  webTokens.set(key, value);
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS !== 'web') {
    await SecureStore.deleteItemAsync(key);
    return;
  }

  webTokens.delete(key);
}

export async function getTokens(): Promise<AuthTokens | null> {
  const stored = await getItem(AUTH_SESSION_KEY);
  if (!stored) return null;

  try {
    const parsed: unknown = JSON.parse(stored);
    if (isAuthTokens(parsed)) return parsed;
  } catch {
    // Invalid or interrupted session records are discarded below.
  }

  await deleteItem(AUTH_SESSION_KEY);
  return null;
}

export async function saveTokens(
  tokens: Pick<AuthTokens, 'accessToken' | 'refreshToken'>,
  userId: string
): Promise<void> {
  await setItem(
    AUTH_SESSION_KEY,
    JSON.stringify({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      userId,
    } satisfies AuthTokens)
  );
}

export async function clearTokens(): Promise<void> {
  const deletions = await Promise.allSettled([
    deleteItem(AUTH_SESSION_KEY),
    deleteItem(LEGACY_ACCESS_TOKEN_KEY),
    deleteItem(LEGACY_REFRESH_TOKEN_KEY),
  ]);
  const failedDeletion = deletions.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  );
  if (failedDeletion) throw failedDeletion.reason;
}
