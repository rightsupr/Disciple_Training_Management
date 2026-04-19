import { NextResponse } from "next/server";

import { toggleCheckin } from "@/lib/db";
import type { CheckinItemKey } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      date?: string;
      participantId?: number;
      itemType?: CheckinItemKey;
    };

    if (!body.date || !body.participantId || !body.itemType) {
      return NextResponse.json(
        {
          error: "缺少必要参数。",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      data: toggleCheckin(body.date, body.participantId, body.itemType),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "打卡失败，请稍后再试。",
      },
      { status: 400 },
    );
  }
}
