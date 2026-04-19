import { NextResponse } from "next/server";

import { clearAdminSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({
    data: {
      authenticated: false,
    },
  });

  clearAdminSession(response);

  return response;
}
