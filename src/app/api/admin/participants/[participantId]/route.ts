import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { deleteParticipant, setParticipantActiveState } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseParticipantId(value: string) {
  const participantId = Number(value);

  if (!Number.isInteger(participantId) || participantId <= 0) {
    throw new Error("参与人员 ID 无效。");
  }

  return participantId;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ participantId: string }> },
) {
  const unauthorized = await requireAdmin();

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { participantId: rawParticipantId } = await params;
    const participantId = parseParticipantId(rawParticipantId);
    const body = (await request.json()) as { isActive?: boolean };

    return NextResponse.json({
      data: setParticipantActiveState(participantId, Boolean(body.isActive)),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "更新参与人员状态失败。",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ participantId: string }> },
) {
  const unauthorized = await requireAdmin();

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { participantId: rawParticipantId } = await params;
    const participantId = parseParticipantId(rawParticipantId);

    return NextResponse.json({
      data: deleteParticipant(participantId),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "删除参与人员失败。",
      },
      { status: 400 },
    );
  }
}
