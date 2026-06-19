import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { runProviderMappingAudit } from "@/services/providerMappingAudit";

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const payload = await runProviderMappingAudit();
  return NextResponse.json(payload);
}
