/**
 * Install hand-made card faces from
 * `src/providers/narutoccg/curated/reconstructed/<cardId>.png` into the catalogue
 * as `art.reconstructed.webp` under `data/naruto/ccg/cards/`.
 *
 * These are not scrape output: they are rebuilt by hand (AI restoration of a
 * collector photo, then Figma retouching) for cards whose official face is
 * missing, or whose official face is a crude errata scan carrying the burnt-in
 * `www.carddass.fr` watermark. They take display priority over the official
 * files — see `pickPreferredFaceArtFilename` — but never replace them on disk:
 * the official face stays as the authentic source, and the collector photo
 * stays in `curated/reconstructed/source-photos/` so the reconstruction remains
 * auditable.
 *
 * Normalisation applied: crop the fully-opaque bounding box (Figma exports a
 * 1px transparent bleed), scale to the official 843x1206, flatten to opaque.
 *
 * Synced automatically at the start of every `pnpm naruto:cards` / catalogue
 * extract (mtime vs `data/…/art.reconstructed.webp`). Explicit:
 *
 *   pnpm naruto:cards -- --only reconstruct
 *   pnpm naruto:cards -- --only reconstruct --dry-run
 *   pnpm naruto:cards -- --force   # rewrite even when dest is newer
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import sharp, { type Sharp } from "sharp";

import { dataRoot } from "@/lib/runtimeData";

import {
  narutoCuratedDir,
  narutoCuratedReconstructedDir,
} from "./curatedPaths";
import { NARUTO_PACK_ID } from "./indexStore";
import { isNarutoSetDir } from "./parseCarddassAsset";

/** Official S5 face geometry — every reconstruction is normalised to it. */
export const RECONSTRUCTED_WIDTH = 843;
export const RECONSTRUCTED_HEIGHT = 1206;

export const RECONSTRUCTED_FILENAME = "art.reconstructed.webp";

export type ReconstructedInstall = {
  cardId: string;
  set: string;
  source: string;
  dest: string;
  from: { width: number; height: number };
  cropped: boolean;
};

export { narutoCuratedDir };

function packRoot(): string {
  return path.join(dataRoot(), NARUTO_PACK_ID);
}

function reconstructedDir(): string {
  return narutoCuratedReconstructedDir();
}

function cardsDir(): string {
  return path.join(packRoot(), "cards");
}

/** True when dest is missing or older than the curated source. */
export function curatedDestStale(srcPath: string, destPath: string): boolean {
  if (!existsSync(destPath)) return true;
  return statSync(srcPath).mtimeMs > statSync(destPath).mtimeMs;
}

/**
 * Install curated pack back into `data/naruto/ccg/cards/back.webp`.
 * Source stays PNG in `curated/`; runtime copy is lossless WebP (same as
 * Lorcana / Pokémon dumps). Reinstalls when source is newer, or `force`.
 * Removes a leftover `back.png` after a successful write.
 */
export async function installNarutoCuratedBack(
  opts: { force?: boolean; dryRun?: boolean } = {},
): Promise<{ installed: boolean; dest: string | null }> {
  const src = path.join(narutoCuratedDir(), "back.png");
  const dest = path.join(cardsDir(), "back.webp");
  const legacyPng = path.join(cardsDir(), "back.png");
  if (!existsSync(src)) return { installed: false, dest: null };
  if (!opts.force && !curatedDestStale(src, dest)) {
    return { installed: false, dest };
  }
  if (opts.dryRun) return { installed: true, dest };
  mkdirSync(path.dirname(dest), { recursive: true });
  await sharp(src).webp({ lossless: true, effort: 6 }).toFile(dest);
  if (existsSync(legacyPng)) unlinkSync(legacyPng);
  const mdSrc = path.join(narutoCuratedDir(), "BACK.md");
  if (existsSync(mdSrc)) {
    copyFileSync(mdSrc, path.join(cardsDir(), "BACK.md"));
  }
  return { installed: true, dest };
}

/**
 * Sync curated pack back + reconstructed faces into `data/naruto/ccg/cards/`.
 * Idempotent: only rewrites when curated source is newer than dest (or `force`).
 * Called at the start of every pack update / extract so edits in
 * `curated/reconstructed/` are never left behind.
 */
export async function ensureNarutoCuratedAssets(opts?: {
  dryRun?: boolean;
  force?: boolean;
}): Promise<{
  backInstalled: boolean;
  installs: ReconstructedInstall[];
}> {
  const back = await installNarutoCuratedBack(opts);
  if (back.installed) {
    console.log(
      `   pack back → ${back.dest}${opts?.dryRun ? " (dry run)" : ""}`,
    );
  }
  const installs = await installNarutoReconstructed(opts);
  return { backInstalled: back.installed, installs };
}

/** Which series set already holds this card on disk (`s1`… / `promo`). */
function findSetForCard(cardId: string): string | undefined {
  const root = cardsDir();
  if (!existsSync(root)) return undefined;
  for (const set of readdirSync(root)) {
    if (!isNarutoSetDir(set)) continue;
    if (existsSync(path.join(root, set, "fr", cardId))) return set;
  }
  return undefined;
}

/**
 * A card that was never in the catalogue has no folder to read the set from.
 * Infer it from its numeric neighbours of the same type: `ni232` sits between
 * `ni231` and `ni233`, both in `s5`. Only accept an unambiguous answer —
 * a card straddling two sets is a judgement call, not a guess to automate.
 */
function inferSetFromNeighbours(cardId: string): string | undefined {
  const m = /^([a-z]+)(\d+)$/i.exec(cardId);
  if (!m) return undefined;
  const [, type, digits] = m;
  const target = Number.parseInt(digits!, 10);

  const root = cardsDir();
  if (!existsSync(root)) return undefined;

  let below: { n: number; set: string } | undefined;
  let above: { n: number; set: string } | undefined;
  for (const set of readdirSync(root)) {
    if (!isNarutoSetDir(set) || set === "promo") continue;
    const frDir = path.join(root, set, "fr");
    if (!existsSync(frDir)) continue;
    for (const entry of readdirSync(frDir)) {
      const em = new RegExp(`^${type}(\\d+)$`, "i").exec(entry);
      if (!em) continue;
      const n = Number.parseInt(em[1]!, 10);
      if (n < target && (!below || n > below.n)) below = { n, set };
      if (n > target && (!above || n < above.n)) above = { n, set };
    }
  }

  if (below && above && below.set === above.set) return below.set;
  return undefined;
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

export async function installNarutoReconstructed(opts?: {
  dryRun?: boolean;
  force?: boolean;
}): Promise<ReconstructedInstall[]> {
  const dir = reconstructedDir();
  if (!existsSync(dir)) {
    throw new Error(`Missing ${dir} — drop <cardId>.png files there first`);
  }

  const installs: ReconstructedInstall[] = [];
  let skippedFresh = 0;
  for (const name of readdirSync(dir).sort()) {
    if (!/\.png$/i.test(name)) continue;
    const cardId = name.replace(/\.png$/i, "");
    const existing = findSetForCard(cardId);
    const set = existing ?? inferSetFromNeighbours(cardId);
    if (!set) {
      console.warn(
        `   ${cardId.padEnd(12)} SKIP — no cards/*/fr/${cardId}/ and neighbours disagree on the set`,
      );
      continue;
    }

    const source = path.join(dir, name);
    const dest = path.join(
      cardsDir(),
      set,
      "fr",
      cardId,
      RECONSTRUCTED_FILENAME,
    );

    if (!opts?.force && !opts?.dryRun && !curatedDestStale(source, dest)) {
      skippedFresh += 1;
      continue;
    }

    const image = sharp(source);
    const meta = await image.metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) {
      console.warn(`   ${cardId.padEnd(12)} SKIP — unreadable`);
      continue;
    }

    const box = await opaqueBox(image, width, height);
    const cropped = box.width !== width || box.height !== height;

    if (!opts?.dryRun) {
      mkdirSync(path.dirname(dest), { recursive: true });
      await sharp(source)
        .extract(box)
        .resize(RECONSTRUCTED_WIDTH, RECONSTRUCTED_HEIGHT, { fit: "fill" })
        .flatten({ background: "#ffffff" })
        .webp({ lossless: true, effort: 6 })
        .toFile(dest);
      const legacyPng = path.join(path.dirname(dest), "art.reconstructed.png");
      if (existsSync(legacyPng)) unlinkSync(legacyPng);
    }

    installs.push({
      cardId,
      set,
      source: path.relative(narutoCuratedDir(), source),
      dest: path.relative(packRoot(), dest),
      from: { width, height },
      cropped,
    });
    console.log(
      `   ${cardId.padEnd(12)} ${String(`${width}x${height}`).padEnd(11)}` +
        `→ ${RECONSTRUCTED_WIDTH}x${RECONSTRUCTED_HEIGHT}  ${set}` +
        `${existing ? "" : "  (new card, set inferred)"}` +
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
      path.join(reconstructedDir(), "provenance.json"),
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          method:
            "AI restoration of an authenticated collector photo, then Figma retouching",
          sourcePhotos: "src/providers/narutoccg/curated/reconstructed/source-photos/",
          note:
            "Displayed in place of the official face. The official file is kept on " +
            "disk and remains the authentic source; every field was proofread " +
            "against the collector photo (number, copyright, stats, badge).",
          installs,
        },
        null,
        1,
      )}\n`,
    );
  }

  return installs;
}

export async function runNarutoReconstructedCli(opts?: {
  dryRun?: boolean;
  force?: boolean;
}): Promise<void> {
  console.log(
    `── Naruto curated → data${opts?.dryRun ? " (dry run)" : ""}`,
  );
  const { installs } = await ensureNarutoCuratedAssets(opts);
  console.log(`   ${installs.length} reconstructed installed`);
}
