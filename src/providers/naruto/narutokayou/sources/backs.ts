/**
 * Kayou card backs — official per-card, rarity tiers, stamp, harvest.
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

import { assetsCardUrl, assetsPackFileUrl } from "@/lib/packAssetUrls";
import { httpGet } from "@/lib/http/httpClient";
import {
  installDistinctBacks,
  type DistinctBackCandidate,
} from "@/providers/shared/cardCatalogue/discoverDistinctBacks";
import type { PrintCandidate } from "@/types/providerModule";

import {
  kayouOfficialIdSlug,
  kayouOfficialIdSuffixKeys,
  kayouOfficialLookupKeys,
} from "../identity";
import { NARUTO_KAYOU_PACK_ID, narutoKayouCuratedDir } from "../pack";
import {
  KAYOU_OFFICIAL_IP_COLLECTIONS,
  KAYOU_OFFICIAL_SERIES_URL,
  narutodbBackUrlForCard,
  narutodbSetCardsApiUrl,
  narutodbSetsApiUrl,
  parseKayouOfficialSeriesCards,
  parseNarutoKayouSeriesIds,
  parseNarutodbCardsJson,
  parseNarutodbSetsJson,
  type NarutodbCardListRow,
  type NarutodbSet,
} from "../parse/hosts";
import type { KayouOfficialCatalog } from "./crawl";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";


// ─── kayouOfficialCardBacks ───

/** Where the verso lives after hash classify (installOfficialCardBacks). */
export type KayouOfficialCardBackPlacement =
  | { kind: "default" }
  | { kind: "tier"; slug: string }
  | { kind: "print"; set: string; lang: string; card: string };

export type KayouOfficialCardBackEntry = {
  idCode: string;
  url: string;
  seriesId: string;
  rarity: string;
  placement?: KayouOfficialCardBackPlacement;
};

export type KayouOfficialCardBackManifest = {
  source: string;
  observed: string;
  cards: Record<string, KayouOfficialCardBackEntry>;
  /** Unambiguous `ur-015l3` → full slug when unique across the harvest. */
  suffix: Record<string, string>;
};

const MANIFEST = "kayou-official-card-backs.json";

let cached: KayouOfficialCardBackManifest | null | undefined;

export function kayouOfficialCardBackManifestPath(): string {
  return path.join(narutoKayouCuratedDir(), "sources", MANIFEST);
}

export function readKayouOfficialCardBackManifest():
  | KayouOfficialCardBackManifest
  | null {
  if (cached !== undefined) return cached;
  const manifestPath = kayouOfficialCardBackManifestPath();
  if (!existsSync(manifestPath)) {
    cached = null;
    return null;
  }
  try {
    cached = JSON.parse(
      readFileSync(manifestPath, "utf8"),
    ) as KayouOfficialCardBackManifest;
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

export function resetKayouOfficialCardBackManifestCache(): void {
  cached = undefined;
}

/** @internal test hook — never write the real curated manifest from unit tests. */
export function __setKayouOfficialCardBackManifestForTests(
  manifest: KayouOfficialCardBackManifest | null,
): void {
  cached = manifest;
}

export function buildKayouOfficialCardBackManifest(
  rows: readonly KayouOfficialCardBackEntry[],
  meta: { observed: string; seriesIds: readonly string[] },
): KayouOfficialCardBackManifest {
  const cards: Record<string, KayouOfficialCardBackEntry> = {};
  for (const row of rows) {
    const slug = kayouOfficialIdSlug(row.idCode);
    cards[slug] = row;
  }

  const suffixHits = new Map<string, Set<string>>();
  for (const slug of Object.keys(cards)) {
    const entry = cards[slug]!;
    for (const key of kayouOfficialIdSuffixKeys(entry.idCode)) {
      let set = suffixHits.get(key);
      if (!set) {
        set = new Set();
        suffixHits.set(key, set);
      }
      set.add(slug);
    }
  }

  const suffix: Record<string, string> = {};
  for (const [key, slugs] of suffixHits) {
    if (slugs.size === 1) suffix[key] = [...slugs][0]!;
  }

  return {
    source: "kayouofficial.com — Naruto per-card backs (heterogeneous tiers)",
    observed: meta.observed,
    cards,
    suffix,
  };
}

export function resolveKayouOfficialCardBackSlug(
  reference: string,
  rarity?: string | null,
): string | null {
  const manifest = readKayouOfficialCardBackManifest();
  if (!manifest) return null;

  for (const key of kayouOfficialLookupKeys(reference, rarity)) {
    if (manifest.cards[key]) return key;
    const viaSuffix = manifest.suffix[key];
    if (viaSuffix && manifest.cards[viaSuffix]) return viaSuffix;
  }
  return null;
}

/**
 * Resolve stamp URL from placement:
 * tier → pack `back.<slug>.webp`; print → card-local `back.webp`;
 * default → null (caller falls through to rarity / pack default).
 */
export function kayouCardBackUrlForOfficialReference(
  reference: string,
  rarity?: string | null,
): string | null {
  const slug = resolveKayouOfficialCardBackSlug(reference, rarity);
  if (!slug) return null;
  const manifest = readKayouOfficialCardBackManifest();
  const entry = manifest?.cards[slug];
  const placement = entry?.placement;
  if (!placement || placement.kind === "default") return null;
  if (placement.kind === "tier") {
    return assetsPackFileUrl(
      NARUTO_KAYOU_PACK_ID,
      "cards",
      `back.${placement.slug}.webp`,
    );
  }
  if (placement.kind === "print") {
    return assetsCardUrl(
      NARUTO_KAYOU_PACK_ID,
      {
        set: placement.set,
        lang: placement.lang,
        card: placement.card,
      },
      "back.webp",
    );
  }
  return null;
}

// ─── kayouBackTier ───

type KayouBackAliasFile = {
  aliases?: Record<string, string>;
  skippedDefault?: string[];
};

let aliasFileCache: KayouBackAliasFile | null = null;

function loadKayouBackAliasFile(): KayouBackAliasFile {
  if (aliasFileCache) return aliasFileCache;
  const p = path.join(
    narutoKayouCuratedDir(),
    "sources",
    "kayou-back-aliases.json",
  );
  if (!existsSync(p)) {
    aliasFileCache = {};
    return aliasFileCache;
  }
  try {
    aliasFileCache = JSON.parse(readFileSync(p, "utf8")) as KayouBackAliasFile;
  } catch {
    aliasFileCache = {};
  }
  return aliasFileCache;
}

/** Test helper — clear alias memo. */
export function resetKayouBackAliasCache(): void {
  aliasFileCache = null;
}

/** Printed rarity → filename slug (`◇XR` → `shin-xr`, `UR` → `ur`). */
export function kayouBackTierSlug(
  rarity: string | null | undefined,
): string | null {
  let raw = rarity?.trim().toUpperCase() ?? "";
  if (!raw) return null;
  raw = raw.replace(/\u25C7/g, "SHIN-").replace(/◇/g, "SHIN-");
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || null;
}

/** Resolve rarity → canonical sleeve slug (hash aliases / identity). */
export function kayouCanonicalBackSlug(
  rarity: string | null | undefined,
): string | null {
  const slug = kayouBackTierSlug(rarity);
  if (!slug) return null;
  const file = loadKayouBackAliasFile();
  const skipped = new Set(
    (file.skippedDefault ?? []).map((s) => s.toLowerCase()),
  );
  if (skipped.has(slug)) return null;
  return file.aliases?.[slug] ?? slug;
}

export function kayouCardBackUrlForRarity(
  packId: string,
  rarity: string | null | undefined,
): string | null {
  const slug = kayouCanonicalBackSlug(rarity);
  if (!slug) return null;
  return assetsPackFileUrl(packId, "cards", `back.${slug}.webp`);
}

// ─── kayouBack ───

/** Per-card official back when known, else tier sleeve `cards/back.<tier>.webp`. */
export function stampKayouBack(candidate: PrintCandidate): PrintCandidate {
  const perCard = kayouCardBackUrlForOfficialReference(
    candidate.reference,
    candidate.rarity,
  );
  const url =
    perCard ??
    kayouCardBackUrlForRarity(NARUTO_KAYOU_PACK_ID, candidate.rarity);
  if (!url) return candidate;
  return { ...candidate, cardBackUrl: url };
}

// ─── kayouOfficialBacks ───

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

  const catalog = opts.catalog ?? null;
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

// ─── narutodbCrawl (backs harvest) ───

async function narutodbFetchJson(url: string): Promise<unknown> {
  const res = await httpGet(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    responseType: "json",
    timeout: 60_000,
  });
  return (res as { data?: unknown }).data;
}

async function narutodbDownloadPng(url: string): Promise<Buffer | null> {
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
    const sets = parseNarutodbSetsJson(await narutodbFetchJson(narutodbSetsApiUrl()));
    const map: Record<string, NarutodbCardListRow[]> = {};
    for (const set of sets) {
      map[set.id] = parseNarutodbCardsJson(
        await narutodbFetchJson(narutodbSetCardsApiUrl(set.id)),
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

    const buf = await narutodbDownloadPng(backUrl);
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
  const { crawlNarutodbKayouChecklist } = await import("./crawl");
  const crawled = await crawlNarutodbKayouChecklist({
    onProgress: opts?.onProgress,
  });
  const sets = parseNarutodbSetsJson(await narutodbFetchJson(narutodbSetsApiUrl()));
  const cardsBySet: Record<string, NarutodbCardListRow[]> = {};
  for (const set of sets) {
    cardsBySet[set.id] = parseNarutodbCardsJson(
      await narutodbFetchJson(narutodbSetCardsApiUrl(set.id)),
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
