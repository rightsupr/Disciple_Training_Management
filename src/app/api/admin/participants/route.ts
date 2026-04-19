import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { createParticipant, listParticipants } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireAdmin();

  if (unauthorized) {
    return unauthorized;
  }

  return NextResponse.json({
    data: listParticipants(),
  });
}

export async function POST(request: Request) {
  const unauthorized = await requireAdmin();

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body = (await request.json()) as {
      name?: string;
    };

    return NextResponse.json({
      data: createParticipant(body.name || ""),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "新增参与人员失败。",
      },
      { status: 400 },
    );
  }
}
