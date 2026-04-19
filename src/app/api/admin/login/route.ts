import { NextResponse } from "next/server";

import {
  attachAdminSession,
  getRequestSessionCookieOptions,
  validateAdminCredentials,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cookieOptions = getRequestSessionCookieOptions(request);
  const body = (await request.json()) as {
    username?: string;
    password?: string;
  };

  const username = body.username?.trim() || "";
  const password = body.password?.trim() || "";

  if (!validateAdminCredentials(username, password)) {
    return NextResponse.json(
      {
        error: "账号或密码不正确。",
      },
      { status: 401 },
    );
  }

  const response = NextResponse.json({
    data: {
      authenticated: true,
      username,
    },
  });

  attachAdminSession(response, username, cookieOptions);

  return response;
}
