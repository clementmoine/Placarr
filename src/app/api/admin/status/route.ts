import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { providerHealthChecks } from "@/services/providers/healthChecks";

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const results = await Promise.all(
    providerHealthChecks.map((check) => check.run()),
  );
  return NextResponse.json(results);
}
