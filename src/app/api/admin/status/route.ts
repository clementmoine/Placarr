import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { providerHealthChecks } from "@/services/provider/runtime";

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const results = await Promise.all(
    providerHealthChecks.map(async (check) => ({
      providerId: check.providerId,
      ...(await check.run()),
    })),
  );
  return NextResponse.json(results);
}
