import { z } from 'zod';
import { apiRequest } from '@/lib/api/client';

export const callSchema = z.object({
  type: z.literal('call'),
  id: z.string(),
  conversationId: z.string(),
  initiatorId: z.string(),
  status: z.enum(['RINGING', 'ONGOING', 'COMPLETED', 'MISSED', 'DECLINED']),
  hadVideo: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
  connectedAt: z.string().datetime({ offset: true }).nullable(),
  endedAt: z.string().datetime({ offset: true }).nullable(),
  durationSeconds: z.number().int().nonnegative(),
});
export const personSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
});
export const rosterSchema = z.object({
  participants: z.array(personSchema).optional(),
  invitedUserIds: z.array(z.string()).optional(),
  groupCall: z.boolean().optional(),
  guest: z.boolean().optional(),
  expiresAt: z.string().optional(),
});
export const updateSchema = rosterSchema.extend({
  call: callSchema,
  participantUserId: z.string().optional(),
  invitationEnded: z.boolean().optional(),
  left: z.boolean().optional(),
});
export const credentialsSchema = rosterSchema.extend({
  call: callSchema,
  authToken: z.string().min(1),
  meetingId: z.string(),
  participantId: z.string(),
});
export const incomingSchema = rosterSchema.extend({
  call: callSchema,
  caller: personSchema,
  expiresAt: z.string().datetime({ offset: true }),
});
export const syncSchema = rosterSchema.extend({
  call: callSchema.nullable(),
  caller: personSchema.optional(),
  expiresAt: z.string().optional(),
  authToken: z.string().optional(),
  meetingId: z.string().optional(),
  participantId: z.string().optional(),
});
export type CallRecord = z.infer<typeof callSchema>;
export type CallPerson = z.infer<typeof personSchema>;
export type CallCredentials = z.infer<typeof credentialsSchema>;
export type CallCommand =
  | 'call:invite'
  | 'call:accept'
  | 'call:decline'
  | 'call:end'
  | 'call:video-enabled'
  | 'call:sync';
export type CallEvent =
  | 'call:incoming'
  | 'call:accepted'
  | 'call:declined'
  | 'call:missed'
  | 'call:ended'
  | 'call:ringing-timeout';
export type CallAck =
  { ok: true; data: unknown } | { ok: false; error: string };
export function isTerminal(call: CallRecord) {
  return !['RINGING', 'ONGOING'].includes(call.status);
}
export function durationLabel(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
export async function getCallHistory(conversationId: string, cursor?: string) {
  return z
    .object({
      calls: z.array(callSchema),
      nextCursor: z.string().nullable(),
      clearedAt: z.string().nullable(),
    })
    .parse(
      await apiRequest(
        `/api/conversations/${encodeURIComponent(conversationId)}/calls${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`
      )
    );
}
