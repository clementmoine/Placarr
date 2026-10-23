/**
 * Curated Naruto Carddass assets — paths under `curated/`, reconstructed
 * faces, card backs, and foil mask.
 *
 * Install hand-made card faces from
 * `src/providers/naruto/narutocarddass/curated/cards/{lang}/{set}/{id}/art.reconstructed.png`
 * into the catalogue as `art.reconstructed.webp` under the same lang-first path
 * in `data/naruto/carddass/cards/`.
 *
 * These are not scrape output: they are rebuilt by hand (AI restoration of a
 * collector photo, then Figma retouching) for cards whose official face is
 * missing, or whose official face is a crude errata scan carrying the burnt-in
 * `www.carddass.fr` watermark. They take display priority over the official
 * files — see `pickPreferredFaceArtFilename` — but never replace them on disk:
 * the official face stays as the authentic source, and the collector photo
 * stays beside the PNG as `source.jpg` so the reconstruction remains auditable.
 * Exception: the Mercari restorations (PS1 bonus) whose photo lives on mercdn —
 * their provenance is the ingest row in `sources/mercari.json`.
 *
 * Normalisation applied: crop the fully-opaque bounding box (Figma exports a
 * 1px transparent bleed), scale to the official 843x1206, flatten to opaque.
 *
 * Synced automatically at the start of every Catalogue Sync /
 * extract (mtime vs `data/…/art.reconstructed.webp`). Explicit:
 *
 *   Catalogue Sync --only reconstruct
 *   Catalogue Sync --only reconstruct --dry-run
 *   Catalogue Sync --force   # rewrite even when dest is newer
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import sharp, { type Sharp } from "sharp";

import { packCardsDir } from "@/lib/packPaths";
import {
  writeLosslessRgbaWebp,
  writeLosslessWebpFile,
} from "@/lib/media/losslessWebp";
import { dataRoot, foilPackDir } from "@/lib/runtimeData";
import {
  curatedCardsDir,
  curatedDestStale,
  installCuratedCardBacks,
  langFirstSetBackDestRel,
} from "@/providers/shared/curatedCardsInstall";

import { installMercariFaces } from "./faces";
import { installYahooAuctionFaces } from "./faces";
import {
  appearanceSetsOf,
  loadNarutoAppearancesFile,
  mintNarutoPrintKey,
  NARUTO_PACK_ID,
  narutoDiskCardId,
  parseNarutoCollector,
  primaryAppearanceSet,
} from "../identity";
import { isNarutoLangDir, promoteNarutoFace } from "../disk";
import { resolveNarutoArtDiskSet } from "../diskArtAttachments";
import {
  narutoCuratedDir,
  narutoCuratedProductsDir,
  narutoCuratedSourcesDir,
  narutoCuratedReconstructedProvenancePath,
} from "../identity";
import { materializePeerRetailFaces } from "../sources/materializePeerRetailFaces";
import { materializeS1FrPrereleaseIdenticalRetailFaces } from "../sources/promos";
import { isNarutoS6FrPrintedNumber } from "../sources/titles";

export {
  narutoCuratedDir,
  narutoCuratedProductsDir,
  narutoCuratedSourcesDir,
  narutoCuratedReconstructedProvenancePath,
};


/** Official S5 face geometry — every reconstruction is normalised to it. */
export const RECONSTRUCTED_WIDTH = 843;
export const RECONSTRUCTED_HEIGHT = 1206;

export const RECONSTRUCTED_FILENAME = "art.reconstructed.webp";
const RECONSTRUCTED_FACE = /^art\.reconstructed\.(png|webp)$/i;

export type ReconstructedInstall = {
  cardId: string;
  set: string;
  lang: string;
  source: string;
  dest: string;
  from: { width: number; height: number };
  cropped: boolean;
};

export type CuratedReconstructedFace = {
  source: string;
  cardId: string;
  lang: string;
  family: string;
};

export { curatedDestStale };

function packRoot(): string {
  return path.join(dataRoot(), NARUTO_PACK_ID);
}

function curatedSourceSubdirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => {
    if (name.startsWith(".")) return false;
    try {
      return statSync(path.join(dir, name)).isDirectory();
    } catch {
      return false;
    }
  });
}

/** Curated faces: `cards/{lang}/{set}/{id}/` (mirrors data lang-first). */
function listCuratedSourceCardDirs(cardsDir: string): {
  abs: string;
  family: string;
  diskId: string;
  lang: string;
  set: string;
}[] {
  const out: {
    abs: string;
    family: string;
    diskId: string;
    lang: string;
    set: string;
  }[] = [];
  for (const lang of curatedSourceSubdirs(cardsDir)) {
    if (!isNarutoLangDir(lang)) continue;
    const langDir = path.join(cardsDir, lang);
    for (const set of curatedSourceSubdirs(langDir)) {
      const setDir = path.join(langDir, set);
      for (const cardId of curatedSourceSubdirs(setDir)) {
        const parsed = parseNarutoCollector(cardId);
        const diskId = narutoDiskCardId(cardId, parsed?.family) ?? cardId;
        out.push({
          abs: path.join(setDir, cardId),
          family: parsed?.family ?? set,
          diskId,
          lang,
          set,
        });
      }
    }
  }
  return out;
}

/** Faces under `curated/cards/{lang}/{set}/{id}/art.reconstructed.*`. */
export function listCuratedReconstructedFaces(
  cardsDir = curatedCardsDir(narutoCuratedDir()),
): CuratedReconstructedFace[] {
  const out: CuratedReconstructedFace[] = [];
  for (const hit of listCuratedSourceCardDirs(cardsDir)) {
    for (const name of readdirSync(hit.abs)) {
      if (!RECONSTRUCTED_FACE.test(name)) continue;
      const source = path.join(hit.abs, name);
      out.push({
        source,
        cardId: hit.diskId,
        lang: hit.lang,
        family: hit.family,
      });
    }
  }
  return out.sort((a, b) => a.source.localeCompare(b.source));
}

function warnLegacyReconstructedDir(): void {
  const legacy = path.join(narutoCuratedDir(), "reconstructed");
  if (!existsSync(legacy)) return;
  const leftover = readdirSync(legacy).filter((name) => /\.png$/i.test(name));
  if (leftover.length === 0) return;
  console.warn(
    "   leftover curated/reconstructed/*.png — move each face to " +
      "curated/cards/{lang}/{set}/{id}/art.reconstructed.png",
  );
}

function cardsDir(): string {
  return path.join(packRoot(), "cards");
}

/**
 * Full-card foil mask — a solid white plate.
 *
 * The pack has no per-print mask: these are flat scans, not a Unity dump. The
 * renderer falls back to `EffectPackModule.fallbackFoilMaskUrl`, so a plain
 * white plate means "the whole card shines", which is what a 2006 Carddass
 * holo actually did — the foil is under the entire face, not a shaped layer.
 * Generated rather than shipped: it is 64x64 of one colour.
 */
export async function installNarutoFullFoilMask(
  opts: { force?: boolean; dryRun?: boolean } = {},
): Promise<{ installed: boolean; dest: string }> {
  const dest = path.join(foilPackDir(NARUTO_PACK_ID), "full_foil_mask.webp");
  if (!opts.force && existsSync(dest)) return { installed: false, dest };
  if (opts.dryRun) return { installed: true, dest };
  mkdirSync(path.dirname(dest), { recursive: true });
  const rgba = Buffer.alloc(64 * 64 * 4, 255);
  await writeLosslessRgbaWebp(rgba, 64, 64, dest);
  return { installed: true, dest };
}

export async function ensureNarutoCuratedAssets(opts?: {
  dryRun?: boolean;
  force?: boolean;
}): Promise<{
  backInstalled: boolean;
  installs: ReconstructedInstall[];
}> {
  const backs = await installCuratedCardBacks({
    curatedCardsDir: curatedCardsDir(narutoCuratedDir()),
    destCardsDir: packCardsDir(NARUTO_PACK_ID),
    dryRun: opts?.dryRun,
    force: opts?.force,
    /** Set sleeves → `cards/{lang}/{set}/back.{lang}.webp` (lang-first). */
    mapDestRel: langFirstSetBackDestRel,
  });
  for (const row of backs) {
    if (!row.installed) continue;
    console.log(
      `   curated back → ${row.dest}${opts?.dryRun ? " (dry run)" : ""}`,
    );
  }
  const mask = await installNarutoFullFoilMask(opts ?? {});
  if (mask.installed) {
    console.log(
      `   foil mask → ${mask.dest}${opts?.dryRun ? " (dry run)" : ""}`,
    );
  }
  const installs = await installNarutoReconstructed(opts);
  if (!opts?.dryRun) {
    const pre = materializeS1FrPrereleaseIdenticalRetailFaces();
    for (const id of pre.installed) {
      console.log(`   prerelease identical retail → ${id}`);
    }
    for (const id of pre.missing) {
      console.log(`   prerelease identical retail MISS → ${id}`);
    }
    const peers = materializePeerRetailFaces();
    for (const id of peers.installed) {
      console.log(`   peer retail face → ${id}`);
    }
  }
  const yahoo = await installYahooAuctionFaces({
    dryRun: opts?.dryRun,
    force: opts?.force,
  });
  for (const key of yahoo.written) {
    console.log(`   curated yahoo → ${key}${opts?.dryRun ? " (dry run)" : ""}`);
  }
  for (const key of yahoo.failed) {
    console.log(`   curated yahoo FAIL → ${key}`);
  }
  const mercari = await installMercariFaces({
    dryRun: opts?.dryRun,
    force: opts?.force,
  });
  for (const key of mercari.written) {
    console.log(
      `   curated mercari → ${key}${opts?.dryRun ? " (dry run)" : ""}`,
    );
  }
  for (const key of mercari.failed) {
    console.log(`   curated mercari FAIL → ${key}`);
  }
  return {
    backInstalled: backs.some((row) => row.installed),
    installs,
  };
}

export type Box = { left: number; top: number; width: number; height: number };

/**
 * Bounding box of the opaque area, from a row-major alpha plane.
 *
 * An edge line is trimmed only when it holds NO opaque pixel at all. Requiring
 * a *fully* opaque line collapses the whole image: a 1px bleed down the left
 * and right edges puts a transparent pixel in every single row, so no row ever
 * qualifies and the box shrinks to one pixel — which then scales up to a blank
 * card, silently.
 */
export function opaqueBounds(
  alpha: Uint8Array | Buffer,
  width: number,
  height: number,
): Box {
  const opaque = (x: number, y: number): boolean =>
    alpha[y * width + x] === 255;
  const rowHasOpaque = (y: number): boolean => {
    for (let x = 0; x < width; x += 1) if (opaque(x, y)) return true;
    return false;
  };
  const colHasOpaque = (x: number): boolean => {
    for (let y = 0; y < height; y += 1) if (opaque(x, y)) return true;
    return false;
  };

  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = width - 1;
  while (top < bottom && !rowHasOpaque(top)) top += 1;
  while (bottom > top && !rowHasOpaque(bottom)) bottom -= 1;
  while (left < right && !colHasOpaque(left)) left += 1;
  while (right > left && !colHasOpaque(right)) right -= 1;

  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** Figma exports a 1px transparent bleed on some edges — trim it off. */
async function opaqueBox(
  image: Sharp,
  width: number,
  height: number,
): Promise<Box> {
  const { data } = await image
    .clone()
    .ensureAlpha()
    .extractChannel(3)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const box = opaqueBounds(data, width, height);

  // A correct trim removes a few pixels of bleed. Losing a tenth of the card
  // means the alpha plane is not what we assumed — refuse rather than write a
  // stretched sliver over a good file.
  if (box.width < width * 0.9 || box.height < height * 0.9) {
    throw new Error(
      `Refusing to crop ${width}x${height} down to ${box.width}x${box.height}: ` +
        `that is not a bleed trim. Check the alpha channel of the source PNG.`,
    );
  }
  return box;
}

/**
 * `sources/reconstructed-provenance.json` is a ledger of every reconstructed
 * face on disk, not a log of the last run. Unchanged cards are skipped as
 * fresh and never reach `installs`, so writing that array alone would silently
 * drop them: adding one card would leave a one-entry ledger. Merge on top of
 * what is already recorded, drop cards whose PNG is gone, and sort for stable
 * diffs.
 */
function provenanceKey(row: ReconstructedInstall): string {
  return `${row.cardId}:${row.lang}`;
}

function mergeProvenanceInstalls(
  installs: readonly ReconstructedInstall[],
): ReconstructedInstall[] {
  const byCard = new Map<string, ReconstructedInstall>();
  const ledger = narutoCuratedReconstructedProvenancePath();
  const curatedRoot = narutoCuratedDir();
  if (existsSync(ledger)) {
    try {
      const previous = JSON.parse(readFileSync(ledger, "utf8")) as {
        installs?: ReconstructedInstall[];
      };
      for (const row of previous.installs ?? []) {
        if (!row?.cardId || !row.source) continue;
        // A card whose source PNG was removed no longer belongs in the ledger.
        if (!existsSync(path.join(curatedRoot, row.source))) continue;
        const next = { ...row, lang: row.lang || "fr" };
        byCard.set(provenanceKey(next), next);
      }
    } catch {
      // Unreadable ledger: rebuild from this run rather than fail the install.
    }
  }
  for (const row of installs) byCard.set(provenanceKey(row), row);
  return [...byCard.values()].sort((a, b) =>
    provenanceKey(a).localeCompare(provenanceKey(b)),
  );
}

/**
 * Lang-first set for a curated reconstruct: S6 FR MIJ ledger, then
 * appearances, `prints.set_code`, existing disk folder, then promo/`s1`.
 */
export function reconstructedInstallSet(
  face: CuratedReconstructedFace,
  cardsRoot = cardsDir(),
): string {
  // Kana / DVD MIJ inserts — never park under s5 retail even if appearances
  // still list the Belgium twin first.
  if (face.lang === "fr" && isNarutoS6FrPrintedNumber(face.cardId)) {
    return "s6";
  }

  const apps = loadNarutoAppearancesFile(packRoot())?.appearances ?? {};
  const fromApp = appearanceSetsOf(apps[face.cardId]?.[face.lang]);
  if (fromApp.length) {
    const primary = primaryAppearanceSet(fromApp);
    if (primary) return primary;
  }

  const fromCatalog = setCodeFromPrintsCatalog(face.cardId);
  if (fromCatalog) return fromCatalog;

  const existing = resolveNarutoArtDiskSet({
    number: face.cardId,
    lang: face.lang,
    cardsRoot,
  });
  if (existing) return existing;

  return face.family === "promo" ? "promo" : "s1";
}

function setCodeFromPrintsCatalog(diskId: string): string | null {
  const dbPath = path.join(packRoot(), "catalog.sqlite");
  if (!existsSync(dbPath)) return null;
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const row = db
        .prepare(
          `SELECT set_code FROM prints
           WHERE lower(number) = lower(?)
           ORDER BY CASE
             WHEN set_code GLOB 's[0-9]*' THEN 0
             WHEN set_code = 'promo' THEN 1
             ELSE 2
           END, set_code
           LIMIT 1`,
        )
        .get(diskId) as { set_code?: string } | undefined;
      const set = row?.set_code?.trim().toLowerCase();
      return set || null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

function bumpPrintAssetArt(
  cardId: string,
  lang: string,
  setCode: string,
  artFile: string,
): void {
  const dbPath = path.join(packRoot(), "catalog.sqlite");
  if (!existsSync(dbPath)) return;
  const printKey = mintNarutoPrintKey(cardId, setCode);
  if (!printKey) return;
  try {
    const db = new DatabaseSync(dbPath);
    try {
      // Upsert: tourney promo FR often has JA-only assets until a reconstruct lands.
      db.prepare(
        `INSERT INTO print_assets (print_key, lang, art)
         VALUES (?, ?, ?)
         ON CONFLICT(print_key, lang) DO UPDATE SET art = excluded.art`,
      ).run(printKey, lang, artFile);
    } finally {
      db.close();
    }
  } catch {
    /* index rebuild will heal */
  }
}

export async function installNarutoReconstructed(opts?: {
  dryRun?: boolean;
  force?: boolean;
}): Promise<ReconstructedInstall[]> {
  warnLegacyReconstructedDir();

  const installs: ReconstructedInstall[] = [];
  let skippedFresh = 0;
  for (const face of listCuratedReconstructedFaces()) {
    const setCode = reconstructedInstallSet(face);
    const dest = path.join(
      cardsDir(),
      face.lang,
      setCode,
      face.cardId,
      RECONSTRUCTED_FILENAME,
    );

    if (!opts?.force && !opts?.dryRun && !curatedDestStale(face.source, dest)) {
      skippedFresh += 1;
      continue;
    }

    const image = sharp(face.source);
    const meta = await image.metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) {
      console.warn(`   ${face.cardId.padEnd(12)} SKIP — unreadable`);
      continue;
    }

    const box = await opaqueBox(image, width, height);
    const cropped = box.width !== width || box.height !== height;

    if (!opts?.dryRun) {
      mkdirSync(path.dirname(dest), { recursive: true });
      const raster = await sharp(face.source)
        .extract(box)
        .resize(RECONSTRUCTED_WIDTH, RECONSTRUCTED_HEIGHT, { fit: "fill" })
        .flatten({ background: "#ffffff" })
        .png()
        .toBuffer();
      await writeLosslessWebpFile(raster, dest);
      const legacyPng = path.join(path.dirname(dest), "art.reconstructed.png");
      if (existsSync(legacyPng)) unlinkSync(legacyPng);
      await promoteNarutoFace(path.dirname(dest), face.lang);
      bumpPrintAssetArt(face.cardId, face.lang, setCode, RECONSTRUCTED_FILENAME);
    }

    installs.push({
      cardId: face.cardId,
      set: setCode,
      lang: face.lang,
      source: path.relative(narutoCuratedDir(), face.source),
      dest: path.relative(packRoot(), dest),
      from: { width, height },
      cropped,
    });
    console.log(
      `   ${face.cardId.padEnd(12)} ${face.lang.padEnd(3)} ` +
        `${String(`${width}x${height}`).padEnd(11)}` +
        `→ ${RECONSTRUCTED_WIDTH}x${RECONSTRUCTED_HEIGHT}  ${setCode}` +
        `${cropped ? "  (bleed trimmed)" : ""}` +
        `${opts?.dryRun ? "  (dry run)" : ""}`,
    );
  }

  if (skippedFresh > 0 && installs.length === 0) {
    console.log(`   reconstructed: ${skippedFresh} up to date`);
  } else if (skippedFresh > 0) {
    console.log(`   reconstructed: ${skippedFresh} up to date, skipped`);
  }

  if (!opts?.dryRun && installs.length) {
    writeFileSync(
      narutoCuratedReconstructedProvenancePath(),
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          method:
            "AI restoration of an authenticated collector photo, then Figma retouching",
          sourcePhotos:
            "source.jpg next to art.reconstructed.png under curated/cards/{lang}/{set}/{id}/ " +
            "(Mercari restorations: the mercdn ingest row in sources/mercari.json)",
          note:
            "Displayed in place of the official face. The official file is kept on " +
            "disk and remains the authentic source; every field was proofread " +
            "against the collector photo (number, copyright, stats, badge).",
          installs: mergeProvenanceInstalls(installs),
        },
        null,
        1,
      )}\n`,
    );
  }

  return installs;
}

export async function runNarutoReconstructed(opts?: {
  dryRun?: boolean;
  force?: boolean;
}): Promise<void> {
  console.log(`── Naruto curated → data${opts?.dryRun ? " (dry run)" : ""}`);
  const { installs } = await ensureNarutoCuratedAssets(opts);
  console.log(`   ${installs.length} reconstructed installed`);
}
