import { NextRequest, NextResponse } from "next/server";

import { refreshTokenLifetimeSeconds } from "@/lib/auth/tokens";

const WEB_CLIENT_HEADER = "x-envelo-platform";
const WEB_REFRESH_COOKIE = "envelo_refresh_token";

export function isWebAuthRequest(request: NextRequest): boolean {
  return request.headers.get(WEB_CLIENT_HEADER) === "web";
}

export function readRefreshToken(
  request: NextRequest,
  bodyToken: string | undefined,
): string | null {
  if (isWebAuthRequest(request)) {
    return request.cookies.get(WEB_REFRESH_COOKIE)?.value ?? null;
  }
  return bodyToken ?? null;
}

export function exposeRefreshToken(
  request: NextRequest,
  refreshToken: string,
): string | undefined {
  return isWebAuthRequest(request) ? undefined : refreshToken;
}

export function setWebRefreshCookie(
  request: NextRequest,
  response: NextResponse,
  refreshToken: string,
): void {
  if (!isWebAuthRequest(request)) return;
  const isProduction = process.env.NODE_ENV === "production";
  response.cookies.set({
    name: WEB_REFRESH_COOKIE,
    value: refreshToken,
    httpOnly: true,
    maxAge: refreshTokenLifetimeSeconds(),
    path: "/api/auth",
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
  });
}

export function clearWebRefreshCookie(
  request: NextRequest,
  response: NextResponse,
): void {
  if (!isWebAuthRequest(request)) return;
  const isProduction = process.env.NODE_ENV === "production";
  response.cookies.set({
    name: WEB_REFRESH_COOKIE,
    value: "",
    httpOnly: true,
    maxAge: 0,
    path: "/api/auth",
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
  });
}
