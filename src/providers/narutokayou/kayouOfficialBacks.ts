/**
 * Harvest Naruto tier backs from kayouofficial.com (attested `backImage` JSON).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import {
  installDistinctBacks,
  type DistinctBackCandidate,
} from "@/providers/shared/cardCatalogue/discoverDistinctBacks";

import { kayouBackTierSlug, resetKayouBackAliasCache } from "./kayouBackTier";
import {
  buildKayouOfficialCardBackManifest,
  readKayouOfficialCardBackManifest,
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
  /** After byte-hash collapse vs pack default. */
  deduped: {
    aliases: Record<string, string>;
    installed: string[];
    skippedDefault: string[];
  };
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

  let fail = 0;
  const urlConflicts = picks.filter((p) => p.conflict).length;
  const tierCandidates: DistinctBackCandidate[] = [];

  for (const pick of picks) {
    const buf = await downloadPng(pick.url);
    if (!buf) {
      fail += 1;
      report(`manqué CDN tier ${pick.tier}`);
      continue;
    }
    tierCandidates.push({ slug: pick.tier, bytes: buf });
  }

  // Pack default must exist before collapse (curated back.png / back.webp).
  const defaultPath = ["back.png", "back.webp"]
    .map((n) => path.join(cardsDir, n))
    .find((p) => existsSync(p));
  if (!defaultPath && tierCandidates.length > 0) {
    // Bootstrap: use majority R if present, else first tier.
    const r = tierCandidates.find((c) => c.slug === "r");
    const seed = r ?? tierCandidates[0]!;
    writeFileSync(path.join(cardsDir, "back.png"), seed.bytes);
    report(`bootstrap pack back.png depuis tier ${seed.slug}`);
  }

  const dedupedEarly = dedupeKayouCuratedTierBacks(cardsDir, tierCandidates);
  const aliasPairs = Object.entries(dedupedEarly.aliases)
    .filter(([from, to]) => from !== to)
    .map(([from, to]) => `${from}→${to}`);
  report(
    `hash — distinct [${dedupedEarly.installed.join(", ") || "—"}], =défaut [${dedupedEarly.skippedDefault.join(", ") || "—"}]${aliasPairs.length ? `, alias [${aliasPairs.join(", ")}]` : ""}${urlConflicts ? ` · ${urlConflicts} tier(s) multi-URL amont` : ""}`,
  );

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
  // Keep narutodb / prior per-card entries; official harvest only covers
  // heterogeneous tiers within the US store series list.
  const prior = readKayouOfficialCardBackManifest();
  const bySlug = new Map<string, KayouOfficialCardBackEntry>(
    Object.entries(prior?.cards ?? {}),
  );
  for (const row of cardEntries) {
    bySlug.set(kayouOfficialIdSlug(row.idCode), row);
  }
  const cardManifest = buildKayouOfficialCardBackManifest(
    [...bySlug.values()],
    {
      observed,
      seriesIds: [
        ...new Set([
          ...seriesIds,
          ...[...bySlug.values()].map((e) => e.seriesId),
        ]),
      ],
    },
  );
  if (prior?.source?.includes("narutodb")) {
    cardManifest.source = prior.source;
  }
  writeFileSync(
    path.join(narutoKayouCuratedDir(), "sources", "kayou-official-card-backs.json"),
    `${JSON.stringify(cardManifest, null, 2)}\n`,
  );
  resetKayouOfficialCardBackManifestCache();

  return {
    series: seriesIds.length,
    cards: allRows.length,
    tiers: picks.length,
    installed: dedupedEarly.installed.length,
    skipped: 0,
    conflicts: urlConflicts,
    fail,
    perCard: perCardRows.length,
    perCardInstalled,
    perCardSkipped,
    perCardFail,
    deduped: dedupedEarly,
  };
}

/**
 * Collapse byte-identical tier sleeves; drop those matching pack `back.png`.
 * Writes `kayou-back-aliases.json` for stamp lookup.
 */
export function dedupeKayouCuratedTierBacks(
  cardsDir: string,
  freshCandidates?: readonly DistinctBackCandidate[],
): {
  aliases: Record<string, string>;
  installed: string[];
  skippedDefault: string[];
} {
  const candidates: DistinctBackCandidate[] = [...(freshCandidates ?? [])];
  if (!existsSync(cardsDir)) {
    return { aliases: {}, installed: [], skippedDefault: [] };
  }
  if (!freshCandidates?.length) {
    for (const name of readdirSync(cardsDir)) {
      const m = /^back\.([a-z0-9][a-z0-9-]*)\.(png|webp)$/i.exec(name);
      if (!m) continue;
      const slug = m[1]!.toLowerCase();
      candidates.push({
        slug,
        bytes: readFileSync(path.join(cardsDir, name)),
      });
    }
  }
  const defaultPath = ["back.png", "back.webp"]
    .map((n) => path.join(cardsDir, n))
    .find((p) => existsSync(p));
  const defaultBytes = defaultPath ? readFileSync(defaultPath) : null;
  const result = installDistinctBacks(candidates, {
    cardsDir,
    defaultBytes,
    ext: "png",
    force: true,
    pruneDefaultDuplicates: true,
  });
  writeFileSync(
    path.join(narutoKayouCuratedDir(), "sources", "kayou-back-aliases.json"),
    `${JSON.stringify(
      {
        source: "kayouofficial tier back hash collapse",
        observed: new Date().toISOString().slice(0, 10),
        aliases: result.aliases,
        skippedDefault: result.skippedDefault,
      },
      null,
      2,
    )}\n`,
  );
  resetKayouBackAliasCache();
  return {
    aliases: result.aliases,
    installed: result.installed,
    skippedDefault: result.skippedDefault,
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
