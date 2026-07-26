import { NextRequest, NextResponse } from "next/server";

import { requireGuestOrHigher } from "@/lib/auth";
import {
  searchPrintCandidates,
  supportsPrintSearch,
} from "@/core/identify/printSearch";
import { isAbortError } from "@/lib/http/abort";

/** Enough to fill a picker grid without turning a typo into a long scroll. */
const MAX_LIMIT = 48;

function parseLimit(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.min(parsed, MAX_LIMIT);
}

/**
 * Print search for shelves that cannot be scanned. Cards carry no barcode, so
 * this is how an item gets identified before it exists.
 */
export async function GET(req: NextRequest) {
  const auth = await requireGuestOrHigher(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q")?.trim();
    const type = searchParams.get("type")?.trim();

    if (!query || !type) {
      return NextResponse.json(
        { error: "q and type are required" },
        { status: 400 },
      );
    }

    if (!supportsPrintSearch(type)) {
      // Not an error: the caller asked a type no provider can answer for.
      return NextResponse.json({ supported: false, candidates: [] });
    }

    const candidates = await searchPrintCandidates(query, type, {
      language: searchParams.get("language"),
      limit: parseLimit(searchParams.get("limit")),
      signal: req.signal,
    });

    return NextResponse.json({ supported: true, candidates });
  } catch (error) {
    if (isAbortError(error)) {
      return NextResponse.json({ supported: true, candidates: [] });
    }
    console.error("[GET /api/prints]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
