/**
 * Harvest dbzcollection « Pouvoir caché » for part4+ listings.
 * Durable ledger — used to stamp singleton groupings (`-kaio` / `-main`…).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { packStagingDir } from "@/lib/packPaths";
import {
  DBZC_DEFAULT_DELAY_MS,
  dbzcCardInfoUrl,
  fetchDbzcText,
} from "@/providers/dragonball/shared/dbzcollection/site";

import { parseDbzcCardDetail } from "../parse/dbzcollection";
import { DBS_JCC_PACK_ID, dbsJccCuratedDir } from "../pack";
import { normalizeGrouping, parseDbsjccNumber } from "../printKey";
import { powerToGroupingSlug } from "../scrape/dbzcollection";

export type DbzcollectionPouvoirRow = {
  setCode: string;
  cardId: string;
  printed: string;
  number: string;
  pouvoirCache: string;
  grouping: string;
};

const PARTS_WITH_SCOUTER = new Set([
  "part4",
  "part5",
  "part6",
  "part7",
  "part8",
  "part9",
  "part10",
]);

export function dbsJccDbzcollectionPouvoirsPath(): string {
  return path.join(
    dbsJccCuratedDir(),
    "sources",
    "dbzcollection-pouvoirs.json",
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadNames(): Array<{
  setCode: string;
  cardId: string;
  printed: string;
  number: string;
}> {
  const p = path.join(dbsJccCuratedDir(), "sources", "dbzcollection-names.json");
  if (!existsSync(p)) return [];
  const raw = JSON.parse(readFileSync(p, "utf8")) as {
    names?: Array<{
      setCode: string;
      cardId: string;
      printed: string;
      number: string;
    }>;
  };
  return (raw.names ?? []).filter((row) => PARTS_WITH_SCOUTER.has(row.setCode));
}

export async function harvestDbzcollectionPouvoirs(opts?: {
  delayMs?: number;
  force?: boolean;
  limit?: number;
}): Promise<{
  listed: number;
  withPouvoir: number;
  path: string;
}> {
  const delayMs = opts?.delayMs ?? DBZC_DEFAULT_DELAY_MS;
  const outPath = dbsJccDbzcollectionPouvoirsPath();
  mkdirSync(path.dirname(outPath), { recursive: true });
  const staging = path.join(
    packStagingDir(DBS_JCC_PACK_ID),
    "dbzcollection-pouvoirs",
  );
  mkdirSync(staging, { recursive: true });

  const prev = new Map<string, DbzcollectionPouvoirRow>();
  if (!opts?.force && existsSync(outPath)) {
    try {
      const raw = JSON.parse(readFileSync(outPath, "utf8")) as {
        pouvoirs?: DbzcollectionPouvoirRow[];
      };
      for (const row of raw.pouvoirs ?? []) {
        prev.set(row.cardId, row);
      }
    } catch {
      /* start fresh */
    }
  }

  const names = loadNames().slice(0, opts?.limit);
  const out = new Map<string, DbzcollectionPouvoirRow>(prev);

  for (const name of names) {
    if (!opts?.force && out.has(name.cardId)) continue;
    const detailDest = path.join(staging, `detail_${name.cardId}.json`);
    let detailHtml: string | null = null;
    if (!opts?.force && existsSync(detailDest)) {
      try {
        const cached = JSON.parse(readFileSync(detailDest, "utf8")) as {
          html?: string;
          pouvoirCache?: string | null;
          printed?: string | null;
        };
        if (cached.html) detailHtml = cached.html;
        else if (cached.pouvoirCache != null || "pouvoirCache" in cached) {
          // Structured cache from a prior run.
          const number =
            parseDbsjccNumber(cached.printed ?? name.printed) ?? name.number;
          const pc = cached.pouvoirCache?.trim() || null;
          if (!pc) continue;
          const grouping = normalizeGrouping(powerToGroupingSlug(pc));
          if (!grouping) continue;
          out.set(name.cardId, {
            setCode: name.setCode,
            cardId: name.cardId,
            printed: (cached.printed ?? name.printed).trim().toUpperCase(),
            number,
            pouvoirCache: pc,
            grouping,
          });
          continue;
        }
      } catch {
        detailHtml = null;
      }
    }
    if (!detailHtml) {
      detailHtml = await fetchDbzcText(dbzcCardInfoUrl(name.cardId), {
        minLength: 50,
      });
      if (delayMs > 0) await sleep(delayMs);
      if (!detailHtml) continue;
      writeFileSync(
        detailDest,
        `${JSON.stringify({ html: detailHtml }, null, 2)}\n`,
        "utf8",
      );
    }
    const detail = parseDbzcCardDetail(detailHtml, name.cardId);
    const pc = detail.pouvoirCache?.trim() || null;
    // Rewrite structured cache for faster resume next time.
    writeFileSync(
      detailDest,
      `${JSON.stringify(
        {
          cardId: name.cardId,
          printed: detail.printed,
          pouvoirCache: pc,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    if (!pc) continue;
    const number =
      parseDbsjccNumber(detail.printed ?? name.printed) ?? name.number;
    const grouping = normalizeGrouping(powerToGroupingSlug(pc));
    if (!grouping) continue;
    out.set(name.cardId, {
      setCode: name.setCode,
      cardId: name.cardId,
      printed: (detail.printed ?? name.printed).trim().toUpperCase(),
      number,
      pouvoirCache: pc,
      grouping,
    });
  }

  const pouvoirs = [...out.values()].sort(
    (a, b) =>
      a.setCode.localeCompare(b.setCode) || a.number.localeCompare(b.number),
  );
  writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        source: "dbzcollection.fr — Pouvoir caché (part4+)",
        lang: "fr",
        observed: new Date().toISOString().slice(0, 10),
        note: "Grouping slug from pouvoirCache. Singletons keep the slug too.",
        pouvoirs,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return { listed: names.length, withPouvoir: pouvoirs.length, path: outPath };
}
