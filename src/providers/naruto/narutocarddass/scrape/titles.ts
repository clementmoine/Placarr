/**
 * Naruto Carddass listing-title scrapers — eBay / Suruga resolve + Suruga merge.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { flareSolverrRequestGet } from "@/lib/http/flareSolverr";
import { dataRoot } from "@/lib/runtimeData";
import {
  ebayBrowseItemId,
  fetchEbayBrowseItem,
} from "@/providers/commerce/ebay/browseItem";
import type { EbayBrowseItem } from "@/providers/commerce/ebay/browseItem";

import { NARUTO_PACK_ID } from "../identity";
import {
  parseSurugaCarddassListingsTsv,
  parseSurugaCarddassPrinted,
  surugaCarddassProductUrl,
} from "../parse/marketplace";

// ─── eBay listing titles ───────────────────────────────────────────────────

export type EbayResolvedListing = {
  legacyItemId: string;
  ok: boolean;
  title: string | null;
  itemWebUrl: string | null;
  imageUrls: string[];
};

export async function resolveEbayListingTitles(
  legacyIds: readonly string[],
  opts: { root?: string; outFile?: string } = {},
): Promise<{ resolved: EbayResolvedListing[]; file: string }> {
  const outFile =
    opts.outFile ??
    path.join(
      opts.root ?? dataRoot(),
      NARUTO_PACK_ID,
      "staging",
      "ebay-it-2026-08-31",
      "resolved-listings.json",
    );
  mkdirSync(path.dirname(outFile), { recursive: true });

  const resolved: EbayResolvedListing[] = [];
  for (const legacyId of legacyIds) {
    const item: EbayBrowseItem | null = await fetchEbayBrowseItem(
      ebayBrowseItemId(legacyId),
      { marketplaceId: "EBAY_IT" },
    ).catch(() => null);
    resolved.push({
      legacyItemId: legacyId,
      ok: item !== null,
      title: item?.title ?? null,
      itemWebUrl: item?.itemWebUrl ?? null,
      imageUrls: item?.imageUrls ?? [],
    });
    writeFileSync(outFile, `${JSON.stringify(resolved, null, 2)}\n`, "utf8");
    console.log(
      `${resolved.length}/${legacyIds.length} ${legacyId} -> ${item?.title?.slice(0, 80) ?? "(échec)"}`,
    );
  }
  return { resolved, file: outFile };
}

// ─── Suruga listing titles ─────────────────────────────────────────────────

export type SurugaResolvedListing = {
  id: string;
  url: string;
  title: string | null;
  printed: string | null;
};

const TITLE_RE = /<title>([^<]+)<\/title>/;
const DATA_CARDDASS_RE = /データカードダス|\bDN-|\bNM-/i;

export async function resolveSurugaListingTitles(
  ids: readonly string[],
  opts: { root?: string; outFile?: string } = {},
): Promise<{ resolved: SurugaResolvedListing[]; file: string }> {
  const outFile =
    opts.outFile ??
    path.join(
      opts.root ?? dataRoot(),
      NARUTO_PACK_ID,
      "staging",
      "suruga-ya-carddass",
      "resolved-titles.json",
    );
  mkdirSync(path.dirname(outFile), { recursive: true });

  const resolved: SurugaResolvedListing[] = [];
  for (const id of ids) {
    const url = surugaCarddassProductUrl(id);
    const html = await flareSolverrRequestGet(url);
    const title = html ? (TITLE_RE.exec(html)?.[1] ?? null) : null;
    const printed =
      title && !DATA_CARDDASS_RE.test(title)
        ? parseSurugaCarddassPrinted(title)
        : null;
    resolved.push({ id, url, title, printed });
    // Checkpoint après chaque fiche : un arrêt ne perd rien.
    writeFileSync(outFile, `${JSON.stringify(resolved, null, 2)}\n`, "utf8");
    console.log(
      `${resolved.length}/${ids.length} ${id} -> ${printed ?? "∅"} ${title?.slice(0, 60) ?? "(403?)"}`,
    );
  }
  return { resolved, file: outFile };
}

// ─── merge Suruga resolved titles into curated TSV ─────────────────────────

const TSV = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../curated/sources/suruga-ya-carddass-listings.tsv",
);

export function mergeSurugaResolvedTitles(opts: { root?: string } = {}): {
  added: SurugaResolvedListing[];
  alreadyKnown: number;
  unresolved: SurugaResolvedListing[];
  tsv: string;
} {
  const staging = path.join(
    opts.root ?? dataRoot(),
    NARUTO_PACK_ID,
    "staging",
    "suruga-ya-carddass",
    "resolved-titles.json",
  );
  const resolved = JSON.parse(
    readFileSync(staging, "utf8"),
  ) as SurugaResolvedListing[];

  const tsv = readFileSync(TSV, "utf8");
  const known = new Set(parseSurugaCarddassListingsTsv(tsv).map((r) => r.id));

  const added: SurugaResolvedListing[] = [];
  const unresolved: SurugaResolvedListing[] = [];
  let alreadyKnown = 0;
  const seen = new Set<string>();
  for (const row of resolved) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    if (!row.printed) {
      unresolved.push(row);
      continue;
    }
    if (known.has(row.id)) {
      alreadyKnown += 1;
      continue;
    }
    added.push(row);
  }

  if (added.length) {
    const lines = added.map((row) => `${row.id}\t${row.printed}`).join("\n");
    writeFileSync(TSV, `${tsv.trimEnd()}\n${lines}\n`, "utf8");
  }
  return { added, alreadyKnown, unresolved, tsv: TSV };
}

// ─── CLI ───────────────────────────────────────────────────────────────────

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  const mode = process.argv[2];
  if (mode === "ebay") {
    const file = process.argv[3];
    if (!file) {
      console.error("usage: tsx scrape/titles.ts ebay <ids.txt>");
      process.exit(1);
    }
    const ids = [
      ...new Set(
        readFileSync(file, "utf8")
          .split(/\r?\n/)
          .map((line) => /(\d{9,})/.exec(line.trim())?.[1])
          .filter((v): v is string => Boolean(v)),
      ),
    ];
    console.log(`${ids.length} annonces à résoudre`);
    resolveEbayListingTitles(ids).catch((error) => {
      console.error(error);
      process.exit(1);
    });
  } else if (mode === "suruga") {
    const file = process.argv[3];
    if (!file) {
      console.error("usage: tsx scrape/titles.ts suruga <ids.txt>");
      process.exit(1);
    }
    const ids = [
      ...new Set(
        readFileSync(file, "utf8")
          .split(/\r?\n/)
          .map((line) => /([A-Z0-9]{8,})/i.exec(line.trim())?.[1])
          .filter((v): v is string => Boolean(v))
          .map((id) => id.toUpperCase()),
      ),
    ];
    console.log(`${ids.length} ids à résoudre`);
    resolveSurugaListingTitles(ids).catch((error) => {
      console.error(error);
      process.exit(1);
    });
  } else if (mode === "merge" || mode === undefined) {
    const report = mergeSurugaResolvedTitles();
    console.log(
      JSON.stringify(
        {
          added: report.added.length,
          alreadyKnown: report.alreadyKnown,
          unresolved: report.unresolved.length,
        },
        null,
        1,
      ),
    );
    for (const row of report.unresolved) {
      console.log(`NON-CARDDASS ${row.id} — ${row.title ?? "(403)"}`);
    }
  } else {
    console.error("usage: tsx scrape/titles.ts [ebay|suruga|merge] …");
    process.exit(1);
  }
}
