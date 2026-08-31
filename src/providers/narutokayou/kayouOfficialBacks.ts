/**
 * Harvest Naruto tier backs from kayouofficial.com (attested `backImage` JSON).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";

import { kayouBackTierSlug } from "./kayouBackTier";
import {
  buildKayouOfficialCardBackManifest,
  resetKayouOfficialCardBackManifestCache,
  type KayouOfficialCardBackEntry,
} from "./kayouOfficialCardBacks";
import {
  readKayouOfficialCatalog,
  type KayouOfficialCatalog,
} from "./kayouOfficialCrawl";
import { kayouOfficialIdSlug } from "./kayouOfficialId";
import {
  KAYOU_OFFICIAL_IP_COLLECTIONS,
  KAYOU_OFFICIAL_SERIES_URL,
  parseKayouOfficialSeriesCards,
  parseNarutoKayouSeriesIds,
} from "./kayouOfficialParse";
import { narutoKayouCuratedDir } from "./pack";

export {
  parseKayouOfficialSeriesCards,
  parseNarutoKayouSeriesIds,
} from "./kayouOfficialParse";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type KayouOfficialCardBack = {
  idCode: string;
  rarity: string;
  backImage: string;
  seriesId: string;
};

export type KayouTierBackPick = {
  tier: string;
  url: string;
  votes: number;
  seriesIds: string[];
  conflict: boolean;
};

export function catalogToKayouOfficialCardBacks(
  catalog: KayouOfficialCatalog,
): KayouOfficialCardBack[] {
  return catalog.series.flatMap((series) =>
    series.cards.map((card) => ({
      idCode: card.idCode,
      rarity: card.rarity,
      backImage: card.backImage,
      seriesId: series.seriesId,
    })),
  );
}

export function pickKayouTierBacks(
  rows: readonly KayouOfficialCardBack[],
): KayouTierBackPick[] {
  const byTier = new Map<
    string,
    Map<string, { votes: number; seriesIds: Set<string> }>
  >();
  for (const row of rows) {
    const tier = kayouBackTierSlug(row.rarity);
    if (!tier) continue;
    let urlMap = byTier.get(tier);
    if (!urlMap) {
      urlMap = new Map();
      byTier.set(tier, urlMap);
    }
    let bucket = urlMap.get(row.backImage);
    if (!bucket) {
      bucket = { votes: 0, seriesIds: new Set() };
      urlMap.set(row.backImage, bucket);
    }
    bucket.votes += 1;
    bucket.seriesIds.add(row.seriesId);
  }

  const picks: KayouTierBackPick[] = [];
  for (const [tier, urlMap] of byTier) {
    const ranked = [...urlMap.entries()].sort((a, b) => b[1].votes - a[1].votes);
    const [url, meta] = ranked[0]!;
    picks.push({
      tier,
      url,
      votes: meta.votes,
      seriesIds: [...meta.seriesIds].sort(),
      conflict: ranked.length > 1,
    });
  }
  return picks.sort((a, b) => a.tier.localeCompare(b.tier));
}

/**
 * Cards whose tier shares **multiple** distinct backs within one series
 * (Earth Scroll UR, Heaven Scroll AR… — like DBSCG awakened versos).
 */
export function listKayouPerCardBackRows(
  rows: readonly KayouOfficialCardBack[],
): KayouOfficialCardBack[] {
  const bySeriesTier = new Map<string, KayouOfficialCardBack[]>();
  for (const row of rows) {
    const tier = kayouBackTierSlug(row.rarity) ?? row.rarity.trim().toLowerCase();
    const key = `${row.seriesId}|${tier}`;
    const list = bySeriesTier.get(key) ?? [];
    list.push(row);
    bySeriesTier.set(key, list);
  }
  const out: KayouOfficialCardBack[] = [];
  for (const group of bySeriesTier.values()) {
    const uniqueBacks = new Set(group.map((row) => row.backImage));
    if (uniqueBacks.size > 1) out.push(...group);
  }
  return out;
}

async function fetchText(url: string): Promise<string> {
  const res = await httpGet<string>(url, {
    headers: { "User-Agent": UA },
    responseType: "text",
    timeout: 45_000,
    validateStatus: (status) => status === 200,
  });
  return res.data;
}

async function downloadPng(url: string): Promise<Buffer | null> {
  try {
    const res = await httpGet<ArrayBuffer>(url, {
      headers: { "User-Agent": UA, Referer: KAYOU_OFFICIAL_IP_COLLECTIONS },
      responseType: "arraybuffer",
      timeout: 60_000,
      validateStatus: (status) => status === 200,
    });
    const buf = Buffer.from(res.data);
    return buf.byteLength > 500 ? buf : null;
  } catch {
    return null;
  }
}

export type KayouOfficialBackHarvest = {
  series: number;
  cards: number;
  tiers: number;
  installed: number;
  skipped: number;
  conflicts: number;
  fail: number;
  perCard: number;
  perCardInstalled: number;
  perCardSkipped: number;
  perCardFail: number;
};

export async function harvestKayouOfficialTierBacks(opts: {
  force?: boolean;
  curatedCardsDir?: string;
  onProgress?: (message: string) => void;
  catalog?: KayouOfficialCatalog | null;
} = {}): Promise<KayouOfficialBackHarvest> {
  const report = opts.onProgress ?? ((m: string) => console.log(`   kayou backs — ${m}`));
  const cardsDir =
    opts.curatedCardsDir ?? path.join(narutoKayouCuratedDir(), "cards");
  mkdirSync(cardsDir, { recursive: true });

  const catalog = opts.catalog ?? readKayouOfficialCatalog();
  let allRows: KayouOfficialCardBack[];
  let seriesIds: string[];

  if (catalog?.series.length) {
    report(`catalogue manifest (${catalog.series.length} séries)…`);
    seriesIds = catalog.series.map((row) => row.seriesId);
    allRows = catalogToKayouOfficialCardBacks(catalog);
  } else {
    report("index IP Naruto (live)…");
    const ipHtml = await fetchText(KAYOU_OFFICIAL_IP_COLLECTIONS);
    seriesIds = parseNarutoKayouSeriesIds(ipHtml);
    allRows = [];
    for (const seriesId of seriesIds) {
      report(`série ${seriesId}…`);
      const html = await fetchText(KAYOU_OFFICIAL_SERIES_URL(seriesId));
      for (const row of parseKayouOfficialSeriesCards(html)) {
        allRows.push({
          idCode: row.idCode,
          rarity: row.rarity,
          backImage: row.backImage,
          seriesId,
        });
      }
    }
  }

  const picks = pickKayouTierBacks(allRows);
  const manifest = {
    source: "kayouofficial.com — Naruto IP tier backs",
    observed: new Date().toISOString().slice(0, 10),
    seriesIds,
    picks: picks.map((p) => ({
      tier: p.tier,
      url: p.url,
      votes: p.votes,
      seriesIds: p.seriesIds,
      conflict: p.conflict,
    })),
  };
  writeFileSync(
    path.join(narutoKayouCuratedDir(), "sources", "kayou-official-tier-backs.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  let installed = 0;
  let skipped = 0;
  let fail = 0;
  const conflicts = picks.filter((p) => p.conflict).length;

  for (const pick of picks) {
    const dest = path.join(cardsDir, `back.${pick.tier}.png`);
    if (!opts.force && existsSync(dest)) {
      skipped += 1;
      continue;
    }
    const buf = await downloadPng(pick.url);
    if (!buf) {
      fail += 1;
      report(`manqué back.${pick.tier}.png`);
      continue;
    }
    writeFileSync(dest, buf);
    installed += 1;
    if (pick.conflict) {
      report(
        `back.${pick.tier}.png — conflit inter-séries, URL majoritaire (${pick.votes} cartes)`,
      );
    }
  }

  // Legacy single pack tile: alias R tier when present.
  const rDest = path.join(cardsDir, "back.r.png");
  const legacyDest = path.join(cardsDir, "back.png");
  if (existsSync(rDest) && (opts.force || !existsSync(legacyDest))) {
    writeFileSync(legacyDest, readFileSync(rDest));
  }

  const perCardRows = listKayouPerCardBackRows(allRows);
  const officialDir = path.join(cardsDir, "official");
  mkdirSync(officialDir, { recursive: true });
  const cardEntries: KayouOfficialCardBackEntry[] = [];
  let perCardInstalled = 0;
  let perCardSkipped = 0;
  let perCardFail = 0;

  for (const row of perCardRows) {
    const slug = kayouOfficialIdSlug(row.idCode);
    const dest = path.join(officialDir, `${slug}.png`);
    cardEntries.push({
      idCode: row.idCode,
      url: row.backImage,
      seriesId: row.seriesId,
      rarity: row.rarity,
    });
    if (!opts.force && existsSync(dest)) {
      perCardSkipped += 1;
      continue;
    }
    const buf = await downloadPng(row.backImage);
    if (!buf) {
      perCardFail += 1;
      report(`manqué official/${slug}.png (${row.idCode})`);
      continue;
    }
    writeFileSync(dest, buf);
    perCardInstalled += 1;
  }

  const observed = new Date().toISOString().slice(0, 10);
  const cardManifest = buildKayouOfficialCardBackManifest(cardEntries, {
    observed,
    seriesIds,
  });
  writeFileSync(
    path.join(narutoKayouCuratedDir(), "sources", "kayou-official-card-backs.json"),
    `${JSON.stringify(cardManifest, null, 2)}\n`,
  );
  resetKayouOfficialCardBackManifestCache();

  return {
    series: seriesIds.length,
    cards: allRows.length,
    tiers: picks.length,
    installed,
    skipped,
    conflicts,
    fail,
    perCard: perCardRows.length,
    perCardInstalled,
    perCardSkipped,
    perCardFail,
  };
}

/** True when curated tier PNG is older than the manifest (re-harvest hint). */
export function kayouOfficialBacksStale(curatedCardsDir: string): boolean {
  const manifestPath = path.join(
    narutoKayouCuratedDir(),
    "sources",
    "kayou-official-tier-backs.json",
  );
  if (!existsSync(manifestPath)) return true;
  const manifestMtime = statSync(manifestPath).mtimeMs;
  for (const name of ["back.r.png", "back.ur.png"]) {
    const p = path.join(curatedCardsDir, name);
    if (existsSync(p) && statSync(p).mtimeMs < manifestMtime) return true;
  }
  return false;
}
