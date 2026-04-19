import { NextResponse } from "next/server";

import { clearAdminSession, getRequestSessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const response = NextResponse.json({
    data: {
      authenticated: false,
    },
  });

  clearAdminSession(response, getRequestSessionCookieOptions(request));

  return response;
}
