import { NextResponse } from "next/server";

import { getMonthKeyFromDateKey, getTodayDateKey } from "@/lib/date";
import { getParticipantCalendarData } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseParticipantId(value: string) {
  const participantId = Number(value);

  if (!Number.isInteger(participantId) || participantId <= 0) {
    throw new Error("参与人员 ID 无效。");
  }

  return participantId;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ participantId: string }> },
) {
  try {
    const { participantId: rawParticipantId } = await params;
    const participantId = parseParticipantId(rawParticipantId);
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month") || getMonthKeyFromDateKey(getTodayDateKey());

    return NextResponse.json({
      data: getParticipantCalendarData(participantId, month),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "读取打卡月历失败。",
      },
      { status: 400 },
    );
  }
}
