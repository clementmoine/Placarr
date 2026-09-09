/**
 * Fold resolved Suruga-ya titles (staging/suruga-ya-carddass/resolved-titles.json)
 * into the curated listings TSV. Listings without a Carddass printed ref are
 * reported, never written — the harvest only reads the TSV.
 *
 * Run: pnpm tsx src/providers/narutocarddass/scrape/mergeSurugaResolvedTitles.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_PACK_ID } from "../packs";
import {
  parseSurugaCarddassListingsTsv,
  type SurugaCarddassListing,
} from "../parse/parseSurugaCarddass";

/** Staging row from `resolved-titles.json` — listing id + optional printed ref. */
export type SurugaResolvedListing = SurugaCarddassListing & {
  title?: string | null;
  printed?: string | null;
};

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

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
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
}
