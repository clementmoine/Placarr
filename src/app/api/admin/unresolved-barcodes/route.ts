import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatUnresolvedBarcodeScan } from "@/services/unresolvedBarcodeScans";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const status = req.nextUrl.searchParams.get("status") || "open";
  const shelfType = req.nextUrl.searchParams.get("type");
  const limitParam = Number(req.nextUrl.searchParams.get("limit") || 50);
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(200, limitParam))
    : 50;

  const scans = await prisma.unresolvedBarcodeScan.findMany({
    where: {
      ...(status === "all" ? {} : { status }),
      ...(shelfType ? { shelfType } : {}),
    },
    orderBy: [{ lastSeenAt: "desc" }, { seenCount: "desc" }],
    take: limit,
  });

  return NextResponse.json({
    scans: scans.map(formatUnresolvedBarcodeScan),
  });
}
