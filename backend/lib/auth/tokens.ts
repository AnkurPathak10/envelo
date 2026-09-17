import crypto from "crypto";
import jwt, { SignOptions } from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

// ── Environment ──────────────────────────────────────────────────

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
const ACCESS_EXPIRES_IN = (process.env.ACCESS_TOKEN_EXPIRES_IN ??
  "15m") as SignOptions["expiresIn"];
const REFRESH_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN ?? "30d";

// ── Access Token (JWT) ───────────────────────────────────────────

interface AccessTokenPayload {
  sub: string;
  iat: number;
  exp: number;
}

/**
 * Sign a short-lived JWT access token.
 * Payload contains only { sub: userId, iat, exp } — no sensitive data.
 */
export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, ACCESS_SECRET, {
    expiresIn: ACCESS_EXPIRES_IN,
  });
}

/**
 * Verify a JWT access token and return its payload.
 * Throws on invalid signature, expiry, or malformed token.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, ACCESS_SECRET) as AccessTokenPayload;
}

// ── Refresh Token (opaque, random) ───────────────────────────────

/**
 * Generate a cryptographically random refresh token (128 hex chars).
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString("hex");
}

/**
 * Hash a refresh token using HMAC-SHA256 with the server's secret.
 * This ensures the hash isn't reproducible without the secret, even
 * if the database leaks.
 */
export function hashRefreshToken(token: string): string {
  return crypto
    .createHmac("sha256", REFRESH_SECRET)
    .update(token)
    .digest("hex");
}

/**
 * Parse a duration string like "30d" or "15m" into milliseconds.
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid duration format: ${duration}`);

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Unknown duration unit: ${unit}`);
  }
}

/**
 * Create a new refresh token in the database. Returns the raw token
 * (to send to the client) — only its HMAC hash is stored in the DB.
 */
export async function createRefreshTokenInDb(userId: string): Promise<string> {
  const rawToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(rawToken);
  const expiresAt = new Date(Date.now() + parseDuration(REFRESH_EXPIRES_IN));

  await prisma.refreshToken.create({
    data: {
      tokenHash,
      userId,
      expiresAt,
    },
  });

  return rawToken;
}
