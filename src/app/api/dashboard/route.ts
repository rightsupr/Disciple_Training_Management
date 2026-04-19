import { NextResponse } from "next/server";

import { getTodayDateKey } from "@/lib/date";
import { getDashboardData } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || getTodayDateKey();

  return NextResponse.json({
    data: getDashboardData(date),
  });
}
