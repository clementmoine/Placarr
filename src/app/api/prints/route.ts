import { NextRequest, NextResponse } from "next/server";

import { requireGuestOrHigher } from "@/lib/auth";
import {
  lookupPrintCandidate,
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
 * Ceiling on a batch. A shelf is paginated well below this; the cap is there so
 * a crafted query cannot ask the provider for the whole set at once.
 */
const MAX_BATCH_KEYS = 120;

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
    const printKey = searchParams.get("printKey")?.trim();
    const type = searchParams.get("type")?.trim();

    /**
     * A whole shelf at once. Each tile needs to know what its copy is a print
     * of before it can draw the right foil, and a shelf holds dozens — one
     * request each would be dozens of round trips for an answer the provider
     * already holds in memory.
     */
    const printKeys = searchParams.get("printKeys")?.trim();
    if (printKeys && type) {
      const keys = [
        ...new Set(
          printKeys
            .split(",")
            .map((key) => key.trim())
            .filter(Boolean),
        ),
      ].slice(0, MAX_BATCH_KEYS);

      const found = await Promise.all(
        keys.map((key) =>
          lookupPrintCandidate(key, type, { signal: req.signal }).catch(
            // One unknown print must not cost the shelf its other answers.
            () => null,
          ),
        ),
      );

      return NextResponse.json({
        supported: true,
        candidates: Object.fromEntries(
          keys.map((key, index) => [key, found[index]]).filter(([, c]) => c),
        ),
      });
    }

    // Lookup by key answers what a print *is* — its finishes, above all — so
    // nothing has to persist a copy of that answer.
    if (printKey && type) {
      const candidate = await lookupPrintCandidate(printKey, type, {
        name: searchParams.get("name"),
        language: searchParams.get("language"),
        signal: req.signal,
      });
      return NextResponse.json({ supported: true, candidate });
    }

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
