import { NextRequest, NextResponse } from "next/server";

import { requireGuestOrHigher } from "@/lib/auth";
import { cleanCode } from "@/lib/barcodeQuery";
import { resolveBarcode } from "@/services/barcodeResolver";

export async function GET(req: NextRequest) {
  // Proxy vers des API tierces (souvent payantes) → auth obligatoire.
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  const refreshParam =
    req.nextUrl.searchParams.get("refresh") ||
    req.nextUrl.searchParams.get("noCache") ||
    "";
  const shouldRefresh = ["1", "true", "yes"].includes(
    refreshParam.toLowerCase(),
  );
  const cleanedBarcode = cleanCode(req.nextUrl.searchParams.get("q"));
  const type = req.nextUrl.searchParams.get("type");

  if (!cleanedBarcode.length) {
    return NextResponse.json({ error: "Missing barcode" }, { status: 400 });
  }

  const result = await resolveBarcode(cleanedBarcode, type, {
    refresh: shouldRefresh,
  });
  return NextResponse.json(result);
}
