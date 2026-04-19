import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import type { AdminSessionState } from "@/lib/types";

const ADMIN_COOKIE_NAME = "disciple_training_admin";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

type SessionCookieOptions = {
  secure?: boolean;
};

function getAdminConfig() {
  return {
    username: process.env.ADMIN_USERNAME?.trim() || "admin",
    password: process.env.ADMIN_PASSWORD?.trim() || "admin123456",
    sessionSecret:
      process.env.SESSION_SECRET?.trim() || "change-this-session-secret-in-production",
  };
}

function signPayload(payload: string) {
  return crypto
    .createHmac("sha256", getAdminConfig().sessionSecret)
    .update(payload)
    .digest("base64url");
}

function createSessionToken(username: string) {
  const payload = Buffer.from(
    JSON.stringify({
      username,
      expiresAt: Date.now() + SESSION_DURATION_SECONDS * 1000,
    }),
  ).toString("base64url");

  return `${payload}.${signPayload(payload)}`;
}

function readSessionToken(token: string | undefined) {
  if (!token) {
    return null;
  }

  const [payload, signature] = token.split(".");

  if (!payload || !signature || signPayload(payload) !== signature) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      username?: string;
      expiresAt?: number;
    };

    if (!decoded.username || !decoded.expiresAt || decoded.expiresAt < Date.now()) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

export function validateAdminCredentials(username: string, password: string) {
  const config = getAdminConfig();
  return username === config.username && password === config.password;
}

function getSessionCookieSecure(options?: SessionCookieOptions) {
  return options?.secure ?? process.env.NODE_ENV === "production";
}

export function getRequestSessionCookieOptions(request: Request): SessionCookieOptions {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.trim().toLowerCase();
  const protocol = forwardedProto || new URL(request.url).protocol.replace(":", "");

  return {
    secure: protocol === "https",
  };
}

export function attachAdminSession(
  response: NextResponse,
  username: string,
  options?: SessionCookieOptions,
) {
  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: createSessionToken(username),
    httpOnly: true,
    sameSite: "lax",
    secure: getSessionCookieSecure(options),
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export function clearAdminSession(response: NextResponse, options?: SessionCookieOptions) {
  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: getSessionCookieSecure(options),
    path: "/",
    maxAge: 0,
  });
}

export async function getAdminSession(): Promise<AdminSessionState> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  const session = readSessionToken(token);

  if (!session) {
    return {
      authenticated: false,
    };
  }

  return {
    authenticated: true,
    username: session.username,
  };
}

export async function requireAdmin() {
  const session = await getAdminSession();

  if (!session.authenticated) {
    return NextResponse.json(
      {
        error: "请先登录管理员账号。",
      },
      { status: 401 },
    );
  }

  return null;
}
