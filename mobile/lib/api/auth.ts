import {
  apiRequest,
  type ApiUser,
  refreshSessionFromStorage,
} from '@/lib/api/client';
import { getTokens } from '@/lib/auth/storage';
import { Platform } from 'react-native';
export interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  user: ApiUser;
}
export interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
}
export interface SignupChallenge {
  verificationRequired: true;
  challengeId: string;
  emailMasked: string;
  expiresAt: string;
  resendAvailableAt: string;
}
export interface VerifySignupOtpInput {
  challengeId: string;
  code: string;
}
export interface SignInInput {
  email: string;
  password: string;
}
export function signUp(input: SignUpInput): Promise<SignupChallenge> {
  return apiRequest<SignupChallenge>('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    skipAuthRefresh: true,
  });
}
export function verifySignUpOtp(
  input: VerifySignupOtpInput
): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/api/auth/signup/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    skipAuthRefresh: true,
  });
}
export function resendSignUpOtp(challengeId: string): Promise<SignupChallenge> {
  return apiRequest<SignupChallenge>('/api/auth/signup/resend-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId }),
    skipAuthRefresh: true,
  });
}
export function signIn(input: SignInInput): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    skipAuthRefresh: true,
  });
}
export function refreshSession(): Promise<AuthResponse | null> {
  return refreshSessionFromStorage();
}
export async function logout(): Promise<void> {
  const tokens = await getTokens();
  if (Platform.OS !== 'web' && !tokens?.refreshToken) return;
  await apiRequest<{ success: true }>('/api/auth/logout', {
    method: 'POST',
    headers:
      Platform.OS === 'web'
        ? undefined
        : { 'Content-Type': 'application/json' },
    body:
      Platform.OS === 'web'
        ? undefined
        : JSON.stringify({ refreshToken: tokens?.refreshToken }),
    skipAuthRefresh: true,
  });
}
