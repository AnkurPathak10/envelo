import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;

/**
 * Hash a plaintext password using bcrypt.
 * Cost factor 12 provides a good balance of security and performance.
 */
export async function hashPassword(raw: string): Promise<string> {
  return bcrypt.hash(raw, SALT_ROUNDS);
}

/**
 * Verify a plaintext password against a bcrypt hash.
 * Uses bcrypt.compare — never compares plaintext strings.
 */
export async function verifyPassword(
  raw: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(raw, hash);
}
