import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { previewDailyContentsImport } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const unauthorized = await requireAdmin();

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error: "请选择要上传的 Excel 文件。",
        },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    return NextResponse.json({
      data: previewDailyContentsImport(buffer),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "预览导入内容失败。",
      },
      { status: 400 },
    );
  }
}
