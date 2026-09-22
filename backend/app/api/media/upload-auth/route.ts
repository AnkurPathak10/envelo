import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/requireAuth";
import { createImageKitUploadCredentials } from "@/lib/media";

export async function GET(request: NextRequest) {
  try {
    requireAuth(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(createImageKitUploadCredentials());
  } catch {
    return NextResponse.json(
      { error: "Media uploads are not configured" },
      { status: 500 },
    );
  }
}
