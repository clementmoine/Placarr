/**
 * Convert legacy rasters under data/ to WebP.
 *
 * - Foil Unity dumps (PNG) → **lossless** WebP (pixel-exact shaders)
 * - Uploads (PNG + JPEG) → **q88** WebP (covers / photos)
 *
 * A raster whose longest side exceeds what WebP can address is reduced to fit
 * {@link OVERSIZED_MAX_SIDE} first, and reported as `shrunk`. It is the one case
 * where this script changes pixels rather than just the container.
 *
 *   pnpm media:to-webp
 *   pnpm media:to-webp -- --dry-run
 *   pnpm media:to-webp -- --foil-only
 *   pnpm media:to-webp -- --uploads-only
 *   pnpm media:to-webp -- --concurrency 12
 *
 * Also rewrites `data/lorcana/foil/manifest.json` texture `"file": "*.png"` → `.webp`.
 */

import { existsSync } from "node:fs";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  FETCHED_IMAGE_MAX_SIDE,
  WEBP_MAX_SIDE,
} from "@/lib/media/losslessWebp";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const UPLOAD_WEBP_QUALITY = 88;

type EncodeMode = "lossless" | "q88";

type Args = {
  dryRun: boolean;
  foilOnly: boolean;
  uploadsOnly: boolean;
  concurrency: number;
};

type Target = { src: string; dest: string; mode: EncodeMode };

/**
 * Shared with the acquisition path, so the ceiling a fetched image is held to
 * and the one this migration applies to what is already on disk cannot drift.
 * `OVERSIZED_MAX_SIDE` is only ever reached by images WebP could not hold at
 * all — see the constants for why 4096 is far more than anything asks for.
 */
const OVERSIZED_MAX_SIDE = FETCHED_IMAGE_MAX_SIDE;

function parseArgs(argv: string[]): Args {
  let concurrency = 8;
  const idx = argv.indexOf("--concurrency");
  if (idx >= 0) {
    const n = Number(argv[idx + 1]);
    if (Number.isFinite(n) && n >= 1) concurrency = Math.floor(n);
  }
  return {
    dryRun: argv.includes("--dry-run"),
    foilOnly: argv.includes("--foil-only"),
    uploadsOnly: argv.includes("--uploads-only"),
    concurrency,
  };
}

async function convertFile(
  src: string,
  dest: string,
  mode: EncodeMode,
  dryRun: boolean,
): Promise<{ before: number; after: number; shrunk: boolean }> {
  const before = statSync(src).size;
  if (dryRun) {
    return { before, after: before, shrunk: false };
  }
  // Some foil PNGs are truncated mid-extract (no IEND). `failOn: "none"` lets
  // libvips salvage what it can; prefer re-extract from CDN when possible.
  const pipeline = sharp(src, {
    animated: true,
    limitInputPixels: false,
    failOn: "none",
  }).rotate();

  // Measured after `rotate()`: EXIF orientation can swap the axes, and it is the
  // post-rotate side that WebP has to hold.
  const meta = await pipeline.metadata();
  const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
  const shrunk = longest > WEBP_MAX_SIDE;
  if (shrunk) {
    pipeline.resize({
      width: OVERSIZED_MAX_SIDE,
      height: OVERSIZED_MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const buf =
    mode === "lossless"
      ? await pipeline.webp({ lossless: true, effort: 4 }).toBuffer()
      : await pipeline
          .webp({ quality: UPLOAD_WEBP_QUALITY, effort: 4 })
          .toBuffer();
  mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp`;
  writeFileSync(tmp, buf);
  renameSync(tmp, dest);
  if (path.resolve(src) !== path.resolve(dest)) {
    unlinkSync(src);
  }
  return { before, after: buf.length, shrunk };
}

function walkFiles(dir: string, exts: Set<string>): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(cur);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (name.startsWith(".")) continue;
      const full = path.join(cur, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) stack.push(full);
      else if (exts.has(path.extname(name).toLowerCase())) out.push(full);
    }
  }
  return out;
}

function rewriteLorcanaManifest(dryRun: boolean): number {
  const manifestPath = path.join(ROOT, "data/lorcana/foil/manifest.json");
  if (!existsSync(manifestPath)) return 0;
  const raw = readFileSync(manifestPath, "utf8");
  const next = raw.replace(/"file": "([^"]+)\.png"/g, '"file": "$1.webp"');
  if (next === raw) return 0;
  if (!dryRun) writeFileSync(manifestPath, next, "utf8");
  return (raw.match(/"file": "[^"]+\.png"/g) || []).length;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targets: Target[] = [];
  const doFoil = !args.uploadsOnly;
  const doUploads = !args.foilOnly;

  if (doFoil) {
    const foilRoots = [
      path.join(ROOT, "data/pokemon/foil"),
      path.join(ROOT, "data/lorcana/foil"),
    ];
    for (const root of foilRoots) {
      for (const src of walkFiles(root, new Set([".png"]))) {
        const rel = path.relative(root, src).replace(/\\/g, "/");
        if (rel.startsWith("cards/") || rel.startsWith("web/")) continue;
        targets.push({
          src,
          dest: src.replace(/\.png$/i, ".webp"),
          mode: "lossless",
        });
      }
    }
  }

  if (doUploads) {
    const uploads = path.join(ROOT, "data/uploads");
    for (const src of walkFiles(uploads, new Set([".png", ".jpg", ".jpeg"]))) {
      targets.push({
        src,
        dest: src.replace(/\.(png|jpe?g)$/i, ".webp"),
        mode: "q88",
      });
    }
  }

  let converted = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;
  let failed = 0;
  let shrunk = 0;
  const t0 = Date.now();

  console.log(
    `media:to-webp — ${targets.length} file(s), concurrency=${args.concurrency}` +
      ` (foil=lossless, uploads=q${UPLOAD_WEBP_QUALITY})` +
      `${args.dryRun ? " (dry-run)" : ""}`,
  );

  await mapPool(targets, args.concurrency, async ({ src, dest, mode }) => {
    try {
      if (existsSync(dest) && path.resolve(src) !== path.resolve(dest)) {
        // Already have a webp sibling (e.g. foil mid-migration) — drop the raster.
        // Uploads that were previously written as lossless webp keep that file;
        // re-run with a dedicated reencode if you want q88 on those too.
        if (!args.dryRun) unlinkSync(src);
        converted += 1;
      } else {
        const result = await convertFile(src, dest, mode, args.dryRun);
        bytesBefore += result.before;
        bytesAfter += result.after;
        converted += 1;
        if (result.shrunk) {
          shrunk += 1;
          console.log(
            `  shrunk ${src}: over WebP's ${WEBP_MAX_SIDE}px limit, reduced to fit ${OVERSIZED_MAX_SIDE}px`,
          );
        }
      }
      if (converted % 500 === 0 || converted === 1) {
        const sec = ((Date.now() - t0) / 1000).toFixed(0);
        console.log(`  … ${converted}/${targets.length} (${sec}s)`);
      }
    } catch (err) {
      failed += 1;
      console.error(`  fail ${src}: ${(err as Error).message}`);
    }
  });

  const manifestN = doFoil ? rewriteLorcanaManifest(args.dryRun) : 0;
  const saved = bytesBefore - bytesAfter;
  console.log(
    `done: converted=${converted} shrunk=${shrunk} failed=${failed} ` +
      `bytes ${bytesBefore} → ${bytesAfter} (Δ ${saved}) ` +
      `manifest.png→webp=${manifestN} ` +
      `in ${((Date.now() - t0) / 1000).toFixed(0)}s`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
