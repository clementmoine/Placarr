/**
 * Scrape Naruto CACG FR faces from Wayback (carddass.fr) → data/naruto/.
 *
 *   pnpm naruto:cards
 *   pnpm naruto:cards -- --force
 *   pnpm naruto:cards -- --limit 20
 *   pnpm naruto:cards -- --cdx-only
 *   pnpm naruto:cards -- --cards-only
 *   pnpm naruto:cards -- --index-only   # rebuild sqlite from disk
 */
import fs from "node:fs";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";
import { buildPrintKey } from "@/core/identify/printKey";

import {
  exportNarutoCardsIndexJson,
  NARUTO_PACK_ID,
  writeNarutoCcgIndex,
  type NarutoAssetRow,
  type NarutoPrintRow,
} from "./indexStore";
import {
  loadMangaNewsTitleHitsFromCache,
  titlesForPrints,
} from "./mangaNewsTitles";
import { materializeTinBoxPromos, TIN_BOX_PROMOS } from "./tinBoxPromos";
import { mergeAttestedPromos } from "./attestedPromos";
import {
  mergeCarteSemaineIntoIndex,
  writeCarteSemaineReport,
} from "./carteSemaine";
import { applyOfficialNames, loadOfficialNames } from "./officialNames";
import { ensureNarutoChecklistLayout } from "./buildCoverageChecklist";
import {
  medThumbRank,
  parseCarddassAssetPath,
  parseCarddassMedThumbFilename,
  carddassFaceFilename,
  faceArtRank,
  pickPreferredFaceArtFilename,
  waybackRawUrl,
  type ParsedCarddassAsset,
} from "./parseCarddassAsset";
import { cardTypeFromCollectorNumber } from "./parseBandaicgAsset";

const CDX_URL =
  "https://web.archive.org/cdx/search/cdx?url=www.carddass.fr/naruto/images/*&output=json&fl=timestamp,original,mimetype,statuscode&filter=statuscode:200&collapse=urlkey&limit=20000";

const LANG = "fr";
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_DELAY_MS = 400;
/**
 * Raw carddass.fr material, mirroring the site's own paths under `images/`.
 * Siblings `pages/`, `pdf/` and `cdx.json` hold the rest of the FR corpus.
 */
export const NARUTO_STAGING_SITE = path.join("staging", "carddass-fr");

const IMAGE_MIME =
  /^(image\/(jpeg|jpg|png|gif|webp)|application\/octet-stream)$/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i;

export type ScrapeNarutoOptions = {
  force?: boolean;
  limit?: number;
  cdxOnly?: boolean;
  indexOnly?: boolean;
  /** Skip non-card site mirror (packshots, promo collages, chrome). */
  cardsOnly?: boolean;
  concurrency?: number;
  delayMs?: number;
  root?: string;
};

type CdxHit = {
  timestamp: string;
  original: string;
  parsed: ParsedCarddassAsset;
};

type SiteHit = {
  timestamp: string;
  original: string;
  /** Path under `staging/carddass-fr/` (e.g. images/cartes/promo/…). */
  relPath: string;
  kind: "promo_misc" | "thumb_med" | "packshot" | "chrome" | "other";
};

function stagingSiteDir(root: string): string {
  return path.join(root, NARUTO_STAGING_SITE);
}

/**
 * Legacy `data/naruto/site/` and `staging/carddass-site/` → `staging/carddass-fr/`.
 */
export function ensureNarutoStagingSiteLayout(root: string): void {
  const legacy = path.join(root, "site");
  const staged = stagingSiteDir(root);
  if (!fs.existsSync(legacy)) {
    fs.mkdirSync(staged, { recursive: true });
    return;
  }
  if (!fs.existsSync(staged)) {
    fs.mkdirSync(path.dirname(staged), { recursive: true });
    fs.renameSync(legacy, staged);
    return;
  }
  // Both exist: merge legacy into staging then drop legacy.
  const walk = (from: string, to: string) => {
    fs.mkdirSync(to, { recursive: true });
    for (const name of fs.readdirSync(from)) {
      if (name === ".DS_Store") continue;
      const src = path.join(from, name);
      const dest = path.join(to, name);
      const st = fs.statSync(src);
      if (st.isDirectory()) {
        walk(src, dest);
        continue;
      }
      if (!fs.existsSync(dest)) fs.renameSync(src, dest);
    }
  };
  walk(legacy, staged);
  fs.rmSync(legacy, { recursive: true, force: true });
}

function packRoot(root?: string): string {
  return path.join(root ?? dataRoot(), NARUTO_PACK_ID);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Collapse http://host:80/… and casing so CDX duplicates do not double-download. */
export function canonicalizeCarddassUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.port === "80" || u.port === "443") u.port = "";
    u.hash = "";
    return u.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function siteRelPathFromOriginal(original: string): string | null {
  try {
    const u = new URL(original);
    const lower = u.pathname.toLowerCase();
    const idx = lower.indexOf("/naruto/");
    if (idx < 0) return null;
    let rel = decodeURIComponent(u.pathname.slice(idx + "/naruto/".length));
    rel = rel.split("?")[0] ?? rel;
    if (!rel || rel.endsWith("/")) return null;
    if (!IMAGE_EXT.test(rel)) return null;
    return rel.replace(/^\/+/, "");
  } catch {
    return null;
  }
}

function classifySiteRel(rel: string): SiteHit["kind"] {
  const low = rel.toLowerCase();
  if (low.includes("/cartes_med/")) return "thumb_med";
  if (low.includes("/packshots/")) return "packshot";
  if (low.includes("/cartes/promo/")) return "promo_misc";
  if (low.includes("/cartes/")) return "other";
  return "chrome";
}

type CdxSweep = {
  cards: CdxHit[];
  site: SiteHit[];
  cdxRows: number;
  imageRows: number;
};

async function fetchCdxSweep(): Promise<CdxSweep> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const started = Date.now();
    console.log(
      `CDX fetch attempt ${attempt}/5 (Wayback index — often 20–90s, no cards yet)…`,
    );
    const heartbeat = setInterval(() => {
      const s = Math.round((Date.now() - started) / 1000);
      console.log(`CDX still waiting… ${s}s (attempt ${attempt}/5)`);
    }, 10_000);
    if (typeof heartbeat.unref === "function") heartbeat.unref();
    try {
      const response = await fetch(CDX_URL, {
        headers: { "user-agent": "PlacarrNarutoScrape/1.0 (local collection)" },
      });
      console.log(
        `CDX HTTP ${response.status} in ${Math.round((Date.now() - started) / 1000)}s — parsing JSON…`,
      );
      if (!response.ok) {
        throw new Error(`CDX HTTP ${response.status}`);
      }
      const raw = (await response.json()) as string[][];
      console.log(`CDX JSON rows=${raw.length} — classifying images…`);
      const sweep = parseCdxRows(raw);
      console.log(
        `CDX done in ${Math.round((Date.now() - started) / 1000)}s → cards=${sweep.cards.length} siteExtras=${sweep.site.length}`,
      );
      return sweep;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const wait = attempt * 2_000;
      console.warn(
        `CDX attempt ${attempt}/5 failed: ${lastError.message} — retry in ${wait}ms`,
      );
      await sleep(wait);
    } finally {
      clearInterval(heartbeat);
    }
  }
  throw lastError ?? new Error("CDX failed");
}

function parseCdxRows(raw: string[][]): CdxSweep {
  const byCanon = new Map<
    string,
    { timestamp: string; original: string; mimetype: string }
  >();

  let cdxRows = 0;
  for (const row of raw) {
    if (!row[0] || row[0] === "timestamp") continue;
    cdxRows += 1;
    const timestamp = row[0]!;
    const original = row[1]!;
    const mimetype = (row[2] || "").toLowerCase();
    if (!original) continue;
    const looksImage =
      IMAGE_MIME.test(mimetype) || IMAGE_EXT.test(original.split("?")[0] ?? "");
    if (!looksImage) continue;
    // Directory / query index pages sometimes mislabeled — skip non-files.
    if (/\/(\?|$)/.test(original) && !IMAGE_EXT.test(original)) continue;

    const canon = canonicalizeCarddassUrl(original);
    const prev = byCanon.get(canon);
    if (!prev || timestamp > prev.timestamp) {
      byCanon.set(canon, { timestamp, original, mimetype });
    }
  }

  const cards: CdxHit[] = [];
  const site: SiteHit[] = [];
  const seenCardKey = new Map<string, CdxHit>();

  for (const { timestamp, original } of byCanon.values()) {
    const parsed = parseCarddassAssetPath(original);
    if (parsed) {
      // Art and back are distinct files for the same printKey.
      const roleKey = `${parsed.printKey}:${parsed.role}`;
      const existing = seenCardKey.get(roleKey);
      if (!existing || timestamp > existing.timestamp) {
        seenCardKey.set(roleKey, { timestamp, original, parsed });
      }
      continue;
    }
    const relPath = siteRelPathFromOriginal(original);
    if (!relPath) continue;
    site.push({
      timestamp,
      original,
      relPath,
      kind: classifySiteRel(relPath),
    });
  }

  for (const hit of seenCardKey.values()) cards.push(hit);
  cards.sort((a, b) => {
    const k = a.parsed.printKey.localeCompare(b.parsed.printKey);
    if (k !== 0) return k;
    return a.parsed.role.localeCompare(b.parsed.role);
  });
  site.sort((a, b) => a.relPath.localeCompare(b.relPath));

  return {
    cards,
    site,
    cdxRows,
    imageRows: byCanon.size,
  };
}

export async function downloadRaw(
  url: string,
  destPath: string,
  skipExisting: boolean,
): Promise<"ok" | "skip" | "fail"> {
  if (skipExisting && fs.existsSync(destPath)) return "skip";
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "PlacarrNarutoScrape/1.0 (local collection)" },
      redirect: "follow",
    });
    if (!response.ok) return "fail";
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.byteLength < 100) return "fail";
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
    const tmp = `${destPath}.tmp`;
    await fs.promises.writeFile(tmp, buf);
    await fs.promises.rename(tmp, destPath);
    return "ok";
  } catch {
    return "fail";
  }
}

export async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  delayMs: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length || 1) },
    async () => {
      while (i < items.length) {
        const idx = i;
        i += 1;
        await worker(items[idx]!);
        if (delayMs > 0) await sleep(delayMs);
      }
    },
  );
  await Promise.all(runners);
}

function extFromUrl(url: string): string {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (ext === ".jpeg") return ".jpg";
    if ([".jpg", ".png", ".webp", ".gif"].includes(ext)) return ext;
  } catch {
    /* ignore */
  }
  return ".jpg";
}

/**
 * Legacy mis-map: carddass `-vc` (version corrigée) was saved as `back.jpg`.
 * Rename to `art.corrected.jpg` — these are faces with errata text, not versos.
 */
export function migrateNarutoVcBacksToCorrectedArt(root: string): number {
  const cardsDir = path.join(root, "cards");
  if (!fs.existsSync(cardsDir)) return 0;
  let moved = 0;
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      if (name === ".DS_Store") continue;
      const abs = path.join(dir, name);
      const st = fs.statSync(abs);
      if (st.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!/^back\.(jpe?g|png|webp)$/i.test(name)) continue;
      const ext =
        path.extname(name).toLowerCase() === ".jpeg"
          ? ".jpg"
          : path.extname(name).toLowerCase();
      const dest = path.join(
        dir,
        `art.corrected${ext === ".jpeg" ? ".jpg" : ext}`,
      );
      if (fs.existsSync(dest)) {
        fs.unlinkSync(abs);
        moved += 1;
        continue;
      }
      fs.renameSync(abs, dest);
      moved += 1;
    }
  };
  walk(cardsDir);
  return moved;
}

export function buildIndexFromDisk(root: string): {
  prints: NarutoPrintRow[];
  assets: NarutoAssetRow[];
} {
  const cardsDir = path.join(root, "cards");
  const prints = new Map<string, NarutoPrintRow>();
  const assets: NarutoAssetRow[] = [];

  if (!fs.existsSync(cardsDir)) {
    return { prints: [], assets: [] };
  }

  for (const set of fs.readdirSync(cardsDir)) {
    const setDir = path.join(cardsDir, set);
    if (!fs.statSync(setDir).isDirectory()) continue;
    for (const lang of fs.readdirSync(setDir)) {
      const langDir = path.join(setDir, lang);
      if (!fs.statSync(langDir).isDirectory()) continue;
      for (const cardId of fs.readdirSync(langDir)) {
        const cardDir = path.join(langDir, cardId);
        if (!fs.statSync(cardDir).isDirectory()) continue;
        const files = fs.readdirSync(cardDir);
        const art = pickPreferredFaceArtFilename(files);
        const thumb = files.find((f) =>
          /^thumb\.(jpe?g|png|webp|gif)$/i.test(f),
        );
        if (!art && !thumb) continue;

        // cardId = ni023, ni023-cdf, or EN n001 / pr018b
        const [numberPart, ...groupParts] = cardId.split("-");
        const number = numberPart!;
        const grouping = groupParts.length ? groupParts.join("-") : null;
        const cardType = cardTypeFromCollectorNumber(number);
        const printKey = buildPrintKey({
          game: "naruto",
          set,
          number,
          grouping,
        });
        if (!printKey) continue;

        prints.set(printKey, {
          printKey,
          setCode: set,
          number,
          cardType,
          grouping,
        });
        assets.push({
          printKey,
          lang,
          art: art ?? null,
          thumb: thumb ?? null,
          back: null,
        });
      }
    }
  }

  return { prints: [...prints.values()], assets };
}

function assetMapKey(printKey: string, lang: string): string {
  return `${printKey}\0${lang}`;
}

/**
 * Collector numbers that already have a real `thumb.jpg` under `cards/`.
 * Used to skip re-fetching `cartes_med` that were previously moved into the
 * catalogue (move empties staging → next scrape would otherwise re-download).
 */
export function collectorNumbersWithThumb(root: string): Set<string> {
  const cardsDir = path.join(root, "cards");
  const out = new Set<string>();
  if (!fs.existsSync(cardsDir)) return out;
  for (const set of fs.readdirSync(cardsDir)) {
    const setDir = path.join(cardsDir, set);
    if (!fs.statSync(setDir).isDirectory()) continue;
    for (const lang of fs.readdirSync(setDir)) {
      const langDir = path.join(setDir, lang);
      if (!fs.statSync(langDir).isDirectory()) continue;
      for (const cardId of fs.readdirSync(langDir)) {
        const thumb = path.join(langDir, cardId, "thumb.jpg");
        try {
          if (!fs.statSync(thumb).isFile()) continue;
        } catch {
          continue;
        }
        const m = /^(ni|te|ta|cl|pr)\d+/i.exec(cardId);
        if (m) out.add(m[0]!.toLowerCase());
      }
    }
  }
  return out;
}

/**
 * Staging rel-paths for tin faces already installed under `cards/promo`.
 * Skip re-mirroring those bytes on the next scrape (they were moved out).
 */
export function installedTinStagingPaths(root: string): Set<string> {
  const out = new Set<string>();
  const cards = path.join(root, "cards", "promo", "fr");
  for (const promo of TIN_BOX_PROMOS) {
    if (!fs.existsSync(path.join(cards, promo.cardId, "art.jpg"))) continue;
    out.add(promo.artFrom);
    if (promo.thumbFrom) out.add(promo.thumbFrom);
  }
  return out;
}

/**
 * Move `staging/carddass-fr/images/cartes/cartes_med/*` into card folders as real
 * `thumb.jpg`. Rule: used → `cards/` only; unused stays in staging so leftovers
 * are inspectable. All med variants for a mapped number leave staging.
 * If every target already has `thumb.jpg`, only clean staging (no rewrite).
 */
export function mapSiteMedThumbsOntoAssets(
  root: string,
  prints: readonly NarutoPrintRow[],
  assets: NarutoAssetRow[],
): number {
  ensureNarutoStagingSiteLayout(root);
  const medDir = path.join(
    stagingSiteDir(root),
    "images",
    "cartes",
    "cartes_med",
  );
  const cardsDir = path.join(root, "cards");
  if (!fs.existsSync(medDir) || !fs.existsSync(cardsDir)) return 0;

  /** All staging med files per collector number (best rank first). */
  const filesByNumber = new Map<string, { abs: string; rank: number }[]>();
  for (const name of fs.readdirSync(medDir)) {
    const parsed = parseCarddassMedThumbFilename(name);
    if (!parsed) continue;
    const abs = path.join(medDir, name);
    const rank = medThumbRank(name);
    const list = filesByNumber.get(parsed.number) ?? [];
    list.push({ abs, rank });
    filesByNumber.set(parsed.number, list);
  }
  for (const list of filesByNumber.values()) {
    list.sort((a, b) => b.rank - a.rank);
  }

  const printByKey = new Map(prints.map((p) => [p.printKey, p] as const));
  const assetsByNumber = new Map<string, NarutoAssetRow[]>();
  for (const asset of assets) {
    const print = printByKey.get(asset.printKey);
    if (!print) continue;
    if (!filesByNumber.has(print.number)) continue;
    const list = assetsByNumber.get(print.number) ?? [];
    list.push(asset);
    assetsByNumber.set(print.number, list);
  }

  let mapped = 0;
  for (const [number, files] of filesByNumber) {
    const hit = files[0];
    if (!hit) continue;
    const targets = assetsByNumber.get(number) ?? [];
    if (targets.length === 0) continue;

    const destPaths: string[] = [];
    const setCodes = new Set<string>();
    for (const asset of targets) {
      const print = printByKey.get(asset.printKey)!;
      const cardId = print.grouping
        ? `${print.number}-${print.grouping}`
        : print.number;
      const cardDir = path.join(cardsDir, print.setCode, asset.lang, cardId);
      if (!fs.existsSync(cardDir)) continue;
      setCodes.add(print.setCode);
      destPaths.push(path.join(cardDir, "thumb.jpg"));
    }
    if (destPaths.length === 0) continue;

    // One site med per collector number must not paint both retail and promo:
    // they share NI/TE/TA but different faces (PROMO mark / shurikens). Prefer
    // retail folders; promo thumbs come from the promo art (fixThumbs).
    const medDestPaths =
      setCodes.size > 1
        ? destPaths.filter((dest) => {
            const rel = path.relative(cardsDir, path.dirname(dest));
            const setCode = rel.split(path.sep)[0];
            return setCode !== "promo";
          })
        : destPaths;
    if (medDestPaths.length === 0) continue;

    const allHaveThumb = medDestPaths.every((dest) => {
      try {
        return fs.statSync(dest).isFile();
      } catch {
        return false;
      }
    });

    if (!allHaveThumb) {
      // Drop prior symlinks / stale thumbs so we install real bytes.
      for (const dest of medDestPaths) {
        try {
          const st = fs.lstatSync(dest);
          if (st.isSymbolicLink() || st.isFile()) fs.unlinkSync(dest);
        } catch {
          /* none */
        }
        for (const name of fs.readdirSync(path.dirname(dest))) {
          if (
            !/^thumb_.*Conflict\./i.test(name) &&
            !/^thumb_MB-/i.test(name)
          ) {
            continue;
          }
          try {
            fs.unlinkSync(path.join(path.dirname(dest), name));
          } catch {
            /* */
          }
        }
      }

      const writeReal = (from: string, to: string) => {
        const tmp = `${to}.tmp`;
        fs.copyFileSync(from, tmp);
        fs.renameSync(tmp, to);
      };
      try {
        for (const dest of medDestPaths) writeReal(hit.abs, dest);
      } catch {
        continue;
      }
    }

    // Used → cards only: remove every staging med for this number.
    for (const file of files) {
      try {
        fs.unlinkSync(file.abs);
      } catch {
        /* already gone */
      }
    }
    for (const asset of targets) {
      const print = printByKey.get(asset.printKey)!;
      const cardId = print.grouping
        ? `${print.number}-${print.grouping}`
        : print.number;
      const dest = path.join(
        cardsDir,
        print.setCode,
        asset.lang,
        cardId,
        "thumb.jpg",
      );
      const gotMed = medDestPaths.includes(dest);
      let hasFile = false;
      try {
        hasFile = fs.statSync(dest).isFile();
      } catch {
        /* */
      }
      if (!gotMed && !hasFile) continue;
      asset.thumb = "thumb.jpg";
      mapped += 1;
    }
  }
  return mapped;
}

/**
 * Community cache first (it covers Série 06 and the promos, which no official
 * checklist ever named), then official names overlaid on top.
 */
function titlesForNarutoPrints(prints: NarutoPrintRow[]) {
  const hits = loadMangaNewsTitleHitsFromCache();
  const titles = titlesForPrints(prints, hits);
  const byKey = new Map(titles.map((t) => [t.printKey, t]));
  for (const promo of TIN_BOX_PROMOS) {
    const print = prints.find(
      (p) => p.setCode === "promo" && p.number === promo.cardId,
    );
    if (!print) continue;
    if (byKey.has(print.printKey)) continue;
    titles.push({
      printKey: print.printKey,
      lang: "fr",
      fullName: promo.name,
      rarity: "promo",
    });
  }
  const official = loadOfficialNames();
  const merged = applyOfficialNames(prints, titles, official);
  if (official.size) {
    console.log(
      `── titles: ${merged.replaced} renommés / ${merged.added} ajoutés depuis les noms officiels (${official.size} connus)`,
    );
  }
  return merged.titles;
}

export async function scrapeNarutoCards(
  options: ScrapeNarutoOptions = {},
): Promise<void> {
  const root = packRoot(options.root);
  const cardsDir = path.join(root, "cards");
  const logsDir = path.join(root, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  ensureNarutoStagingSiteLayout(root);
  ensureNarutoChecklistLayout();

  if (options.indexOnly) {
    const migratedVc = migrateNarutoVcBacksToCorrectedArt(root);
    const tinPromos = materializeTinBoxPromos(root);
    const { prints, assets } = buildIndexFromDisk(root);
    const thumbMapped = mapSiteMedThumbsOntoAssets(root, prints, assets);
    const baseTitles = titlesForNarutoPrints(prints);
    const withPromos = mergeAttestedPromos({ prints, titles: baseTitles });
    const carteSemaine = writeCarteSemaineReport(root);
    const merged = mergeCarteSemaineIntoIndex({
      prints: withPromos.prints,
      titles: withPromos.titles,
      report: carteSemaine,
      root,
    });
    const { dbPath, printCount } = writeNarutoCcgIndex({
      prints: merged.prints,
      titles: merged.titles,
      assets,
      dbPath: path.join(root, "catalog.sqlite"),
      meta: {
        source: "disk",
        titleSource:
          "carddass-official + manga-news-cache + attested-promos + carte-semaine",
        titleCount: String(merged.titles.length),
        thumbMapped: String(thumbMapped),
        tinPromos: tinPromos.installed.join(","),
        attestedPromosAdded: String(withPromos.addedPrints.length),
        carteSemaineNamed: String(merged.named.length),
        carteSemaineAdded: String(merged.addedPrints.length),
        migratedVcBacks: String(migratedVc),
      },
    });
    const indexPath = path.join(root, "cards-index.json");
    exportNarutoCardsIndexJson(
      merged.prints,
      assets,
      indexPath,
      merged.titles,
    );
    console.log(
      JSON.stringify(
        {
          indexOnly: true,
          printCount,
          titleCount: merged.titles.length,
          thumbMapped,
          migratedVc,
          tinPromos,
          attestedPromosAdded: withPromos.addedPrints.length,
          carteSemaineNamed: merged.named.length,
          carteSemaineAdded: merged.addedPrints.length,
          dbPath,
          indexPath,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log("── CDX Wayback carddass.fr/naruto/images (all image/*)");
  const sweep = await fetchCdxSweep();
  let hits = sweep.cards;
  let siteHits = sweep.site;
  console.log(
    `CDX rows=${sweep.cdxRows} images=${sweep.imageRows} cards=${hits.length} siteExtras=${siteHits.length}`,
  );

  if (options.limit && options.limit > 0) {
    hits = hits.slice(0, options.limit);
    siteHits = siteHits.slice(0, options.limit);
    console.log(`limited cards=${hits.length} site=${siteHits.length}`);
  }

  fs.writeFileSync(
    path.join(logsDir, "cdx-hits.json"),
    `${JSON.stringify(
      {
        cards: hits.map((h) => ({
          printKey: h.parsed.printKey,
          original: h.original,
          timestamp: h.timestamp,
          role: h.parsed.role,
        })),
        site: siteHits.map((h) => ({
          relPath: h.relPath,
          original: h.original,
          timestamp: h.timestamp,
          kind: h.kind,
        })),
        cdxRows: sweep.cdxRows,
        imageRows: sweep.imageRows,
      },
      null,
      2,
    )}\n`,
  );

  if (options.cdxOnly) {
    const byKind: Record<string, number> = {};
    for (const h of siteHits) byKind[h.kind] = (byKind[h.kind] ?? 0) + 1;
    console.log(
      JSON.stringify(
        {
          cdxOnly: true,
          cards: hits.length,
          siteExtras: siteHits.length,
          siteByKind: byKind,
          cdxRows: sweep.cdxRows,
          imageRows: sweep.imageRows,
        },
        null,
        2,
      ),
    );
    return;
  }

  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const force = options.force ?? false;

  console.log(
    `── download cards (${hits.length}) concurrency=${concurrency} delayMs=${delayMs}${force ? " force" : ""}`,
  );

  let ok = 0;
  let skip = 0;
  let fail = 0;
  let doneHits = 0;
  const totalHits = hits.length;
  // ~every 2% (min every 10) so Logs stay lively during long scrapes / skip-passes.
  const progressEvery = Math.max(10, Math.floor(totalHits / 50) || 1);

  const prints = new Map<string, NarutoPrintRow>();
  const assetsByKey = new Map<string, NarutoAssetRow>();

  await runPool(hits, concurrency, delayMs, async (hit) => {
    const { parsed, timestamp, original } = hit;
    const ext = extFromUrl(original);
    const destName = carddassFaceFilename(parsed.role, ext);
    const dest = path.join(cardsDir, parsed.set, LANG, parsed.cardId, destName);
    const url = waybackRawUrl(timestamp, original);
    const result = await downloadRaw(url, dest, !force);
    if (result === "ok") ok += 1;
    else if (result === "skip") skip += 1;
    else fail += 1;

    doneHits += 1;
    if (
      doneHits === 1 ||
      doneHits === totalHits ||
      doneHits % progressEvery === 0 ||
      result === "fail"
    ) {
      console.log(
        `cards ${doneHits}/${totalHits} (ok=${ok} skip=${skip} fail=${fail}) · ${parsed.printKey}${result === "fail" ? " FAIL" : ""}`,
      );
    }

    if (result === "fail") return;

    prints.set(parsed.printKey, {
      printKey: parsed.printKey,
      setCode: parsed.set,
      number: parsed.number,
      cardType: parsed.type,
      grouping: parsed.grouping,
      sourceUrl: original,
    });

    const aKey = assetMapKey(parsed.printKey, LANG);
    const prev = assetsByKey.get(aKey) ?? {
      printKey: parsed.printKey,
      lang: LANG,
      art: null,
      back: null,
      sourceUrl: original,
      waybackTimestamp: timestamp,
    };
    // Prefer corrected face for the indexed `art` URL (served by catalogue).
    if (parsed.role === "corrected") {
      prev.art = destName;
    } else if (!prev.art || !/\.corrected\./i.test(prev.art)) {
      prev.art = destName;
    }
    prev.sourceUrl = original;
    prev.waybackTimestamp = timestamp;
    assetsByKey.set(aKey, prev);
  });

  console.log(`── cards pass done (ok=${ok} skip=${skip} fail=${fail})`);

  let siteOk = 0;
  let siteSkip = 0;
  let siteFail = 0;
  let siteMappedSkip = 0;
  if (!options.cardsOnly && siteHits.length > 0) {
    const siteDir = stagingSiteDir(root);
    const thumbsReady = force
      ? new Set<string>()
      : collectorNumbersWithThumb(root);
    const tinReady = force ? new Set<string>() : installedTinStagingPaths(root);
    console.log(
      `── staging mirror (${siteHits.length} extras → data/naruto/${NARUTO_STAGING_SITE}/)`,
    );
    let siteDone = 0;
    const siteEvery = Math.max(5, Math.floor(siteHits.length / 20) || 1);
    await runPool(siteHits, concurrency, delayMs, async (hit) => {
      // Already moved into cards/ on a prior run — don't re-fetch into staging.
      if (!force && hit.kind === "thumb_med") {
        const med = parseCarddassMedThumbFilename(path.basename(hit.relPath));
        if (med && thumbsReady.has(med.number)) {
          siteMappedSkip += 1;
          siteSkip += 1;
          siteDone += 1;
          return;
        }
      }
      if (!force && tinReady.has(hit.relPath)) {
        siteMappedSkip += 1;
        siteSkip += 1;
        siteDone += 1;
        return;
      }

      const dest = path.join(siteDir, ...hit.relPath.split("/"));
      const url = waybackRawUrl(hit.timestamp, hit.original);
      const result = await downloadRaw(url, dest, !force);
      if (result === "ok") siteOk += 1;
      else if (result === "skip") siteSkip += 1;
      else siteFail += 1;
      siteDone += 1;
      if (
        siteDone === 1 ||
        siteDone === siteHits.length ||
        siteDone % siteEvery === 0 ||
        result === "fail"
      ) {
        console.log(
          `site ${siteDone}/${siteHits.length} (ok=${siteOk} skip=${siteSkip} fail=${siteFail}) · ${hit.relPath}${result === "fail" ? " FAIL" : ""}`,
        );
      }
    });
    console.log(
      `── site pass done (ok=${siteOk} skip=${siteSkip} fail=${siteFail}${siteMappedSkip ? ` mappedSkip=${siteMappedSkip}` : ""})`,
    );
  } else if (options.cardsOnly) {
    console.log("── site mirror skipped (--cards-only)");
  }

  // Legacy: `-vc` was saved as back.jpg → art.corrected.jpg before indexing.
  const migratedVc = migrateNarutoVcBacksToCorrectedArt(root);

  // Merge disk for any pre-existing when not force-limited (keyed by print+lang).
  const fromDisk = buildIndexFromDisk(root);
  for (const p of fromDisk.prints) {
    if (!prints.has(p.printKey)) prints.set(p.printKey, p);
  }
  for (const a of fromDisk.assets) {
    const aKey = assetMapKey(a.printKey, a.lang);
    const prev = assetsByKey.get(aKey);
    if (!prev) {
      assetsByKey.set(aKey, a);
      continue;
    }
    // Disk may hold a face the scrape knows nothing about (a hand-made
    // `art.reconstructed.*`). Compare by rank so it is never demoted.
    if (a.art && (!prev.art || faceArtRank(a.art) > faceArtRank(prev.art))) {
      prev.art = a.art;
    }
    if (!prev.thumb && a.thumb) prev.thumb = a.thumb;
    if (!prev.back && a.back) prev.back = a.back;
  }

  const tinPromos = materializeTinBoxPromos(root);
  // Re-scan disk so PR folders appear in the index.
  const afterTin = buildIndexFromDisk(root);
  for (const p of afterTin.prints) {
    if (!prints.has(p.printKey)) prints.set(p.printKey, p);
  }
  for (const a of afterTin.assets) {
    const aKey = assetMapKey(a.printKey, a.lang);
    const prev = assetsByKey.get(aKey);
    if (!prev) {
      assetsByKey.set(aKey, a);
      continue;
    }
    if (a.art && (!prev.art || faceArtRank(a.art) > faceArtRank(prev.art))) {
      prev.art = a.art;
    }
    if (!prev.thumb && a.thumb) prev.thumb = a.thumb;
    if (!prev.back && a.back) prev.back = a.back;
  }

  const printList = [...prints.values()].sort((a, b) =>
    a.printKey.localeCompare(b.printKey),
  );
  const assetList = [...assetsByKey.values()];
  const thumbMapped = mapSiteMedThumbsOntoAssets(root, printList, assetList);

  console.log("── index catalog.sqlite + cards-index.json");
  const baseTitles = titlesForNarutoPrints(printList);
  const withPromos = mergeAttestedPromos({
    prints: printList,
    titles: baseTitles,
  });
  if (withPromos.addedPrints.length) {
    console.log(
      `── attested promos: ${withPromos.addedPrints.length} printKeys sans face encore`,
    );
  }
  const carteSemaine = writeCarteSemaineReport(root);
  const merged = mergeCarteSemaineIntoIndex({
    prints: withPromos.prints,
    titles: withPromos.titles,
    report: carteSemaine,
    root,
  });
  if (merged.named.length || merged.addedPrints.length) {
    console.log(
      `── carte-semaine: ${merged.named.length} titres, ${merged.addedPrints.length} stubs`,
    );
  }
  const { dbPath, printCount } = writeNarutoCcgIndex({
    prints: merged.prints,
    titles: merged.titles,
    assets: assetList,
    dbPath: path.join(root, "catalog.sqlite"),
    meta: {
      source: "wayback:carddass.fr",
      cdxHits: String(hits.length),
      siteExtras: String(siteHits.length),
      titleSource:
        "carddass-official + manga-news-cache + attested-promos + carte-semaine",
      titleCount: String(merged.titles.length),
      thumbMapped: String(thumbMapped),
      tinPromos: tinPromos.installed.join(","),
      attestedPromosAdded: String(withPromos.addedPrints.length),
      carteSemaineNamed: String(merged.named.length),
      carteSemaineAdded: String(merged.addedPrints.length),
      migratedVcBacks: String(migratedVc),
    },
  });
  const indexPath = path.join(root, "cards-index.json");
  exportNarutoCardsIndexJson(
    merged.prints,
    assetList,
    indexPath,
    merged.titles,
  );

  const siteByKind: Record<string, number> = {};
  for (const h of siteHits) siteByKind[h.kind] = (siteByKind[h.kind] ?? 0) + 1;

  const summary = {
    downloaded: ok,
    skipped: skip,
    failed: fail,
    printCount,
    titleCount: merged.titles.length,
    attestedPromosAdded: withPromos.addedPrints.length,
    carteSemaineNamed: merged.named.length,
    carteSemaineAdded: merged.addedPrints.length,
    thumbMapped,
    migratedVc,
    tinPromos,
    site: {
      downloaded: siteOk,
      skipped: siteSkip,
      failed: siteFail,
      mappedSkip: siteMappedSkip,
      extras: siteHits.length,
      byKind: siteByKind,
    },
    coverage: {
      cdxRows: sweep.cdxRows,
      imageRows: sweep.imageRows,
      cardAssets: hits.length,
      siteExtras: siteHits.length,
      note: "cardAssets = NI/TE/TA/CL under cards/; staging = leftovers only (unused med, packshots, chrome)",
    },
    dbPath,
    indexPath,
    cardsDir,
  };
  fs.writeFileSync(
    path.join(logsDir, "last-run.json"),
    `${JSON.stringify({ ...summary, at: new Date().toISOString() }, null, 2)}\n`,
  );
  console.log(JSON.stringify(summary, null, 2));
}
