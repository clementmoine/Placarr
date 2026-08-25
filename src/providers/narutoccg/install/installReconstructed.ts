/**
 * Install hand-made card faces from
 * `src/providers/narutoccg/curated/cards/{family}/{id}/{lang}/art.reconstructed.png`
 * into the catalogue as `art.reconstructed.webp` under
 * `data/naruto/carddass/cards/`.
 *
 * These are not scrape output: they are rebuilt by hand (AI restoration of a
 * collector photo, then Figma retouching) for cards whose official face is
 * missing, or whose official face is a crude errata scan carrying the burnt-in
 * `www.carddass.fr` watermark. They take display priority over the official
 * files — see `pickPreferredFaceArtFilename` — but never replace them on disk:
 * the official face stays as the authentic source, and the collector photo
 * stays beside the PNG as `source.jpg` so the reconstruction remains auditable.
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
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import sharp, { type Sharp } from "sharp";

import { packCardsDir } from "@/lib/packPaths";
import { dataRoot, foilPackDir } from "@/lib/runtimeData";
import {
  curatedCardsDir,
  curatedDestStale,
  installCuratedCardBacks,
} from "@/providers/shared/curatedCardsInstall";

import {
  narutoCuratedDir,
  narutoCuratedReconstructedProvenancePath,
} from "../curatedPaths";
import { installMercariFaces } from "./installMercariFaces";
import { installYahooAuctionFaces } from "./installYahooAuctionFaces";
import { NARUTO_PACK_ID } from "../packs";
import { listNarutoCardDirs } from "../narutoCardDisk";

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

export { curatedDestStale, narutoCuratedDir };

function packRoot(): string {
  return path.join(dataRoot(), NARUTO_PACK_ID);
}

/** Faces under `curated/cards/{family}/{id}/{lang}/art.reconstructed.*`. */
export function listCuratedReconstructedFaces(
  cardsDir = curatedCardsDir(narutoCuratedDir()),
): CuratedReconstructedFace[] {
  const out: CuratedReconstructedFace[] = [];
  for (const hit of listNarutoCardDirs(cardsDir)) {
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
      "curated/cards/{family}/{id}/{lang}/art.reconstructed.png",
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
  await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: "#ffffff",
    },
  })
    .webp({ lossless: true })
    .toFile(dest);
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

export async function installNarutoReconstructed(opts?: {
  dryRun?: boolean;
  force?: boolean;
}): Promise<ReconstructedInstall[]> {
  warnLegacyReconstructedDir();

  const installs: ReconstructedInstall[] = [];
  let skippedFresh = 0;
  for (const face of listCuratedReconstructedFaces()) {
    const dest = path.join(
      cardsDir(),
      face.family,
      face.cardId,
      face.lang,
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
      await sharp(face.source)
        .extract(box)
        .resize(RECONSTRUCTED_WIDTH, RECONSTRUCTED_HEIGHT, { fit: "fill" })
        .flatten({ background: "#ffffff" })
        .webp({ lossless: true, effort: 6 })
        .toFile(dest);
      const legacyPng = path.join(path.dirname(dest), "art.reconstructed.png");
      if (existsSync(legacyPng)) unlinkSync(legacyPng);
    }

    installs.push({
      cardId: face.cardId,
      set: face.family,
      lang: face.lang,
      source: path.relative(narutoCuratedDir(), face.source),
      dest: path.relative(packRoot(), dest),
      from: { width, height },
      cropped,
    });
    console.log(
      `   ${face.cardId.padEnd(12)} ${face.lang.padEnd(3)} ` +
        `${String(`${width}x${height}`).padEnd(11)}` +
        `→ ${RECONSTRUCTED_WIDTH}x${RECONSTRUCTED_HEIGHT}  ${face.family}` +
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
            "source.jpg next to art.reconstructed.png under curated/cards/{family}/{id}/{lang}/",
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

export async function runNarutoReconstructedCli(opts?: {
  dryRun?: boolean;
  force?: boolean;
}): Promise<void> {
  console.log(`── Naruto curated → data${opts?.dryRun ? " (dry run)" : ""}`);
  const { installs } = await ensureNarutoCuratedAssets(opts);
  console.log(`   ${installs.length} reconstructed installed`);
}
