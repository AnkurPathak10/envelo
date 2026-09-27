import { apiRequest } from '@/lib/api/client';

let registeredToken: string | null = null;
let registrationInFlight: Promise<void> | null = null;

export async function registerPushToken(token: string): Promise<void> {
  const registration = apiRequest<{ registered: true }>('/api/push/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  }).then(() => {
    registeredToken = token;
  });
  registrationInFlight = registration;
  try {
    await registration;
  } finally {
    if (registrationInFlight === registration) registrationInFlight = null;
  }
}

export async function unregisterCurrentPushToken(): Promise<void> {
  await registrationInFlight?.catch(() => undefined);
  const token = registeredToken;
  registeredToken = null;
  if (!token) return;
  await apiRequest<{ registered: false }>('/api/push/register', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
}
