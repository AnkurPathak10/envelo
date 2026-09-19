import { clearTokens, getTokens, saveTokens } from '@/lib/auth/storage';

export interface ApiUser {
  id: string;
  email: string;
  displayName: string;
}
interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  user: ApiUser;
}
interface ApiRequestOptions extends RequestInit {
  skipAuthRefresh?: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isConnectivityError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 0;
}

const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
if (!apiUrl) throw new Error('EXPO_PUBLIC_API_URL must be set in mobile/.env');
let onSessionExpired: (() => void) | undefined;
export function setSessionExpiredHandler(
  handler: (() => void) | undefined
): void {
  onSessionExpired = handler;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
    )
      return body.error;
  } catch {
    /* Fall back to a status-based error. */
  }
  return `Request failed with status ${response.status}`;
}
async function fetchApi(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  try {
    return await fetch(`${apiUrl}${path}`, options);
  } catch {
    throw new ApiError(
      'Unable to reach the server. Check your connection and try again.',
      0
    );
  }
}
async function refreshStoredTokens(): Promise<RefreshResponse | null> {
  const tokens = await getTokens();
  if (!tokens) return null;
  const response = await fetchApi('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  });
  if (!response.ok) return null;
  const refreshed = (await response.json()) as RefreshResponse;
  await saveTokens(refreshed, refreshed.user.id);
  return refreshed;
}
export async function apiRequest<T>(
  path: string,
  { skipAuthRefresh = false, headers, ...options }: ApiRequestOptions = {}
): Promise<T> {
  const tokens = await getTokens();
  const requestHeaders = new Headers(headers);
  if (tokens?.accessToken)
    requestHeaders.set('Authorization', `Bearer ${tokens.accessToken}`);
  let response = await fetchApi(path, { ...options, headers: requestHeaders });
  if (response.status === 401 && !skipAuthRefresh) {
    const refreshed = await refreshStoredTokens();
    if (refreshed) {
      requestHeaders.set('Authorization', `Bearer ${refreshed.accessToken}`);
      response = await fetchApi(path, { ...options, headers: requestHeaders });
    } else {
      await clearTokens();
      onSessionExpired?.();
    }
  }
  if (!response.ok)
    throw new ApiError(await readErrorMessage(response), response.status);
  return (await response.json()) as T;
}
export async function refreshSessionFromStorage(): Promise<RefreshResponse | null> {
  const refreshed = await refreshStoredTokens();
  if (!refreshed) await clearTokens();
  return refreshed;
}
