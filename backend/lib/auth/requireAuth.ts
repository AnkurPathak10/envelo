import { NextRequest } from "next/server";
import { verifyAccessToken } from "./tokens";

interface AuthResult {
  userId: string;
}

/**
 * Extract and verify the access token from a request's Authorization
 * header. Returns { userId } on success.
 *
 * Throws an Error with a descriptive message on failure — the calling
 * route handler should catch this and return a 401 response with
 * { error: "Unauthorized" }.
 *
 * Usage in a protected route:
 *
 *   try {
 *     const { userId } = requireAuth(request);
 *   } catch {
 *     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *   }
 */
export function requireAuth(request: NextRequest): AuthResult {
  const authHeader = request.headers.get("authorization");

  if (!authHeader) {
    throw new Error("Missing Authorization header");
  }

  const parts = authHeader.split(" ");

  if (parts.length !== 2 || parts[0] !== "Bearer") {
    throw new Error("Malformed Authorization header — expected 'Bearer <token>'");
  }

  const token = parts[1];

  try {
    const payload = verifyAccessToken(token);
    return { userId: payload.sub };
  } catch {
    throw new Error("Invalid or expired access token");
  }
}
