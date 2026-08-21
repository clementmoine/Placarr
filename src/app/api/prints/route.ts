import { NextRequest, NextResponse } from "next/server";

import { requireGuestOrHigher } from "@/lib/auth";
import {
  lookupPrintCandidate,
  printSearchCatalogues,
  searchPrintCandidates,
  supportsPrintSearch,
} from "@/core/identify/printSearch";
import { isAbortError } from "@/lib/http/abort";
import { localizeMaskImage } from "@/core/enrich/media/maskDownload";
import { localizePrintMasks } from "@/core/enrich/media/localizePrintMasks";
import { runWithConcurrency } from "@/lib/async/runWithConcurrency";

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
 * How many print lookups to run at once in a batch.
 * Full parallel (Promise.all of 120) floods the provider and turns every client
 * abort/HMR into a wall of ResponseAborted warnings.
 */
const LOOKUP_CONCURRENCY = 6;

/**
 * How many masks to fetch at once the first time a set is seen.
 *
 * Low on purpose. The publisher's image host rate-limits, and after the first
 * pass every mask is already on disk, so this only ever paces a cold start.
 */
const MASK_DOWNLOAD_CONCURRENCY = 4;

/**
 * Bring a print's masks onto our own origin before answering.
 *
 * Never trimmed: a mask lines up with its artwork pixel for pixel, and trimming
 * a margin would slide the foil off the card. See `localizePrintMasks` for why
 * hotlinking them was worse than an inconsistency.
 */
async function withLocalMasks<
  T extends Parameters<typeof localizePrintMasks>[0][number],
>(prints: readonly T[], signal: AbortSignal): Promise<T[]> {
  return localizePrintMasks(
    prints,
    ({ url, kind }) => localizeMaskImage(url, { kind, signal }),
    (items, worker) =>
      runWithConcurrency(items, MASK_DOWNLOAD_CONCURRENCY, worker, { signal }),
  );
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

      const found = await runWithConcurrency(
        keys,
        LOOKUP_CONCURRENCY,
        async (key) => {
          try {
            return await lookupPrintCandidate(key, type, {
              signal: req.signal,
            });
          } catch (error) {
            if (isAbortError(error) || req.signal.aborted) throw error;
            // One unknown print must not cost the shelf its other answers.
            return null;
          }
        },
        { signal: req.signal },
      );

      const resolved = found.filter((candidate) => candidate !== null);
      const localized = await withLocalMasks(resolved, req.signal);
      const localByCandidate = new Map(
        resolved.map((candidate, index) => [candidate, localized[index]]),
      );

      return NextResponse.json({
        supported: true,
        candidates: Object.fromEntries(
          keys
            .map((key, index) => [key, found[index]] as const)
            .filter(([, candidate]) => candidate)
            .map(([key, candidate]) => [
              key,
              localByCandidate.get(candidate!) ?? candidate,
            ]),
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
      const [localized] = candidate
        ? await withLocalMasks([candidate], req.signal)
        : [candidate];
      return NextResponse.json({ supported: true, candidate: localized });
    }

    if (!type) {
      return NextResponse.json({ error: "type is required" }, { status: 400 });
    }

    if (!supportsPrintSearch(type)) {
      // Not an error: the caller asked a type no provider can answer for.
      return NextResponse.json({ supported: false, candidates: [] });
    }

    const set = searchParams.get("set")?.trim() || null;

    /*
      Les catalogues se demandent **sans** requête : c'est ce qui permet de
      choisir une extension avant de savoir quoi y chercher. Tant qu'il fallait
      un `q`, le sélecteur restait vide à l'ouverture.
    */
    if (!query && !set) {
      return NextResponse.json({
        supported: true,
        candidates: [],
        catalogues: await printSearchCatalogues(
          type,
          searchParams.get("language"),
        ),
      });
    }

    const candidates = await searchPrintCandidates(query ?? "", type, {
      language: searchParams.get("language"),
      limit: parseLimit(searchParams.get("limit")),
      providerId: searchParams.get("catalogue"),
      setId: set,
      signal: req.signal,
    });

    /*
      Les catalogues sont listés par le serveur, avec leur libellé : le client
      n'a ainsi aucun nom de provider écrit en dur, et un jeu qui s'ajoute
      apparaît dans le sélecteur sans qu'on touche à l'interface.

      La liste est celle de tous les catalogues du type, pas seulement de ceux
      qui ont répondu : un filtre qui disparaît quand il ne rend rien est un
      filtre qu'on ne peut plus relâcher.
    */
    return NextResponse.json({
      supported: true,
      candidates,
      catalogues: await printSearchCatalogues(
        type,
        searchParams.get("language"),
      ),
    });
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
