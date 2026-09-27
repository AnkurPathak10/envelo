import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError, apiRequest } from '@/lib/api/client';

const REGISTRATION_KEY = 'envelo_push_registration_v1';
const PENDING_REMOVALS_KEY = 'envelo_push_pending_removals_v1';

interface PushRegistration {
  token: string;
  revocationGrant: string;
}

let registeredToken: PushRegistration | null = null;
let registrationInFlight: Promise<void> | null = null;
let removalOperation: Promise<void> = Promise.resolve();

function isRegistration(value: unknown): value is PushRegistration {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<PushRegistration>;
  return (
    typeof record.token === 'string' &&
    record.token.length > 0 &&
    typeof record.revocationGrant === 'string' &&
    /^[a-f0-9]{64}$/i.test(record.revocationGrant)
  );
}

async function readRegistration(): Promise<PushRegistration | null> {
  if (registeredToken) return registeredToken;
  const raw = await AsyncStorage.getItem(REGISTRATION_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRegistration(parsed)) {
      registeredToken = parsed;
      return parsed;
    }
  } catch {
    // A corrupt local record cannot be used as a revocation grant.
  }
  await AsyncStorage.removeItem(REGISTRATION_KEY);
  return null;
}

async function readPendingRemovals(): Promise<PushRegistration[]> {
  const raw = await AsyncStorage.getItem(PENDING_REMOVALS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRegistration) : [];
  } catch {
    return [];
  }
}

function serializeRemoval(operation: () => Promise<void>): Promise<void> {
  const result = removalOperation.then(operation, operation);
  removalOperation = result.catch(() => undefined);
  return result;
}

async function queueRemoval(registration: PushRegistration): Promise<void> {
  await serializeRemoval(async () => {
    const pending = await readPendingRemovals();
    if (
      !pending.some(
        (item) =>
          item.token === registration.token &&
          item.revocationGrant === registration.revocationGrant
      )
    ) {
      pending.push(registration);
      await AsyncStorage.setItem(PENDING_REMOVALS_KEY, JSON.stringify(pending));
    }
    await AsyncStorage.removeItem(REGISTRATION_KEY);
    registeredToken = null;
  });
}

export function retryPendingPushTokenRemovals(): Promise<void> {
  return serializeRemoval(async () => {
    const pending = await readPendingRemovals();
    if (pending.length === 0) return;
    const remaining: PushRegistration[] = [];
    for (const registration of pending) {
      try {
        await apiRequest<{ registered: false }>('/api/push/register', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(registration),
          skipAuthRefresh: true,
        });
      } catch (error) {
        // A reassigned token no longer belongs to this grant and must not be
        // removed from the new account. Other failures can be retried later.
        if (!(error instanceof ApiError && [400, 403].includes(error.status))) {
          remaining.push(registration);
        }
      }
    }
    if (remaining.length > 0) {
      await AsyncStorage.setItem(
        PENDING_REMOVALS_KEY,
        JSON.stringify(remaining)
      );
    } else {
      await AsyncStorage.removeItem(PENDING_REMOVALS_KEY);
    }
  });
}

export async function registerPushToken(token: string): Promise<void> {
  const previous = registrationInFlight;
  const registration = (async () => {
    await previous?.catch(() => undefined);
    const stored = await readRegistration();
    if (stored && stored.token !== token) await queueRemoval(stored);
    await retryPendingPushTokenRemovals();
    const response = await apiRequest<{
      registered: true;
      revocationGrant: string;
    }>('/api/push/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!/^[a-f0-9]{64}$/i.test(response.revocationGrant ?? '')) {
      throw new Error('Push registration did not return a removal grant.');
    }
    const next = { token, revocationGrant: response.revocationGrant };
    registeredToken = next;
    await AsyncStorage.setItem(REGISTRATION_KEY, JSON.stringify(next));
  })();
  registrationInFlight = registration;
  try {
    await registration;
  } finally {
    if (registrationInFlight === registration) registrationInFlight = null;
  }
}

export async function unregisterCurrentPushToken(): Promise<void> {
  await registrationInFlight?.catch(() => undefined);
  const registration = await readRegistration();
  if (!registration) return;
  await queueRemoval(registration);
  await retryPendingPushTokenRemovals();
}
