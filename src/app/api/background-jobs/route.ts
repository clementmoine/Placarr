import { NextRequest, NextResponse } from "next/server";

import { requireGuestOrHigher } from "@/lib/auth";
import {
  cancelAllBackgroundJobsForUser,
  listBackgroundJobsForUser,
} from "@/lib/jobs/backgroundJobs";

export async function GET(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.user.role === "guest") {
    return NextResponse.json({ jobs: [], count: 0 });
  }

  const jobs = await listBackgroundJobsForUser(auth.user.id);

  return NextResponse.json({
    count: jobs.length,
    jobs: jobs.map((job) => ({
      ...job,
      startedAt: job.startedAt.toISOString(),
    })),
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  if (auth.user.role === "guest") {
    return NextResponse.json(
      { error: "Guests cannot cancel background jobs" },
      { status: 403 },
    );
  }

  const cancelled = await cancelAllBackgroundJobsForUser(auth.user.id);

  return NextResponse.json({ cancelled });
}
