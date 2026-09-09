/**
 * Crawl api.narutodb.com → Kayou checklist + missing per-card backs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";

import {
  buildKayouOfficialCardBackManifest,
  kayouOfficialCardBackManifestPath,
  readKayouOfficialCardBackManifest,
  resetKayouOfficialCardBackManifestCache,
  type KayouOfficialCardBackEntry,
} from "./kayouOfficialCardBacks";
import { kayouOfficialIdSlug } from "./kayouOfficialId";
import type { KayouChecklist } from "./kayouLedgerTypes";
import {
  buildNarutodbKayouChecklist,
  narutodbBackUrlForCard,
  narutodbSetCardsApiUrl,
  narutodbSetsApiUrl,
  parseNarutodbCardsJson,
  parseNarutodbSetsJson,
  type NarutodbCardListRow,
  type NarutodbSet,
} from "./narutodbParse";
import { narutoKayouCuratedDir } from "./pack";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export const NARUTODB_CHECKLIST_FILE = "narutodb-kayou-checklist.json";

export function narutodbChecklistPath(): string {
  return path.join(narutoKayouCuratedDir(), "sources", NARUTODB_CHECKLIST_FILE);
}

export function readNarutodbChecklist(): KayouChecklist | null {
  try {
    return JSON.parse(
      readFileSync(narutodbChecklistPath(), "utf8"),
    ) as KayouChecklist;
  } catch {
    return null;
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await httpGet(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    responseType: "json",
    timeout: 60_000,
  });
  return (res as { data?: unknown }).data;
}

async function downloadPng(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet(url, {
      headers: {
        "User-Agent": UA,
        Referer: "https://narutodb.com/",
        Accept: "image/png,*/*",
      },
      responseType: "arraybuffer",
      timeout: 60_000,
      validateStatus: (s) => s === 200,
    });
    const buf = Buffer.from((res as { data: ArrayBuffer }).data);
    return buf.byteLength > 500 ? buf : null;
  } catch {
    return null;
  }
}

export async function crawlNarutodbKayouChecklist(opts?: {
  onProgress?: (message: string) => void;
}): Promise<{
  checklist: KayouChecklist;
  sets: number;
  cards: number;
  changed: boolean;
}> {
  const report =
    opts?.onProgress ?? ((m: string) => console.log(`   narutodb — ${m}`));
  report("sets…");
  const sets = parseNarutodbSetsJson(await fetchJson(narutodbSetsApiUrl()));
  const cardsBySet: Record<string, NarutodbCardListRow[]> = {};
  let cards = 0;
  for (const set of sets) {
    report(`set ${set.id} (${set.name})…`);
    const rows = parseNarutodbCardsJson(
      await fetchJson(narutodbSetCardsApiUrl(set.id)),
    );
    cardsBySet[set.id] = rows;
    cards += rows.length;
  }
  const observed = new Date().toISOString().slice(0, 10);
  const checklist = buildNarutodbKayouChecklist({
    sets,
    cardsBySet,
    observed,
  });
  const dest = narutodbChecklistPath();
  mkdirSync(path.dirname(dest), { recursive: true });
  const next = `${JSON.stringify(checklist, null, 2)}\n`;
  let changed = true;
  if (existsSync(dest)) {
    changed = readFileSync(dest, "utf8") !== next;
  }
  if (changed) writeFileSync(dest, next);
  return {
    checklist,
    sets: checklist.sets.length,
    cards: checklist.sets.reduce((n, s) => n + s.cards.length, 0),
    changed,
  };
}

/**
 * Download character backs for codes missing from curated `official/`.
 * Merges into `kayou-official-card-backs.json` (same stamp path as official).
 */
export async function harvestNarutodbMissingCardBacks(opts?: {
  force?: boolean;
  curatedCardsDir?: string;
  onProgress?: (message: string) => void;
  /** Prefer live crawl rows; else re-read checklist + CDN pattern. */
  cardsBySet?: Readonly<Record<string, readonly NarutodbCardListRow[]>>;
  sets?: readonly NarutodbSet[];
}): Promise<{
  probed: number;
  installed: number;
  skipped: number;
  fail: number;
}> {
  const report =
    opts?.onProgress ?? ((m: string) => console.log(`   narutodb backs — ${m}`));
  const cardsDir =
    opts?.curatedCardsDir ?? path.join(narutoKayouCuratedDir(), "cards");
  const officialDir = path.join(cardsDir, "official");
  mkdirSync(officialDir, { recursive: true });

  let cardsBySet = opts?.cardsBySet;
  if (!cardsBySet) {
    const sets = parseNarutodbSetsJson(await fetchJson(narutodbSetsApiUrl()));
    const map: Record<string, NarutodbCardListRow[]> = {};
    for (const set of sets) {
      map[set.id] = parseNarutodbCardsJson(
        await fetchJson(narutodbSetCardsApiUrl(set.id)),
      );
    }
    cardsBySet = map;
  }

  const rows = Object.values(cardsBySet).flat();
  const existingManifest = readKayouOfficialCardBackManifest();
  const merged = new Map<string, KayouOfficialCardBackEntry>(
    Object.entries(existingManifest?.cards ?? {}).map(([slug, entry]) => [
      slug,
      entry,
    ]),
  );

  let installed = 0;
  let skipped = 0;
  let fail = 0;
  let probed = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    probed += 1;
    const slug = kayouOfficialIdSlug(row.card_number);
    const dest = path.join(officialDir, `${slug}.png`);
    const backUrl = narutodbBackUrlForCard(row);
    const entry: KayouOfficialCardBackEntry = {
      idCode: row.card_number,
      url: backUrl,
      seriesId: `narutodb:${row.set_id}`,
      rarity: row.rarity_code?.trim() || "",
    };

    if (!opts?.force && existsSync(dest)) {
      skipped += 1;
      if (!merged.has(slug)) merged.set(slug, entry);
      continue;
    }

    const buf = await downloadPng(backUrl);
    if (!buf) {
      fail += 1;
      continue;
    }
    writeFileSync(dest, buf);
    merged.set(slug, entry);
    installed += 1;

    if ((i + 1) % 50 === 0 || i + 1 === rows.length) {
      report(
        `${i + 1}/${rows.length} (${installed} new, ${skipped} skip, ${fail} miss)`,
      );
    }
  }

  const observed = new Date().toISOString().slice(0, 10);
  const manifest = buildKayouOfficialCardBackManifest([...merged.values()], {
    observed,
    seriesIds: [...new Set([...merged.values()].map((e) => e.seriesId))],
  });
  manifest.source =
    "kayouofficial.com + narutodb.com — per-card backs (heterogeneous tiers)";
  writeFileSync(
    kayouOfficialCardBackManifestPath(),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  resetKayouOfficialCardBackManifestCache();

  return { probed, installed, skipped, fail };
}

export async function runNarutodbKayouCrawl(opts?: {
  force?: boolean;
  skipBacks?: boolean;
  onProgress?: (message: string) => void;
}): Promise<{
  checklist: { sets: number; cards: number; changed: boolean };
  backs: { probed: number; installed: number; skipped: number; fail: number };
}> {
  const crawled = await crawlNarutodbKayouChecklist({
    onProgress: opts?.onProgress,
  });
  // Re-fetch card maps for backs (checklist alone drops back URLs).
  const sets = parseNarutodbSetsJson(await fetchJson(narutodbSetsApiUrl()));
  const cardsBySet: Record<string, NarutodbCardListRow[]> = {};
  for (const set of sets) {
    cardsBySet[set.id] = parseNarutodbCardsJson(
      await fetchJson(narutodbSetCardsApiUrl(set.id)),
    );
  }
  const backs = opts?.skipBacks
    ? { probed: 0, installed: 0, skipped: 0, fail: 0 }
    : await harvestNarutodbMissingCardBacks({
        force: opts?.force,
        cardsBySet,
        sets,
        onProgress: opts?.onProgress
          ? (m) => opts.onProgress!(`backs — ${m}`)
          : undefined,
      });
  return {
    checklist: {
      sets: crawled.sets,
      cards: crawled.cards,
      changed: crawled.changed,
    },
    backs,
  };
}
