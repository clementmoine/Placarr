import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSetting, setSetting } from "@/services/settings";

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const onlyFreeProviders =
    (await getSetting("only_free_providers", "true")) === "true";
  return NextResponse.json({ onlyFreeProviders });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    if (body.onlyFreeProviders !== undefined) {
      await setSetting(
        "only_free_providers",
        body.onlyFreeProviders ? "true" : "false",
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update settings:", error);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
