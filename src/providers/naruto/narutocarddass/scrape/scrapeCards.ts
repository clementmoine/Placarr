/**
 * Scrape Naruto CACG FR faces from Wayback (carddass.fr) → data/naruto/.
 *
 *   Catalogue Sync
 *   Catalogue Sync --force
 *   Catalogue Sync --limit 20
 *   Catalogue Sync --cdx-only
 *   Catalogue Sync --cards-only
 *   Catalogue Sync --index-only   # rebuild sqlite from disk
 */
import fs from "node:fs";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";
import { httpGet } from "@/lib/http/httpClient";
import { parsePrintKey } from "@/core/identify/printKey";

import {
  loadNarutoCardsIndexFromSqlite,
  writeNarutoCcgIndex,
  type NarutoAssetRow,
  type NarutoPrintRow,
} from "../indexStore";
import { NARUTO_PACK_ID, NARUTO_LEGACY_EN_CCG_DISK } from "../identity";
import {
  buildLocaleSpecificFacesFromIndex,
  writeLocaleSpecificFaces,
} from "@/lib/admin/localeSpecificFaces";
import type { CardsIndexV1 } from "@/effects/cardsIndex";
import { hinokunianJaNames } from "./catalogues";
import { nikitaFactsJaNames } from "./catalogues";
import { loadSurugaResolvedJaNames } from "./marketplace";
import {
  loadMangaNewsTitleHitsFromCache,
  titlesForPrints,
} from "../sources/titles";
import { materializeTinBoxPromos, TIN_BOX_PROMOS } from "../sealed";
import {
  belongsOnNarutoPromoChecklist,
  mergeAttestedPromos,
  mergeS1FrPrerelease,
} from "../sources/promos";
import {
  isNarutoS6FrPrintedNumber,
  mergeCarteSemaineIntoIndex,
  writeCarteSemaineReport,
} from "../sources/titles";
import { applyOfficialNames, loadOfficialNames } from "../identity";
import { mergeFoundCatalogueLedgers } from "../pipeline/ledgers";
import { mergeColekaUsPromosIntoIndex } from "../sources/promos";
import {
  loadColekaRampageTornadoLedger,
  loadColekaSagesLegacyLedger,
  loadColekaStorm3Ledger,
} from "./coleka";
import { loadStorm3Ledger } from "./marketplace";
import {
  ensureNarutoChecklistLayout,
  writeNarutoCompleteness,
} from "../pipeline/coverage";
import { ensureNarutoCuratedAssets } from "../install/curated";
import {
  ALT_LINE_DISK_PREFIXES,
  isNarutoFamilyFolder,
  mintNarutoPrintKey,
  narutoCollectorNumberKey,
  narutoDiskCardId,
  narutoLedgerNumber,
  narutoNumbersEqual,
  narutoRetailDiskNumber,
  officialFrChecklistSetsForNumber,
  parseNarutoCollector,
} from "../identity";
import { foldUnsourcedNarutoArt } from "../pipeline/audit";
import {
  migrateNarutoCardLayout,
  relocateMiskeyedPromoAppearances,
  upsertNarutoAppearances,
} from "../pipeline";
import {
  NARUTO_FACE_DECISION_FILE,
  narutoFaceSourceOf,
  parseNarutoFaceDecision,
} from "../disk";
import { promoteAllNarutoFaces, promoteNarutoFace } from "../disk";
import {
  narutoCardAbsDir,
  listNarutoCardDirs,
  narutoCardPathFromCollector,
} from "../disk";
import { resolveNarutoDiskArtFilename } from "../diskArtAttachments";
import {
  appearanceSetsOf,
  loadNarutoAppearancesFile,
  mergeAppearanceValues,
  primaryAppearanceSet,
  type NarutoLangAppearances,
} from "../identity";
import { syncOfficialFrChecklistAppearances } from "../identity";
import { syncNarutoS6FrPrintedAppearances } from "../sources/titles";
import {
  isNarutoJapaneseVolumeSet,
  isNarutoLangPrinted,
  preferNarutoAppearanceSet,
} from "../identity";
import { isNarutoLangDir, normalizeNarutoLang } from "../disk";
import { japaneseCatalogueSetsForPrintNumber } from "../sources/sealed";
import {
  medThumbRank,
  parseCarddassAssetPath,
  parseCarddassMedThumbFilename,
  carddassFaceFilename,
  faceArtRank,
  pickPreferredFaceArtFilename,
  waybackRawUrl,
  type ParsedCarddassAsset,
} from "../parse/bandai";
import { cardTypeFromCollectorNumber } from "../parse/bandai";

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
      const response = await httpGet<string[][]>(CDX_URL, {
        headers: { "user-agent": "PlacarrNarutoScrape/1.0 (local collection)" },
        // Le CDX Wayback met souvent 20–90s à répondre (log ci-dessus).
        timeout: 180_000,
        validateStatus: () => true,
      });
      console.log(
        `CDX HTTP ${response.status} in ${Math.round((Date.now() - started) / 1000)}s — parsing JSON…`,
      );
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`CDX HTTP ${response.status}`);
      }
      const raw = response.data;
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
    const response = await httpGet<ArrayBuffer>(url, {
      headers: { "user-agent": "PlacarrNarutoScrape/1.0 (local collection)" },
      responseType: "arraybuffer",
      // Wayback peut traîner ; au-delà on classe en échec (retry amont).
      timeout: 60_000,
      validateStatus: () => true,
    });
    if (response.status < 200 || response.status >= 300) return "fail";
    const buf = Buffer.from(response.data);
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
   * installs, and `cards/{lang}/{set}/back.*` (legacy `cards/<set>/back.*`)
   * is a set verso (`resolveSetBackPath`).
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

function loadAppearances(root: string): Record<string, NarutoLangAppearances> {
  return loadNarutoAppearancesFile(root)?.appearances ?? {};
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
  appearanceSets: readonly string[];
}): void {
  if (!fs.statSync(input.cardDir).isDirectory()) return;
  const files = fs.readdirSync(input.cardDir);
  const art = pickArtForNarutoCardDir(input.cardDir, files, input.lang);
  const thumb = files.find((f) => /^thumb\.(jpe?g|png|webp|gif)$/i.test(f));
  if (!art && !thumb) return;
  const parsed = parseNarutoCollector(input.diskId);
  const grouping = parsed?.grouping?.toLowerCase() ?? "";
  /*
    Folder identity wins over a mis-keyed appearance. Bare `te0107/ja` must not
    mint `naruto:promo-te0107` (URL → `te0107-promo/…` while files live under
    `te0107/`). `-promo` folders always mint the promo channel.
  */
  let sets = appearanceSetsOf(input.appearanceSets);
  const family = input.family.trim().toLowerCase();
  if (grouping === "promo" || grouping === "cdf") {
    if (!sets.includes(grouping)) sets = [grouping];
  } else if (family === "promo" || family === "cdf") {
    /*
      European PR collectors (`pr0011`) parse with family=promo but grouping
      null. Folder identity must win — otherwise the retail `else` strips
      `promo` from appearanceSets and mintNarutoPrintKey returns null, so
      on-disk faces never reach print_assets.
    */
    if (!sets.includes(family)) sets = [family];
  } else if (grouping === "prerelease") {
    /*
      Manga S1 avant-première: folder `*-prerelease` belongs to Série 1, not a
      separate catalogue series (brief `prerelease` set folded back into s1).
    */
    sets = sets.filter((set) => set !== "prerelease" && set !== "promo");
    if (!sets.length) sets = ["s1"];
  } else {
    sets = sets.filter((set) => set !== "promo");
  }
  const appearanceSet = primaryAppearanceSet(
    sets,
    grouping === "promo" || grouping === "cdf"
      ? grouping
      : grouping === "prerelease"
        ? "s1"
        : "unknown",
  );
  const printKey = mintNarutoPrintKey(input.diskId, appearanceSet);
  if (!parsed || !printKey) return;
  const lang = normalizeNarutoLang(input.lang);
  const assetKey = `${printKey}\0${lang}`;
  if (input.seen.has(assetKey)) return;
  input.seen.add(assetKey);
  const existing = input.prints.get(printKey);
  /*
    Les 巻ノ sont une autre découpe (bornes de numéros), pas une membership
    européenne. Les fusionner dans setCodes ferait apparaître NI-049 dans
    `print_sets` sous maki3 alors que la checklist papier dit S1+S5.
  */
  const european = sets.filter((set) => !/^maki\d+$/i.test(set));
  const setCodes = mergeAppearanceValues(existing?.setCodes, european);
  const setCode = primaryAppearanceSet(
    mergeAppearanceValues(
      existing?.setCode,
      existing?.setCodes,
      european.length ? european : sets,
    ),
    preferNarutoAppearanceSet(existing?.setCode, appearanceSet),
  );
  const groupingFromKey = parsePrintKey(printKey)?.grouping ?? null;
  input.prints.set(printKey, {
    printKey,
    setCode,
    ...(setCodes.length ? { setCodes } : {}),
    number: existing?.number ?? input.diskId,
    cardType: existing?.cardType ?? cardTypeFromCollectorNumber(input.diskId),
    family: existing?.family ?? input.family,
    grouping:
      existing?.grouping ?? parsed.grouping ?? groupingFromKey ?? null,
  });
  input.assets.push({
    printKey,
    lang,
    art: art ?? null,
    thumb: thumb ?? null,
    back: null,
    printed: isNarutoLangPrinted(sets.length ? sets : appearanceSet, lang),
  });
}

export function buildIndexFromDisk(root: string): {
  prints: NarutoPrintRow[];
  assets: NarutoAssetRow[];
} {
  /*
    Checklist papier FR → multi-set dans pack_documents.appearances **avant** lecture.
    Si Bandai liste NI-049 en S1 et S5, le disque doit le dire aussi — pas un
    OR SQL au moment de la search.
  */
  syncOfficialFrChecklistAppearances(root);
  syncNarutoS6FrPrintedAppearances(root);
  relocateMiskeyedPromoAppearances(root);
  const cardsDir = path.join(root, "cards");
  const prints = new Map<string, NarutoPrintRow>();
  const assets: NarutoAssetRow[] = [];
  const seen = new Set<string>();
  const appearances = loadAppearances(root);

  if (!fs.existsSync(cardsDir)) {
    return { prints: [], assets: [] };
  }

  /**
   * JA (and EN) folders often lack pack_documents.appearances rows while FR
   * already lists s1–s5 membership. Minting with `unknown` returns null and
   * silently drops on-disk Suruga/Chitoroshop faces from print_assets.
   */
  const resolveDiskAppearanceSets = (
    diskId: string,
    lang: string,
  ): string[] => {
    const normalized = normalizeNarutoLang(lang);
    const own = appearanceSetsOf(appearances[diskId]?.[normalized]);
    if (own.length) return own;
    for (const [otherLang, value] of Object.entries(
      appearances[diskId] ?? {},
    )) {
      if (otherLang === normalized) continue;
      const borrowed = appearanceSetsOf(value);
      if (borrowed.length) return borrowed;
    }
    const checklist = officialFrChecklistSetsForNumber(diskId);
    if (checklist.length) return checklist;
    return [];
  };

  /*
    Universal layout: cards/{lang}/{set}/{card}. Cross-set display is
    catalogue-time `artBorrowFrom` (same locale); no family-tree dual-read.
    疾風伝 prefixes stay on disk for Shippuden — skip them here.
  */
  for (const lang of fs.readdirSync(cardsDir)) {
    const langDir = path.join(cardsDir, lang);
    if (!fs.statSync(langDir).isDirectory()) continue;
    if (!isNarutoLangDir(lang)) continue;
    for (const set of fs.readdirSync(langDir)) {
      const setCode = set.trim().toLowerCase();
      if (ALT_LINE_DISK_PREFIXES.has(setCode)) continue;
      const setDir = path.join(langDir, set);
      if (!fs.statSync(setDir).isDirectory()) continue;
      for (const cardId of fs.readdirSync(setDir)) {
        const cardDir = path.join(setDir, cardId);
        if (!fs.statSync(cardDir).isDirectory()) continue;
        const diskId = narutoDiskCardId(cardId, setCode) ?? cardId;
        const parsed = parseNarutoCollector(cardId);
        let sets = [setCode];
        /*
          If a folder is still under a family-like name (pre-migration residue),
          resolve checklist memberships; otherwise the path set is authoritative.
        */
        if (isNarutoFamilyFolder(setCode) && setCode !== "promo") {
          const resolved = resolveDiskAppearanceSets(diskId, lang);
          if (resolved.length) sets = resolved;
        }
        ingestNarutoCardDir({
          prints,
          assets,
          seen,
          cardDir,
          diskId,
          lang,
          family: parsed?.family ?? "ninja",
          appearanceSets: sets,
        });
      }
    }
  }

  return { prints: [...prints.values()], assets };
}

/** `ni0019-prerelease` / `te0030-cdf` → `ni:0019` — grouping ignored for art share. */
function mirrorDonorScore(
  print: NarutoPrintRow | undefined,
  art: string,
): number {
  let score = 0;
  const set = print?.setCode?.trim().toLowerCase() ?? "";
  if (set !== "promo") score += 100;
  const number = print?.number ?? "";
  if (!/-prerelease$/i.test(number) && !/-promo$/i.test(number)) score += 50;
  if (/\.reconstructed\./i.test(art)) score += 30;
  else if (/\.corrected\./i.test(art)) score += 20;
  return score;
}

/**
 * Same collector number may have art under one set folder while titles mint
 * extra printKeys (promo stub / manga prerelease / sister sN). Mirror an
 * existing art row onto those keys so completeness does not treat a sister
 * number as a missing face. Disk stays empty at the borrower set — browse
 * inherits via `artBorrowFrom` / `bestFaceAcrossLocales`.
 */
/**
 * Same-locale, same-set (or promo←retail) asset row mirror only.
 * Cross-set inheritance for browse is {@link artBorrowFrom} at catalogue time —
 * never invent sqlite art on s6 from s1.
 */
export function mirrorNarutoAssetsAcrossCollectorNumbers(input: {
  prints: readonly NarutoPrintRow[];
  titles: readonly { printKey: string; lang: string }[];
  assets: NarutoAssetRow[];
}): { assets: NarutoAssetRow[]; mirrored: number } {
  const printByKey = new Map(input.prints.map((p) => [p.printKey, p] as const));
  const collectorKeyByPrint = new Map(
    input.prints.map((p) => {
      const key = narutoCollectorNumberKey(p.number);
      return [p.printKey, key] as const;
    }),
  );
  const isAlt = (printKey: string, number: string): boolean => {
    const set = printByKey.get(printKey)?.setCode?.toLowerCase();
    if (set === "promo" || set === "prerelease") return true;
    const g = parseNarutoCollector(number)?.grouping?.toLowerCase();
    return g === "promo" || g === "prerelease" || g === "cdf";
  };
  const artByCollectorLang = new Map<
    string,
    { asset: NarutoAssetRow; score: number; set: string; alt: boolean }
  >();
  const have = new Set<string>();
  for (const asset of input.assets) {
    const lang = asset.lang.trim().toLowerCase();
    const key = `${asset.printKey}\0${lang}`;
    have.add(key);
    if (!asset.art) continue;
    const print = printByKey.get(asset.printKey);
    const collector = collectorKeyByPrint.get(asset.printKey);
    if (!print || !collector) continue;
    const nk = `${collector}\0${lang}`;
    const score = mirrorDonorScore(print, asset.art);
    const prev = artByCollectorLang.get(nk);
    if (!prev || score > prev.score) {
      artByCollectorLang.set(nk, {
        asset,
        score,
        set: print.setCode.toLowerCase(),
        alt: isAlt(asset.printKey, print.number),
      });
    }
  }
  const out = [...input.assets];
  let mirrored = 0;
  for (const title of input.titles) {
    const lang = title.lang.trim().toLowerCase();
    const assetKey = `${title.printKey}\0${lang}`;
    if (have.has(assetKey)) continue;
    const collector = collectorKeyByPrint.get(title.printKey);
    const print = printByKey.get(title.printKey);
    if (!collector || !print) continue;
    const donor = artByCollectorLang.get(`${collector}\0${lang}`);
    if (!donor?.asset.art) continue;
    const recvSet = print.setCode.toLowerCase();
    const recvAlt = isAlt(title.printKey, print.number);
    // Same set always OK; promo/prerelease/cdf may take retail. Never s6←s1.
    if (donor.set !== recvSet && !(recvAlt && !donor.alt)) continue;
    if (recvSet === "s6" && donor.set !== "s6") continue;
    /*
      Do not invent FR/IT assets on JA-only tourney reprints that are not on
      the Promo checklist (search already hides them — keep sqlite honest).
    */
    if (
      recvAlt &&
      (recvSet === "promo" ||
        parseNarutoCollector(print.number)?.grouping?.toLowerCase() ===
          "promo") &&
      !belongsOnNarutoPromoChecklist(print.number) &&
      (lang === "fr" || lang === "it")
    ) {
      continue;
    }
    out.push({
      printKey: title.printKey,
      lang: title.lang,
      art: donor.asset.art,
      thumb: donor.asset.thumb,
      back: donor.asset.back ?? null,
      printed: donor.asset.printed,
    });
    have.add(assetKey);
    mirrored += 1;
  }
  return { assets: out, mirrored };
}

/**
 * Title rows whose printKey missed the disk walk (maki membership minted from
 * ledgers, jp-release band quirks, …) still share `cards/{family}/{id}/{lang}/`.
 * Attach on-disk art so SQLite print_assets matches what the runtime disk fill
 * already shows in the picker.
 */
export function attachNarutoDiskArtAssets(input: {
  prints: readonly NarutoPrintRow[];
  titles: readonly { printKey: string; lang: string }[];
  assets: NarutoAssetRow[];
  cardsRoot: string;
}): { assets: NarutoAssetRow[]; attached: number } {
  const numberByKey = new Map(
    input.prints.map((p) => [p.printKey, p.number] as const),
  );
  const setCodeByKey = new Map(
    input.prints.map((p) => [p.printKey, p.setCode] as const),
  );
  const have = new Set(
    input.assets.map((a) => `${a.printKey}\0${a.lang.toLowerCase()}`),
  );
  const out = [...input.assets];
  let attached = 0;
  for (const title of input.titles) {
    const lang = title.lang.trim().toLowerCase();
    if (!lang) continue;
    /*
      巻ノ printKeys are JA-only. Attaching the shared FR disk face here is what
      invents FR catalogue tiles for Japanese volumes.
    */
    if (
      isNarutoJapaneseVolumeSet(setCodeByKey.get(title.printKey)) &&
      lang !== "ja"
    ) {
      continue;
    }
    const assetKey = `${title.printKey}\0${lang}`;
    if (have.has(assetKey)) continue;
    const number = numberByKey.get(title.printKey);
    if (!number) continue;
    const diskCandidates = [number];
    const retail = narutoRetailDiskNumber(number);
    if (retail && retail.toLowerCase() !== number.toLowerCase()) {
      diskCandidates.push(retail);
    }
    const set = setCodeByKey.get(title.printKey)?.toLowerCase();
    if (!set) continue;
    let art: string | null = null;
    for (const candidate of diskCandidates) {
      const pathId = narutoCardPathFromCollector(candidate, lang, set);
      if (!pathId) continue;
      art = resolveNarutoDiskArtFilename(
        path.join(input.cardsRoot, pathId.lang, pathId.set, pathId.diskId),
      );
      if (art) break;
    }
    if (!art) continue;
    out.push({
      printKey: title.printKey,
      lang,
      art,
      thumb: null,
      back: null,
    });
    have.add(assetKey);
    attached += 1;
  }
  return { assets: out, attached };
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
            const parts = rel.split(path.sep);
            const appearanceSet = (
              isNarutoLangDir(parts[0] ?? "") ? parts[1] : parts[0]
            )
              ?.trim()
              .toLowerCase();
            const cardFolder = parts.at(-1) ?? "";
            return (
              appearanceSet !== "promo" && !/-promo$/i.test(cardFolder)
            );
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
      const dest = cardDir ? path.join(cardDir, "thumb.jpg") : "";
      const gotMed = dest ? medDestPaths.includes(dest) : false;
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
    ...loadStorm3Ledger(path.join(dataRoot(), NARUTO_LEGACY_EN_CCG_DISK)),
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
  /*
    Coleka CCG FR ledgers are set-scoped (s24 / s28 / s11 Tempête). Prefer a
    print already on that set — `prints.find` by number alone stuck Tempête
    names on s1/s3 reprints and left s11 at 16/33 FR titles.
  */
  const colekaCcgFrBySet: Array<{
    preferredSet: string;
    cards: ReturnType<typeof loadColekaRampageTornadoLedger>;
  }> = [
    {
      preferredSet: "s24",
      cards: [
        ...loadColekaSagesLegacyLedger(root),
        ...loadColekaSagesLegacyLedger(
          path.join(dataRoot(), NARUTO_LEGACY_EN_CCG_DISK),
        ),
      ],
    },
    {
      preferredSet: "s28",
      cards: [
        ...loadColekaStorm3Ledger(root),
        ...loadColekaStorm3Ledger(
          path.join(dataRoot(), NARUTO_LEGACY_EN_CCG_DISK),
        ),
      ],
    },
    {
      preferredSet: "s11",
      cards: [
        ...loadColekaRampageTornadoLedger(root),
        ...loadColekaRampageTornadoLedger(
          path.join(dataRoot(), NARUTO_LEGACY_EN_CCG_DISK),
        ),
      ],
    },
  ];
  for (const { preferredSet, cards } of colekaCcgFrBySet) {
    const unique = cards.filter(
      (card, i, all) => all.findIndex((c) => c.number === card.number) === i,
    );
    for (const card of unique) {
      const matches = prints.filter((p) =>
        narutoNumbersEqual(p.number, card.number),
      );
      const print =
        matches.find(
          (p) =>
            p.setCode === preferredSet ||
            (p.setCodes ?? []).includes(preferredSet),
        ) ?? matches[0];
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
  }
  return withStorm3;
}

const FOUND_TITLE_SOURCE =
  "carddass-official + manga-news-cache + attested-promos + s1-fr-prerelease + carte-semaine + bandaicg-en + bgg-en-s1 + coleka-fr + coleka-us-promos + slab-z-ja + carddas-jp + carddas-jp-promo + carddas20-pro + noihjp-carddass + carddas-jp-maku + goat-en + narutocardgame-gg + narutocards-ca + narutocards-net + user-physical + leboncoin";

function assembleNarutoCatalogue(
  prints: NarutoPrintRow[],
  titles: ReturnType<typeof titlesForNarutoPrints>,
  root: string,
) {
  const withPromos = mergeAttestedPromos({ prints, titles });
  const withPrerelease = mergeS1FrPrerelease({
    prints: withPromos.prints,
    titles: withPromos.titles,
  });
  const carteSemaine = writeCarteSemaineReport(root);
  const withSemaine = mergeCarteSemaineIntoIndex({
    prints: withPrerelease.prints,
    titles: withPrerelease.titles,
    report: carteSemaine,
    root,
  });
  const found = mergeFoundCatalogueLedgers({
    prints: withSemaine.prints,
    titles: withSemaine.titles,
    hinokunianNames: [
      ...hinokunianJaNames(root),
      ...nikitaFactsJaNames(root),
      ...loadSurugaResolvedJaNames(root),
    ],
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
  /*
    S6 FR retail was cancelled — only Kana/DVD inserts in `s6-fr-printed.json`
    keep a French title. Other s6 FR names are pre-prod carddass.fr leftovers
    or Italian Coleka strings that contaminated the FR column.
  */
  const keptTitles = withUsPromos.titles.filter((title) => {
    if (!keptKeys.has(title.printKey)) return false;
    if (title.lang.trim().toLowerCase() !== "fr") return true;
    const set = /^naruto:([a-z0-9]+)-/i.exec(title.printKey)?.[1]?.toLowerCase();
    if (set !== "s6") return true;
    const number = title.printKey.slice(title.printKey.indexOf("-") + 1);
    return isNarutoS6FrPrintedNumber(number);
  });
  return {
    prints: keptPrints,
    titles: keptTitles,
    attestedPromosAdded: withPromos.addedPrints,
    carteSemaine,
    hinokunianTitled: found.hinokunianTitled,
    carteSemaineNamed: withSemaine.named,
    carteSemaineAdded: withSemaine.addedPrints,
    found,
  };
}

/** EN CCG leftovers under `data/naruto/en-ccg/` are merged by layout migrate — no second index. */
function indexNarutoEnPackFromDisk(): void {
  console.log(JSON.stringify({ enCcgIndex: "merged-into-carddass" }));
}

/**
 * FR/JA/EN Carddass rectos carry different printed text. Without this ledger,
 * `bestFaceAcrossLocales` lets a high-res JA shop scan steal the FR tile
 * (NI-001/002 → art.suruga ; 忍-2（PS） chitoroshop vit sous `ni0002-ps`).
 * Count titles too: FR « Le don de la copie » without a scan must not show
 * JA art.suruga. JA-only orphans (no EU title) stay neutral so empty shells
 * can still borrow.
 */
function writeCarddassLocaleSpecificFaces(index: CardsIndexV1): number {
  try {
    const doc = buildLocaleSpecificFacesFromIndex(
      index,
      ["fr", "ja", "en"],
      "Carddass FR/JA/EN — recto/titre localisé, ne pas emprunter cross-langue.",
      { countLocalizedNames: true },
    );
    const out = writeLocaleSpecificFaces(NARUTO_PACK_ID, doc);
    console.log(
      `── locale-specific-faces: ${out.faces} dual-locale → ${out.path}`,
    );
    return out.faces;
  } catch (err) {
    console.warn(
      `── locale-specific-faces: ${err instanceof Error ? err.message : err}`,
    );
    return 0;
  }
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
    const mirrored = mirrorNarutoAssetsAcrossCollectorNumbers({
      prints: assembled.prints,
      titles: assembled.titles,
      assets,
    });
    const diskAttached = attachNarutoDiskArtAssets({
      prints: assembled.prints,
      titles: assembled.titles,
      assets: mirrored.assets,
      cardsRoot: cardsDir,
    });
    const { dbPath, printCount } = writeNarutoCcgIndex({
      prints: assembled.prints,
      titles: assembled.titles,
      assets: diskAttached.assets,
      dbPath: path.join(root, "catalog.sqlite"),
      meta: {
        source: "disk",
        titleSource: FOUND_TITLE_SOURCE,
        titleCount: String(assembled.titles.length),
        thumbMapped: String(thumbMapped),
        tinPromos: tinPromos.installed.join(","),
        attestedPromosAdded: String(assembled.attestedPromosAdded.length),
        carteSemaineNamed: String(assembled.carteSemaineNamed.length),
        carteSemaineAdded: String(assembled.carteSemaineAdded.length),
        bggEnS1Added: String(assembled.found.bggAdded.length),
        physicalAdded: String(assembled.found.physicalAdded.length),
        slabZJaNamed: String(assembled.found.slabZTitled.length),
        migratedVcBacks: String(migratedVc),
        assetsMirrored: String(mirrored.mirrored),
        assetsDiskAttached: String(diskAttached.attached),
      },
    });
    const builtIndex = loadNarutoCardsIndexFromSqlite(NARUTO_PACK_ID);
    const localeSpecificFaces = builtIndex
      ? writeCarddassLocaleSpecificFaces(builtIndex)
      : 0;
    indexNarutoEnPackFromDisk();
    // `writeNarutoCompleteness` joins `dataRoot()` + pack id — do not pass pack root.
    const completeness = writeNarutoCompleteness();
    const { writeLocaleAnomalyReport } = await import(
      "../pipeline/localeAnomalies"
    );
    const anomalies = writeLocaleAnomalyReport();
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
          localeSpecificFaces,
          assetsMirrored: mirrored.mirrored,
          assetsDiskAttached: diskAttached.attached,
          itTitles: assembled.titles.filter((t) => t.lang === "it").length,
          itRarities: assembled.found.itRarities.length,
          anomaliesFrOnEnOnly:
            anomalies.anomalies.frTitlesOnEnOnlySeries.length,
          completenessJaImagePct: completeness.report.locales.ja?.image.pct,
          completenessJaTitleWithoutImage:
            completeness.report.locales.ja?.titleWithoutImage,
          dbPath,
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
  let assetList = [...assetsByKey.values()];
  const thumbMapped = mapSiteMedThumbsOntoAssets(root, printList, assetList);

  console.log("── index catalog.sqlite");
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
  const mirrored = mirrorNarutoAssetsAcrossCollectorNumbers({
    prints: assembled.prints,
    titles: assembled.titles,
    assets: assetList,
  });
  const diskAttached = attachNarutoDiskArtAssets({
    prints: assembled.prints,
    titles: assembled.titles,
    assets: mirrored.assets,
    cardsRoot: cardsDir,
  });
  assetList = diskAttached.assets;
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
      assetsMirrored: String(mirrored.mirrored),
      assetsDiskAttached: String(diskAttached.attached),
    },
  });
  const builtIndex = loadNarutoCardsIndexFromSqlite(NARUTO_PACK_ID);
  const localeSpecificFaces = builtIndex
    ? writeCarddassLocaleSpecificFaces(builtIndex)
    : 0;
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
    localeSpecificFaces,
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
    cardsDir,
  };
  fs.writeFileSync(
    path.join(logsDir, "last-run.json"),
    `${JSON.stringify({ ...summary, at: new Date().toISOString() }, null, 2)}\n`,
  );
  console.log(JSON.stringify(summary, null, 2));
}
