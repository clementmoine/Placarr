import { NextRequest, NextResponse } from "next/server";

import { requireGuestOrHigher } from "@/lib/auth";
import { cancelBackgroundJobForUser } from "@/lib/jobs/backgroundJobs";

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ itemId: string }> },
) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot cancel background jobs" },
      { status: 403 },
    );
  }

  const { itemId } = await context.params;
  const cancelled = await cancelBackgroundJobForUser(auth.user.id, itemId);

  if (!cancelled) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({ cancelled: true, itemId });
}
