/**
 * Admin Catalogue browse for Naruto Carddass — sqlite SSOT (`catalog.sqlite`).
 *
 * Identity = {@link listNarutoSetPrints} (`includeUnprinted: true`).
 * Presentation (URLs, borrow, collapse) comes from {@link buildCatalogueCardRows}.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  buildCatalogueCardRows,
  type CatalogueCardRow,
} from "@/lib/admin/catalogueCards";
import { cataloguePackInfo } from "@/lib/admin/cataloguePacks";
import { packCardsDir } from "@/lib/packPaths";
import type { PrintCandidate } from "@/types/providerModule";

import {
  canonicalizeNarutoPrintKey,
  NARUTO_PACK_ID,
} from "./identity";
import {
  loadNarutoCardsIndexFromSqlite,
  narutoPackDbPath,
} from "./indexStore";
import {
  listNarutoPrintSets,
  listNarutoSetPrints,
  searchNarutoPrints,
} from "./search";

type Cache = { stamp: string; rows: CatalogueCardRow[] };
let cache: Cache | null = null;
let enumCache: { stamp: string; includeUnprinted: boolean; rows: CatalogueCardRow[] } | null =
  null;

function mtimeMs(file: string): number {
  try {
    if (!existsSync(file)) return 0;
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Max mtime under `cards/{lang}/{set}/` — materializing a face into
 * `fr/s1/*-prerelease/` must bust browse cache even when sqlite is unchanged.
 */
function cardsTreeStamp(cardsRoot: string, depth = 2): number {
  if (!existsSync(cardsRoot) || depth < 0) return 0;
  let max = mtimeMs(cardsRoot);
  if (depth === 0) return max;
  try {
    for (const name of readdirSync(cardsRoot)) {
      if (name.startsWith(".")) continue;
      const abs = path.join(cardsRoot, name);
      try {
        if (!statSync(abs).isDirectory()) {
          max = Math.max(max, mtimeMs(abs));
          continue;
        }
        max = Math.max(max, cardsTreeStamp(abs, depth - 1));
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return max;
}

function browseStamp(): string {
  const db = mtimeMs(narutoPackDbPath(NARUTO_PACK_ID));
  const cards = cardsTreeStamp(packCardsDir(NARUTO_PACK_ID));
  return `${db}:${cards}`;
}

function cardFromPrintKey(printKey: string): string {
  const canon = canonicalizeNarutoPrintKey(printKey);
  const m = /^naruto:[a-z0-9]+-(.+)$/i.exec(canon);
  return m?.[1] ?? "";
}

function candidateToRow(
  cand: PrintCandidate,
  fallbackSet: string,
): CatalogueCardRow {
  const tileLang = (cand.language ?? "fr").trim().toLowerCase() || "fr";
  const setCode = cand.setCode?.trim() || fallbackSet;
  const card = cardFromPrintKey(cand.printKey);
  return {
    printKey: cand.printKey,
    set: setCode,
    card,
    lang: tileLang,
    artUrl: cand.imageUrl || cand.thumbnailUrl || "",
    ...(cand.thumbnailUrl && cand.thumbnailUrl !== cand.imageUrl
      ? { thumbUrl: cand.thumbnailUrl }
      : {}),
    hasFoil: Boolean(
      cand.finishes?.some(
        (finish) => finish !== "normal" && finish !== "sealed",
      ),
    ),
    label: cand.title?.trim()
      ? `${setCode} · ${card} — ${cand.title.trim()}`
      : `${setCode} · ${card}`,
    ...(cand.title?.trim() ? { name: cand.title.trim() } : {}),
    ...(cand.rarity?.trim() ? { rarity: cand.rarity.trim() } : {}),
    ...(cand.printed === false ? { printed: false } : {}),
    missingArt: !(cand.imageUrl || cand.thumbnailUrl),
    kind: "face",
  };
}

export { loadNarutoCardsIndexFromSqlite };

/**
 * Single Carddass enumeration — same pool as checklist / shelf.
 *
 * FR uses per-set {@link listNarutoSetPrints} (set-scoped + unions).
 * Other locales use one catalogueBrowse search (no FR paper checklist).
 */
export function enumerateNarutoSetPrints(opts?: {
  includeUnprinted?: boolean;
}): CatalogueCardRow[] {
  const includeUnprinted = opts?.includeUnprinted !== false;
  const stamp = browseStamp();
  if (
    enumCache &&
    enumCache.stamp === stamp &&
    enumCache.includeUnprinted === includeUnprinted
  ) {
    return enumCache.rows;
  }

  const locales =
    cataloguePackInfo(NARUTO_PACK_ID)?.catalogueLocales ??
    (["fr", "en", "it", "ja"] as const);
  const byKeyLang = new Map<string, CatalogueCardRow>();

  const remember = (cand: PrintCandidate, fallbackSet: string) => {
    const row = candidateToRow(cand, fallbackSet);
    const key = `${row.printKey}\0${row.lang}`;
    if (!byKeyLang.has(key)) byKeyLang.set(key, row);
  };

  for (const lang of locales) {
    if (lang === "fr") {
      for (const set of listNarutoPrintSets("fr")) {
        for (const cand of listNarutoSetPrints({
          setId: set.id,
          language: "fr",
          includeUnprinted,
        })) {
          remember(cand, set.id);
        }
      }
      continue;
    }
    for (const cand of searchNarutoPrints("", {
      language: lang,
      limit: 5000,
      catalogueBrowse: true,
      includeUnprinted,
    })) {
      remember(cand, cand.setCode?.trim() || "—");
    }
  }

  const rows = [...byKeyLang.values()];
  enumCache = { stamp, includeUnprinted, rows };
  return rows;
}

/**
 * Merge checklist identity with presentation rows (borrow URLs, collapse).
 * Faces outside the enum are dropped; enum faces missing presentation become
 * shells.
 */
function alignBrowseToSetPrintEnum(
  presentation: CatalogueCardRow[],
): CatalogueCardRow[] {
  const enumFaces = enumerateNarutoSetPrints({ includeUnprinted: true });
  const enumByKey = new Map(
    enumFaces.map((row) => [`${row.printKey}\0${row.lang}`, row] as const),
  );
  const presentationByKey = new Map(
    presentation
      .filter((row) => !row.kind || row.kind === "face")
      .map((row) => [`${row.printKey}\0${row.lang}`, row] as const),
  );
  const backs = presentation.filter(
    (row) => row.kind === "pack-back" || row.kind === "set-back",
  );

  const faces: CatalogueCardRow[] = [];
  for (const [key, identity] of enumByKey) {
    const presented = presentationByKey.get(key);
    if (presented) {
      if (identity.printed === false) {
        faces.push({ ...presented, printed: false });
      } else {
        const { printed: _drop, ...rest } = presented;
        faces.push(rest);
      }
      continue;
    }
    faces.push(identity);
  }
  return [...backs, ...faces];
}

export function buildCarddassCatalogueBrowseRows(): CatalogueCardRow[] | null {
  const stamp = browseStamp();
  if (cache && cache.stamp === stamp) return cache.rows;

  const index = loadNarutoCardsIndexFromSqlite(NARUTO_PACK_ID);
  if (!index || Object.keys(index.cards).length === 0) return null;

  const presentation = buildCatalogueCardRows(NARUTO_PACK_ID, index);
  const rows = alignBrowseToSetPrintEnum(presentation);
  cache = { stamp, rows };
  return rows;
}

export function clearCarddassCatalogueBrowseCache(): void {
  cache = null;
  enumCache = null;
}
