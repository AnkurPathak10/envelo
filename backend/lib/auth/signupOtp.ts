import crypto from "crypto";
import { isIP } from "net";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  EmailDeliveryError,
  sendSignupVerificationEmail,
} from "@/lib/email/brevo";

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const SEND_COOLDOWN_MS = 60 * 1000;
const SEND_WINDOW_MS = 60 * 60 * 1000;
const MAX_EMAIL_SENDS_PER_HOUR = 5;
const MAX_IP_SENDS_PER_HOUR = 20;
const MAX_VERIFICATION_ATTEMPTS = 5;
const SERIALIZABLE_ATTEMPTS = 3;

export type SignupOtpErrorCode =
  | "ACCOUNT_EXISTS"
  | "DELIVERY_UNAVAILABLE"
  | "INVALID_CHALLENGE"
  | "INVALID_CODE"
  | "RATE_LIMITED";

export class SignupOtpError extends Error {
  constructor(
    public readonly code: SignupOtpErrorCode,
    message: string,
    public readonly status: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "SignupOtpError";
  }
}

export interface SignupChallenge {
  verificationRequired: true;
  challengeId: string;
  emailMasked: string;
  expiresAt: string;
  resendAvailableAt: string;
}

interface PreparedSend {
  challengeId: string;
  email: string;
  emailMasked: string;
  code: string;
  otpHash: string;
  expiresAt: Date;
  resendAvailableAt: Date;
  eventId: string;
}

interface InitialSignupInput {
  email: string;
  displayName: string;
  passwordHash: string;
  clientAddress: string;
}

export interface VerifiedSignupUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

function deliveryUnavailable(): SignupOtpError {
  return new SignupOtpError(
    "DELIVERY_UNAVAILABLE",
    "Verification email is temporarily unavailable. Please try again later.",
    503,
  );
}

function otpSecret(): string {
  const secret = process.env.EMAIL_OTP_HMAC_SECRET?.trim();
  if (!secret || secret.length < 32) throw deliveryUnavailable();
  return secret;
}

function dailyCap(): number {
  const cap = Number(process.env.EMAIL_OTP_DAILY_CAP);
  if (!Number.isSafeInteger(cap) || cap <= 0) throw deliveryUnavailable();
  return cap;
}

function invalidCode(): SignupOtpError {
  return new SignupOtpError(
    "INVALID_CODE",
    "Invalid or expired verification code",
    400,
  );
}

function digest(scope: string, value: string): string {
  return crypto
    .createHmac("sha256", otpSecret())
    .update(`${scope}:${value}`)
    .digest("hex");
}

export function hashSignupOtp(
  challengeId: string,
  email: string,
  code: string,
): string {
  return digest("signup-otp", `${challengeId}:${email}:${code}`);
}

export function matchesSignupOtp(
  expectedHash: string,
  challengeId: string,
  email: string,
  code: string,
): boolean {
  const actualHash = hashSignupOtp(challengeId, email, code);
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(actualHash, "hex");
  return (
    expected.length === actual.length &&
    crypto.timingSafeEqual(expected, actual)
  );
}

export function signupClientAddress(headers: Headers): string {
  let forwarded: string | undefined;
  if (process.env.VERCEL === "1") {
    forwarded =
      headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
      headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  } else if (process.env.RENDER === "true") {
    forwarded = headers.get("cf-connecting-ip")?.trim();
  }
  if (forwarded && isIP(forwarded)) return forwarded;
  return "local-development";
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local?.slice(0, 1) || "*"}***@${domain}`;
}

function secondsUntil(target: Date, now: Date): number {
  return Math.max(1, Math.ceil((target.getTime() - now.getTime()) / 1000));
}

function rateLimited(retryAfterSeconds: number): SignupOtpError {
  return new SignupOtpError(
    "RATE_LIMITED",
    "Please wait before requesting another verification code.",
    429,
    Math.max(1, retryAfterSeconds),
  );
}

async function enforceSendLimits(
  tx: Prisma.TransactionClient,
  email: string,
  clientAddress: string,
  lastSentAt: Date | null,
  now: Date,
): Promise<{ emailHash: string; ipHash: string }> {
  if (lastSentAt) {
    const nextSendAt = new Date(lastSentAt.getTime() + SEND_COOLDOWN_MS);
    if (nextSendAt > now) throw rateLimited(secondsUntil(nextSendAt, now));
  }

  const emailHash = digest("signup-email", email);
  const ipHash = digest("signup-ip", clientAddress);
  const hourAgo = new Date(now.getTime() - SEND_WINDOW_MS);
  const utcDayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const [emailEvents, ipEvents, acceptedToday] = await Promise.all([
    tx.emailOtpSendEvent.findMany({
      where: { emailHash, createdAt: { gte: hourAgo } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    tx.emailOtpSendEvent.findMany({
      where: { ipHash, createdAt: { gte: hourAgo } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    tx.emailOtpSendEvent.count({
      where: { acceptedAt: { gte: utcDayStart } },
    }),
  ]);

  if (emailEvents.length >= MAX_EMAIL_SENDS_PER_HOUR) {
    throw rateLimited(
      secondsUntil(
        new Date(emailEvents[0].createdAt.getTime() + SEND_WINDOW_MS),
        now,
      ),
    );
  }
  if (ipEvents.length >= MAX_IP_SENDS_PER_HOUR) {
    throw rateLimited(
      secondsUntil(
        new Date(ipEvents[0].createdAt.getTime() + SEND_WINDOW_MS),
        now,
      ),
    );
  }
  if (acceptedToday >= dailyCap()) {
    throw rateLimited(
      secondsUntil(new Date(utcDayStart.getTime() + 24 * 60 * 60 * 1000), now),
    );
  }
  return { emailHash, ipHash };
}

async function cleanupOldOtpState(now: Date): Promise<void> {
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  await Promise.all([
    prisma.pendingSignup.deleteMany({
      where: { expiresAt: { lt: sevenDaysAgo } },
    }),
    prisma.emailOtpSendEvent.deleteMany({
      where: { createdAt: { lt: sevenDaysAgo } },
    }),
  ]);
}

async function retrySerializable<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await work();
    } catch (error: unknown) {
      if (
        attempt >= SERIALIZABLE_ATTEMPTS ||
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034"
      ) {
        throw error;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, 20 * attempt + crypto.randomInt(0, 21)),
      );
    }
  }
}

function newCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

async function prepareInitialSend(
  input: InitialSignupInput,
): Promise<PreparedSend> {
  await cleanupOldOtpState(new Date()).catch(() => undefined);
  const code = newCode();
  return retrySerializable(() =>
    prisma.$transaction(
      async (tx) => {
        const now = new Date();
        const existingUser = await tx.user.findUnique({
          where: { email: input.email },
          select: { id: true },
        });
        if (existingUser) {
          throw new SignupOtpError(
            "ACCOUNT_EXISTS",
            "An account with this email already exists",
            409,
          );
        }

        const existing = await tx.pendingSignup.findUnique({
          where: { email: input.email },
        });
        const { emailHash, ipHash } = await enforceSendLimits(
          tx,
          input.email,
          input.clientAddress,
          existing?.lastSentAt ?? null,
          now,
        );
        const challengeId = crypto.randomUUID();
        const otpHash = hashSignupOtp(challengeId, input.email, code);
        const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MS);
        if (existing) {
          await tx.pendingSignup.delete({ where: { id: existing.id } });
        }
        await tx.pendingSignup.create({
          data: {
            id: challengeId,
            email: input.email,
            displayName: input.displayName,
            passwordHash: input.passwordHash,
            otpHash,
            expiresAt,
            lastSentAt: now,
          },
        });
        const event = await tx.emailOtpSendEvent.create({
          data: { emailHash, ipHash },
          select: { id: true },
        });
        return {
          challengeId,
          email: input.email,
          emailMasked: maskEmail(input.email),
          code,
          otpHash,
          expiresAt,
          resendAvailableAt: new Date(now.getTime() + SEND_COOLDOWN_MS),
          eventId: event.id,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

async function prepareResend(
  challengeId: string,
  clientAddress: string,
): Promise<PreparedSend> {
  await cleanupOldOtpState(new Date()).catch(() => undefined);
  const code = newCode();
  return retrySerializable(() =>
    prisma.$transaction(
      async (tx) => {
        const now = new Date();
        const existing = await tx.pendingSignup.findUnique({
          where: { id: challengeId },
        });
        if (!existing) {
          throw new SignupOtpError(
            "INVALID_CHALLENGE",
            "This signup verification has expired. Please sign up again.",
            400,
          );
        }
        const completedUser = await tx.user.findUnique({
          where: { email: existing.email },
          select: { id: true },
        });
        if (completedUser) throw invalidCode();

        const { emailHash, ipHash } = await enforceSendLimits(
          tx,
          existing.email,
          clientAddress,
          existing.lastSentAt,
          now,
        );
        const otpHash = hashSignupOtp(existing.id, existing.email, code);
        const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MS);
        await tx.pendingSignup.update({
          where: { id: existing.id },
          data: {
            otpHash,
            expiresAt,
            attempts: 0,
            lastSentAt: now,
            deliveryAcceptedAt: null,
          },
        });
        const event = await tx.emailOtpSendEvent.create({
          data: { emailHash, ipHash },
          select: { id: true },
        });
        return {
          challengeId: existing.id,
          email: existing.email,
          emailMasked: maskEmail(existing.email),
          code,
          otpHash,
          expiresAt,
          resendAvailableAt: new Date(now.getTime() + SEND_COOLDOWN_MS),
          eventId: event.id,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}

async function deliverPreparedCode(
  prepared: PreparedSend,
): Promise<SignupChallenge> {
  try {
    await sendSignupVerificationEmail(prepared.email, prepared.code);
    const acceptedAt = new Date();
    await prisma.$transaction(async (tx) => {
      const accepted = await tx.pendingSignup.updateMany({
        where: {
          id: prepared.challengeId,
          otpHash: prepared.otpHash,
          deliveryAcceptedAt: null,
        },
        data: { deliveryAcceptedAt: acceptedAt },
      });
      if (accepted.count !== 1) throw deliveryUnavailable();
      await tx.emailOtpSendEvent.update({
        where: { id: prepared.eventId },
        data: { acceptedAt },
      });
    });
  } catch (error: unknown) {
    if (error instanceof SignupOtpError) throw error;
    if (error instanceof EmailDeliveryError) throw deliveryUnavailable();
    throw deliveryUnavailable();
  }
  return {
    verificationRequired: true,
    challengeId: prepared.challengeId,
    emailMasked: prepared.emailMasked,
    expiresAt: prepared.expiresAt.toISOString(),
    resendAvailableAt: prepared.resendAvailableAt.toISOString(),
  };
}

export async function requestInitialSignupOtp(
  input: InitialSignupInput,
): Promise<SignupChallenge> {
  return deliverPreparedCode(await prepareInitialSend(input));
}

export async function resendSignupOtp(
  challengeId: string,
  clientAddress: string,
): Promise<SignupChallenge> {
  return deliverPreparedCode(await prepareResend(challengeId, clientAddress));
}

export async function verifySignupOtp(
  challengeId: string,
  code: string,
): Promise<VerifiedSignupUser> {
  const now = new Date();
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const pending = await tx.pendingSignup.findUnique({
          where: { id: challengeId },
        });
        if (
          !pending ||
          !pending.deliveryAcceptedAt ||
          pending.expiresAt <= now ||
          pending.attempts >= MAX_VERIFICATION_ATTEMPTS
        ) {
          return { kind: "invalid" as const };
        }

        if (
          !matchesSignupOtp(pending.otpHash, pending.id, pending.email, code)
        ) {
          const nextAttempts = pending.attempts + 1;
          const updated = await tx.pendingSignup.updateMany({
            where: {
              id: pending.id,
              otpHash: pending.otpHash,
              attempts: pending.attempts,
            },
            data: {
              attempts: nextAttempts,
              ...(nextAttempts >= MAX_VERIFICATION_ATTEMPTS
                ? { expiresAt: now }
                : {}),
            },
          });
          return {
            kind:
              updated.count === 1 ? ("invalid" as const) : ("retry" as const),
          };
        }

        const user = await tx.user.create({
          data: {
            email: pending.email,
            displayName: pending.displayName,
            passwordHash: pending.passwordHash,
            emailVerifiedAt: now,
          },
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
          },
        });
        await tx.pendingSignup.delete({ where: { id: pending.id } });
        return { kind: "success" as const, user };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (result.kind !== "success") throw invalidCode();
    return result.user;
  } catch (error: unknown) {
    if (error instanceof SignupOtpError) throw error;
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" ||
        error.code === "P2025" ||
        error.code === "P2034")
    ) {
      throw invalidCode();
    }
    throw error;
  }
}
