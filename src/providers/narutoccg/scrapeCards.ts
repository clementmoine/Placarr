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

import {
  exportNarutoCardsIndexJson,
  NARUTO_PACK_ID,
  writeNarutoCcgIndex,
  type NarutoAssetRow,
  type NarutoPrintRow,
} from "./indexStore";
import { NARUTO_EN_PACK_ID } from "./packs";
import { hinokunianJaNames } from "./scrapeHinokunian";
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
import { mergeFoundCatalogueLedgers } from "./mergeAttestedLedgers";
import { mergeColekaS6ItIntoIndex } from "./scrapeColekaS6It";
import { mergeColekaUsPromosIntoIndex } from "./colekaUsPromos";
import { loadColekaCcgFrLedgers } from "./scrapeColekaStorm3";
import { loadStorm3Ledger } from "./scrapeStorm3";
import { ensureNarutoChecklistLayout } from "./buildCoverageChecklist";
import { ensureNarutoCuratedAssets } from "./installReconstructed";
import {
  ALT_LINE_DISK_PREFIXES,
  isNarutoFamilyFolder,
  mintNarutoPrintKey,
  narutoDiskCardId,
  narutoLedgerNumber,
  narutoNumbersEqual,
  parseNarutoCollector,
} from "./collectorIdentity";
import { foldUnsourcedNarutoArt } from "./foldUnsourcedNarutoArt";
import {
  migrateNarutoCardLayout,
  upsertNarutoAppearances,
} from "./migrateCardLayout";
import {
  NARUTO_FACE_DECISION_FILE,
  narutoFaceSourceOf,
  parseNarutoFaceDecision,
} from "./faceChoice";
import { promoteAllNarutoFaces, promoteNarutoFace } from "./narutoFaceBytes";
import { narutoCardAbsDir, listNarutoCardDirs } from "./narutoCardDisk";
import { isNarutoLangPrinted, preferNarutoAppearanceSet } from "./printed";
import { normalizeNarutoLang } from "./narutoCardPath";
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
  /** live Wayback / last cdx-hits.json / archive.org down with nothing cached. */
  source?: "live" | "cache" | "unavailable";
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
      return { ...sweep, source: "live" as const };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const wait = attempt * 2_000;
      console.warn(
        `CDX attempt ${attempt}/5 failed: ${lastError.message} — retry in ${wait}ms`,
      );
      if (attempt < 5) await sleep(wait);
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

const SITE_KINDS = new Set<SiteHit["kind"]>([
  "promo_misc",
  "thumb_med",
  "packshot",
  "chrome",
  "other",
]);

/** Rebuild a sweep from `logs/cdx-hits.json` when archive.org CDX is down. */
export function cdxSweepFromHitsLog(raw: unknown): CdxSweep | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = raw as {
    cards?: unknown;
    site?: unknown;
    cdxRows?: unknown;
    imageRows?: unknown;
  };
  if (!Array.isArray(doc.cards) && !Array.isArray(doc.site)) return null;
  const cards: CdxHit[] = [];
  for (const row of Array.isArray(doc.cards) ? doc.cards : []) {
    if (!row || typeof row !== "object") continue;
    const hit = row as { original?: unknown; timestamp?: unknown };
    const original = typeof hit.original === "string" ? hit.original : "";
    const timestamp = typeof hit.timestamp === "string" ? hit.timestamp : "";
    if (!original || !timestamp) continue;
    const parsed = parseCarddassAssetPath(original);
    if (!parsed) continue;
    cards.push({ timestamp, original, parsed });
  }
  const site: SiteHit[] = [];
  for (const row of Array.isArray(doc.site) ? doc.site : []) {
    if (!row || typeof row !== "object") continue;
    const hit = row as {
      original?: unknown;
      timestamp?: unknown;
      relPath?: unknown;
      kind?: unknown;
    };
    const original = typeof hit.original === "string" ? hit.original : "";
    const timestamp = typeof hit.timestamp === "string" ? hit.timestamp : "";
    const relPath = typeof hit.relPath === "string" ? hit.relPath : "";
    const kind = SITE_KINDS.has(hit.kind as SiteHit["kind"])
      ? (hit.kind as SiteHit["kind"])
      : null;
    if (!original || !timestamp || !relPath || !kind) continue;
    site.push({ timestamp, original, relPath, kind });
  }
  if (cards.length === 0 && site.length === 0) return null;
  return {
    cards,
    site,
    cdxRows:
      typeof doc.cdxRows === "number"
        ? doc.cdxRows
        : cards.length + site.length,
    imageRows:
      typeof doc.imageRows === "number"
        ? doc.imageRows
        : cards.length + site.length,
    source: "cache",
  };
}

export function readCdxHitsLog(filePath: string): CdxSweep | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return cdxSweepFromHitsLog(JSON.parse(fs.readFileSync(filePath, "utf8")));
  } catch {
    return null;
  }
}

/**
 * Wayback CDX 5xx/timeout must not fail a catalogue extract: faces already on
 * disk are enough to rebuild the index. `--cdx-only` still wants a live answer.
 */
export function recoverCdxSweep(input: {
  error: Error;
  cached: CdxSweep | null;
  requireLive: boolean;
}): CdxSweep {
  if (input.requireLive) throw input.error;
  if (
    input.cached &&
    (input.cached.cards.length > 0 || input.cached.site.length > 0)
  ) {
    return { ...input.cached, source: "cache" };
  }
  return {
    cards: [],
    site: [],
    cdxRows: 0,
    imageRows: 0,
    source: "unavailable",
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
  /**
   * Depth below `cards/`: a card folder is `<set>/<lang>/<card>` = 3.
   * Only there was `back.jpg` ever a mislabelled errata face. Shallower backs
   * are real versos — `cards/back.webp` is the pack back this very pipeline
   * installs, and `cards/<set>/back.*` is a set verso (`resolveSetBackPath`).
   * Renaming those turned the pack back into a stray `art.corrected.webp` on
   * every run, leaving the card with nothing to flip to.
   */
  const CARD_FOLDER_DEPTH = 3;
  const walk = (dir: string, depth: number) => {
    for (const name of fs.readdirSync(dir)) {
      if (name === ".DS_Store") continue;
      const abs = path.join(dir, name);
      const st = fs.statSync(abs);
      if (st.isDirectory()) {
        walk(abs, depth + 1);
        continue;
      }
      if (depth < CARD_FOLDER_DEPTH) continue;
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
  walk(cardsDir, 0);
  return moved;
}

function loadAppearances(root: string): Record<string, Record<string, string>> {
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(root, "appearances.json"), "utf8"),
    ) as { appearances?: Record<string, Record<string, string>> };
    return raw.appearances ?? {};
  } catch {
    return {};
  }
}

function pickArtForNarutoCardDir(
  cardDir: string,
  files: readonly string[],
  lang: string,
): string | null {
  const preferred = pickPreferredFaceArtFilename(files, lang);
  if (preferred && /^art\.(reconstructed|corrected)\./i.test(preferred)) {
    return preferred;
  }
  try {
    const json = fs.readFileSync(
      path.join(cardDir, NARUTO_FACE_DECISION_FILE),
      "utf8",
    );
    const named = parseNarutoFaceDecision(json, "art");
    if (named && files.includes(named)) return named;
  } catch {
    /* no decision yet */
  }
  return preferred;
}

function ingestNarutoCardDir(input: {
  prints: Map<string, NarutoPrintRow>;
  assets: NarutoAssetRow[];
  seen: Set<string>;
  cardDir: string;
  diskId: string;
  lang: string;
  family: string;
  appearanceSet: string;
}): void {
  if (!fs.statSync(input.cardDir).isDirectory()) return;
  const files = fs.readdirSync(input.cardDir);
  const art = pickArtForNarutoCardDir(input.cardDir, files, input.lang);
  const thumb = files.find((f) => /^thumb\.(jpe?g|png|webp|gif)$/i.test(f));
  if (!art && !thumb) return;
  const parsed = parseNarutoCollector(input.diskId);
  const printKey = mintNarutoPrintKey(input.diskId, input.appearanceSet);
  if (!parsed || !printKey) return;
  const lang = normalizeNarutoLang(input.lang);
  const assetKey = `${printKey}\0${lang}`;
  if (input.seen.has(assetKey)) return;
  input.seen.add(assetKey);
  const existing = input.prints.get(printKey);
  input.prints.set(printKey, {
    printKey,
    setCode: preferNarutoAppearanceSet(existing?.setCode, input.appearanceSet),
    number: existing?.number ?? input.diskId,
    cardType: existing?.cardType ?? cardTypeFromCollectorNumber(input.diskId),
    family: existing?.family ?? input.family,
    grouping: existing?.grouping ?? parsed.grouping,
  });
  input.assets.push({
    printKey,
    lang,
    art: art ?? null,
    thumb: thumb ?? null,
    back: null,
    printed: isNarutoLangPrinted(input.appearanceSet, lang),
  });
}

export function buildIndexFromDisk(root: string): {
  prints: NarutoPrintRow[];
  assets: NarutoAssetRow[];
} {
  const cardsDir = path.join(root, "cards");
  const prints = new Map<string, NarutoPrintRow>();
  const assets: NarutoAssetRow[] = [];
  const seen = new Set<string>();
  const appearances = loadAppearances(root);

  if (!fs.existsSync(cardsDir)) {
    return { prints: [], assets: [] };
  }

  for (const family of fs.readdirSync(cardsDir)) {
    const familyDir = path.join(cardsDir, family);
    if (!fs.statSync(familyDir).isDirectory()) continue;
    if (!isNarutoFamilyFolder(family)) continue;
    /*
      La ligne 疾風伝 est un **autre jeu**, servi par le pack `narutoshippuden`.

      `DISK_LAYOUT_FOLDERS` accepte ses dossiers (`shi`, `mju`, `msa`, `gaku`)
      parce que le disque les range ainsi, hérité d'avant la scission. Mais les
      ranger n'est pas les posséder : leurs tirages ne sont plus dans ce
      catalogue, et en ramasser les faces produisait des faces sans tirage —
      dix-sept le 2026-08-22 — sur quoi l'écriture d'index mourait, et la base
      restait vide.

      Les dix-sept sont déjà dans le pack Shippuden, aux mêmes noms de fichier :
      rien à récupérer ici, seulement un jeu voisin à ne pas s'annexer.
    */
    if (ALT_LINE_DISK_PREFIXES.has(family.trim().toLowerCase())) continue;
    for (const diskId of fs.readdirSync(familyDir)) {
      const diskDir = path.join(familyDir, diskId);
      if (!fs.statSync(diskDir).isDirectory()) continue;
      for (const lang of fs.readdirSync(diskDir)) {
        const appearance =
          appearances[diskId]?.[normalizeNarutoLang(lang)] ?? "unknown";
        ingestNarutoCardDir({
          prints,
          assets,
          seen,
          cardDir: path.join(diskDir, lang),
          diskId,
          lang,
          family,
          appearanceSet: appearance,
        });
      }
    }
  }

  for (const set of fs.readdirSync(cardsDir)) {
    const setDir = path.join(cardsDir, set);
    if (!fs.statSync(setDir).isDirectory()) continue;
    if (isNarutoFamilyFolder(set)) continue;
    for (const lang of fs.readdirSync(setDir)) {
      const langDir = path.join(setDir, lang);
      if (!fs.statSync(langDir).isDirectory()) continue;
      for (const cardId of fs.readdirSync(langDir)) {
        const diskId = narutoDiskCardId(cardId, set) ?? cardId;
        const parsed = parseNarutoCollector(cardId);
        ingestNarutoCardDir({
          prints,
          assets,
          seen,
          cardDir: path.join(langDir, cardId),
          diskId,
          lang,
          family: parsed?.family ?? "ninja",
          appearanceSet: set.toLowerCase(),
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
  for (const hit of listNarutoCardDirs(cardsDir)) {
    const thumb = path.join(hit.abs, "thumb.jpg");
    try {
      if (!fs.statSync(thumb).isFile()) continue;
    } catch {
      continue;
    }
    const ledger = narutoLedgerNumber(hit.diskId);
    if (ledger) out.add(ledger);
  }
  return out;
}

function cardDirHasAnyNarutoFace(dir: string): boolean {
  try {
    return fs
      .readdirSync(dir)
      .some(
        (name) =>
          narutoFaceSourceOf(name) != null ||
          /^art\.(reconstructed|corrected)\./i.test(name),
      );
  } catch {
    return false;
  }
}

/**
 * Staging rel-paths for tin faces already installed under `cards/promo`.
 * Skip re-mirroring those bytes on the next scrape (they were moved out).
 */
export function installedTinStagingPaths(root: string): Set<string> {
  const out = new Set<string>();
  const cardsDir = path.join(root, "cards");
  for (const promo of TIN_BOX_PROMOS) {
    const next = narutoCardAbsDir(cardsDir, promo.cardId, "fr", "promo");
    const legacy = path.join(cardsDir, "promo", "fr", promo.cardId);
    const hasFace = [next, legacy]
      .filter(Boolean)
      .some((dir) => cardDirHasAnyNarutoFace(dir!));
    if (!hasFace) continue;
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
      const next = narutoCardAbsDir(
        cardsDir,
        cardId,
        asset.lang,
        print.setCode,
      );
      const legacy = path.join(cardsDir, print.setCode, asset.lang, cardId);
      const cardDir =
        (next && fs.existsSync(next) && next) ||
        (fs.existsSync(legacy) ? legacy : next);
      if (!cardDir || !fs.existsSync(cardDir)) continue;
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
            return setCode !== "promo" && !/-promo$/i.test(rel);
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
          if (!/^thumb_.*Conflict\./i.test(name) && !/^thumb_MB-/i.test(name)) {
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
function titlesForNarutoPrints(prints: NarutoPrintRow[], root: string) {
  const hits = loadMangaNewsTitleHitsFromCache();
  const titles = titlesForPrints(prints, hits);
  const byKey = new Map(titles.map((t) => [t.printKey, t]));
  for (const promo of TIN_BOX_PROMOS) {
    const print = prints.find(
      (p) =>
        p.setCode === "promo" && narutoNumbersEqual(p.number, promo.cardId),
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
  const withStorm3 = [...merged.titles];
  const seen = new Set(
    withStorm3.map((t) => `${t.printKey}\0${t.lang.toLowerCase()}`),
  );
  const storm3En = [
    ...loadStorm3Ledger(root),
    ...loadStorm3Ledger(path.join(dataRoot(), NARUTO_EN_PACK_ID)),
  ].filter(
    (card, i, all) => all.findIndex((c) => c.number === card.number) === i,
  );
  const rarityByNumber = new Map(storm3En.map((c) => [c.number, c.rarity]));
  for (const card of storm3En) {
    const print = prints.find(
      (p) =>
        (p.setCode === "s28" ||
          p.family === "ninja" ||
          p.family === "jutsu" ||
          p.family === "mission") &&
        narutoNumbersEqual(p.number, card.number),
    );
    if (!print) continue;
    const key = `${print.printKey}\0en`;
    if (seen.has(key)) continue;
    seen.add(key);
    withStorm3.push({
      printKey: print.printKey,
      lang: "en",
      fullName: card.name,
      rarity: card.rarity,
    });
  }
  const colekaCcgFr = [
    ...loadColekaCcgFrLedgers(root),
    ...loadColekaCcgFrLedgers(path.join(dataRoot(), NARUTO_EN_PACK_ID)),
  ].filter(
    (card, i, all) => all.findIndex((c) => c.number === card.number) === i,
  );
  for (const card of colekaCcgFr) {
    const print = prints.find((p) => narutoNumbersEqual(p.number, card.number));
    if (!print) continue;
    const key = `${print.printKey}\0fr`;
    if (seen.has(key)) continue;
    seen.add(key);
    withStorm3.push({
      printKey: print.printKey,
      lang: "fr",
      fullName: card.name,
      rarity: rarityByNumber.get(card.number) ?? null,
    });
  }
  return withStorm3;
}

const FOUND_TITLE_SOURCE =
  "carddass-official + manga-news-cache + attested-promos + carte-semaine + bandaicg-en + bgg-en-s1 + coleka-fr + coleka-us-promos + slab-z-ja + carddas-jp + carddas-jp-promo + carddas-jp-maku + goat-en + narutocards-ca + cardgameclub-it + user-physical + leboncoin";

function assembleNarutoCatalogue(
  prints: NarutoPrintRow[],
  titles: ReturnType<typeof titlesForNarutoPrints>,
  root: string,
) {
  const withPromos = mergeAttestedPromos({ prints, titles });
  const withS6It = mergeColekaS6ItIntoIndex({
    prints: withPromos.prints,
    titles: withPromos.titles,
    root,
  });
  const carteSemaine = writeCarteSemaineReport(root);
  const withSemaine = mergeCarteSemaineIntoIndex({
    prints: withS6It.prints,
    titles: withS6It.titles,
    report: carteSemaine,
    root,
  });
  const found = mergeFoundCatalogueLedgers({
    prints: withSemaine.prints,
    titles: withSemaine.titles,
    hinokunianNames: hinokunianJaNames(root),
  });
  const withUsPromos = mergeColekaUsPromosIntoIndex({
    prints: found.prints,
    titles: found.titles,
    root,
  });
  /*
    Le 疾風伝 a son propre pack depuis le 2026-08-21 : c'est un autre jeu, avec
    sa maquette, son année et son dos. Ce pack-ci cesse donc de le revendiquer.

    Le filtre est ici, à l'assemblage, et non par une suppression en base :
    l'index se **reconstruit** à chaque passe depuis le disque et les relevés
    curés, si bien qu'une ligne effacée revenait à la suivante.

    Les relevés, eux, vivent encore dans ce provider — c'est la pièce qui reste
    à déménager pour que le nouveau pack sache se rafraîchir seul.
  */
  const shippudenFamilies = new Set(["shi", "mju", "msa", "gaku"]);
  const isShippuden = (cardType?: string | null) =>
    shippudenFamilies.has((cardType ?? "").trim().toLowerCase());
  const keptPrints = withUsPromos.prints.filter(
    (print) => !isShippuden(print.cardType),
  );
  const keptKeys = new Set(keptPrints.map((print) => print.printKey));
  const keptTitles = withUsPromos.titles.filter((title) =>
    keptKeys.has(title.printKey),
  );
  return {
    prints: keptPrints,
    titles: keptTitles,
    attestedPromosAdded: withPromos.addedPrints,
    s6ItAdded: withS6It.addedPrints,
    s6ItNamed: withS6It.titled,
    carteSemaine,
    hinokunianTitled: found.hinokunianTitled,
    carteSemaineNamed: withSemaine.named,
    carteSemaineAdded: withSemaine.addedPrints,
    found,
  };
}

function indexNarutoEnPackFromDisk(): void {
  // EN faces and sealed SKUs live on the carddass pack after layout migrate.
  const root = path.join(dataRoot(), NARUTO_EN_PACK_ID);
  const cardsDir = path.join(root, "cards");
  if (!fs.existsSync(cardsDir)) return;
  const leftover = listNarutoCardDirs(cardsDir).filter((hit) => {
    try {
      return fs.readdirSync(hit.abs).some((name) => !name.startsWith("."));
    } catch {
      return false;
    }
  });
  if (leftover.length === 0) {
    console.log(JSON.stringify({ enCcgIndex: "merged-into-carddass" }));
    return;
  }
  const { prints, assets } = buildIndexFromDisk(root);
  const titles = titlesForNarutoPrints(prints, root);
  const { dbPath, printCount } = writeNarutoCcgIndex({
    prints,
    titles,
    assets,
    pack: NARUTO_EN_PACK_ID,
    dbPath: path.join(root, "catalog.sqlite"),
    meta: {
      source: "disk",
      titleSource: "stop2shop + coleka-s24 + coleka-s28",
      titleCount: String(titles.length),
    },
  });
  const indexPath = path.join(root, "cards-index.json");
  exportNarutoCardsIndexJson(
    prints,
    assets,
    indexPath,
    titles,
    NARUTO_EN_PACK_ID,
  );
  console.log(
    JSON.stringify({
      enCcgIndex: true,
      printCount,
      titleCount: titles.length,
      dbPath,
      indexPath,
    }),
  );
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
    migrateNarutoCardLayout();
    await ensureNarutoCuratedAssets();
    const folded = await foldUnsourcedNarutoArt(root);
    const facesRewritten = await promoteAllNarutoFaces(root);
    const migratedVc = migrateNarutoVcBacksToCorrectedArt(root);
    const tinPromos = materializeTinBoxPromos(root);
    const { prints, assets } = buildIndexFromDisk(root);
    const thumbMapped = mapSiteMedThumbsOntoAssets(root, prints, assets);
    const assembled = assembleNarutoCatalogue(
      prints,
      titlesForNarutoPrints(prints, root),
      root,
    );
    const { dbPath, printCount } = writeNarutoCcgIndex({
      prints: assembled.prints,
      titles: assembled.titles,
      assets,
      dbPath: path.join(root, "catalog.sqlite"),
      meta: {
        source: "disk",
        titleSource: FOUND_TITLE_SOURCE,
        titleCount: String(assembled.titles.length),
        thumbMapped: String(thumbMapped),
        tinPromos: tinPromos.installed.join(","),
        attestedPromosAdded: String(assembled.attestedPromosAdded.length),
        s6ItAdded: String(assembled.s6ItAdded.length),
        s6ItNamed: String(assembled.s6ItNamed.length),
        carteSemaineNamed: String(assembled.carteSemaineNamed.length),
        carteSemaineAdded: String(assembled.carteSemaineAdded.length),
        bggEnS1Added: String(assembled.found.bggAdded.length),
        physicalAdded: String(assembled.found.physicalAdded.length),
        slabZJaNamed: String(assembled.found.slabZTitled.length),
        migratedVcBacks: String(migratedVc),
      },
    });
    const indexPath = path.join(root, "cards-index.json");
    exportNarutoCardsIndexJson(
      assembled.prints,
      assets,
      indexPath,
      assembled.titles,
    );
    indexNarutoEnPackFromDisk();
    console.log(
      JSON.stringify(
        {
          indexOnly: true,
          printCount,
          titleCount: assembled.titles.length,
          thumbMapped,
          migratedVc,
          foldedUnsourced: folded,
          facesRewritten,
          tinPromos,
          attestedPromosAdded: assembled.attestedPromosAdded.length,
          carteSemaineNamed: assembled.carteSemaineNamed.length,
          carteSemaineAdded: assembled.carteSemaineAdded.length,
          bggEnS1Added: assembled.found.bggAdded.length,
          physicalAdded: assembled.found.physicalAdded.length,
          hinokunianJaNamed: assembled.hinokunianTitled.length,
          titlesCorrected: assembled.found.titlesCorrected.length,
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
  let sweep: CdxSweep;
  const hitsLog = path.join(logsDir, "cdx-hits.json");
  try {
    sweep = await fetchCdxSweep();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    sweep = recoverCdxSweep({
      error: err,
      cached: readCdxHitsLog(hitsLog),
      requireLive: options.cdxOnly === true,
    });
    if (sweep.source === "cache") {
      console.warn(
        `CDX ${err.message} — reprise du dernier index Wayback (${sweep.cards.length} faces, ${sweep.site.length} extras)`,
      );
    } else {
      console.warn(
        `CDX ${err.message} — Wayback indisponible, index depuis le disque (pas de nouvelles faces)`,
      );
    }
  }
  let hits = sweep.cards;
  let siteHits = sweep.site;
  console.log(
    `CDX rows=${sweep.cdxRows} images=${sweep.imageRows} cards=${hits.length} siteExtras=${siteHits.length}${sweep.source && sweep.source !== "live" ? ` source=${sweep.source}` : ""}`,
  );

  if (options.limit && options.limit > 0) {
    hits = hits.slice(0, options.limit);
    siteHits = siteHits.slice(0, options.limit);
    console.log(`limited cards=${hits.length} site=${siteHits.length}`);
  }

  if (sweep.source !== "cache" && sweep.source !== "unavailable") {
    fs.writeFileSync(
      hitsLog,
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
  }

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
  const appearanceRows: {
    diskId: string;
    lang: string;
    appearanceSet: string;
  }[] = [];

  await runPool(hits, concurrency, delayMs, async (hit) => {
    const { parsed, timestamp, original } = hit;
    const ext = extFromUrl(original);
    const destName = carddassFaceFilename(parsed.role, ext);
    const destDir =
      narutoCardAbsDir(cardsDir, parsed.cardId, LANG, parsed.set) ??
      path.join(cardsDir, parsed.set, LANG, parsed.cardId);
    const dest = path.join(destDir, destName);
    const url = waybackRawUrl(timestamp, original);
    const result = await downloadRaw(url, dest, !force);
    if (result === "ok") {
      ok += 1;
      await promoteNarutoFace(destDir, LANG);
    } else if (result === "skip") {
      skip += 1;
      await promoteNarutoFace(destDir, LANG);
    } else fail += 1;

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

    const printKey =
      mintNarutoPrintKey(parsed.cardId, parsed.set) ?? parsed.printKey;
    const diskId = narutoDiskCardId(parsed.cardId, parsed.set) ?? parsed.number;
    appearanceRows.push({
      diskId,
      lang: LANG,
      appearanceSet: parsed.set,
    });
    prints.set(printKey, {
      printKey,
      setCode: parsed.set,
      number: diskId,
      cardType: parsed.type,
      grouping: parsed.grouping,
      sourceUrl: original,
    });

    const aKey = assetMapKey(printKey, LANG);
    const prev = assetsByKey.get(aKey) ?? {
      printKey,
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

  if (appearanceRows.length) upsertNarutoAppearances(root, appearanceRows);
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
  const foldedUnsourced = await foldUnsourcedNarutoArt(root);
  await promoteAllNarutoFaces(root);

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
    if (
      a.art &&
      (!prev.art ||
        faceArtRank(a.art, a.lang) > faceArtRank(prev.art, prev.lang))
    ) {
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
    if (
      a.art &&
      (!prev.art ||
        faceArtRank(a.art, a.lang) > faceArtRank(prev.art, prev.lang))
    ) {
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
  const assembled = assembleNarutoCatalogue(
    printList,
    titlesForNarutoPrints(printList, root),
    root,
  );
  if (assembled.attestedPromosAdded.length) {
    console.log(
      `── attested promos: ${assembled.attestedPromosAdded.length} printKeys sans face encore`,
    );
  }
  if (assembled.s6ItAdded.length || assembled.s6ItNamed.length) {
    console.log(
      `── S6 IT : ${assembled.s6ItAdded.length} printKeys, ${assembled.s6ItNamed.length} noms italiens`,
    );
  }
  if (
    assembled.carteSemaineNamed.length ||
    assembled.carteSemaineAdded.length
  ) {
    console.log(
      `── carte-semaine: ${assembled.carteSemaineNamed.length} titres, ${assembled.carteSemaineAdded.length} stubs`,
    );
  }
  if (assembled.found.bggAdded.length || assembled.found.physicalAdded.length) {
    console.log(
      `── ledgers: BGG EN S1 +${assembled.found.bggAdded.length}, PR physiques +${assembled.found.physicalAdded.length}`,
    );
  }
  const { dbPath, printCount } = writeNarutoCcgIndex({
    prints: assembled.prints,
    titles: assembled.titles,
    assets: assetList,
    dbPath: path.join(root, "catalog.sqlite"),
    meta: {
      source: "wayback:carddass.fr",
      cdxHits: String(hits.length),
      siteExtras: String(siteHits.length),
      titleSource: FOUND_TITLE_SOURCE,
      titleCount: String(assembled.titles.length),
      thumbMapped: String(thumbMapped),
      tinPromos: tinPromos.installed.join(","),
      attestedPromosAdded: String(assembled.attestedPromosAdded.length),
      carteSemaineNamed: String(assembled.carteSemaineNamed.length),
      carteSemaineAdded: String(assembled.carteSemaineAdded.length),
      bggEnS1Added: String(assembled.found.bggAdded.length),
      physicalAdded: String(assembled.found.physicalAdded.length),
      migratedVcBacks: String(migratedVc),
    },
  });
  const indexPath = path.join(root, "cards-index.json");
  exportNarutoCardsIndexJson(
    assembled.prints,
    assetList,
    indexPath,
    assembled.titles,
  );
  indexNarutoEnPackFromDisk();

  const siteByKind: Record<string, number> = {};
  for (const h of siteHits) siteByKind[h.kind] = (siteByKind[h.kind] ?? 0) + 1;

  const summary = {
    downloaded: ok,
    skipped: skip,
    failed: fail,
    printCount,
    titleCount: assembled.titles.length,
    attestedPromosAdded: assembled.attestedPromosAdded.length,
    carteSemaineNamed: assembled.carteSemaineNamed.length,
    carteSemaineAdded: assembled.carteSemaineAdded.length,
    bggEnS1Added: assembled.found.bggAdded.length,
    physicalAdded: assembled.found.physicalAdded.length,
    thumbMapped,
    migratedVc,
    foldedUnsourced,
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
