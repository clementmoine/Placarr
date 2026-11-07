/**
 * Crop studio-style product photos: light grey (or off-white) matte around a
 * card / sticker, flood-filled from the corners so residual wedges after a
 * slight tilt are painted out rather than left in the AABB.
 *
 * Opt-in only — same contract as {@link trimLightImageMargins}: callers that
 * want provenance-preserving copies leave the buffer alone.
 */
import sharp from "sharp";

const DEFAULT_COLOR_DELTA = 30;
const SEED_SIZE = 10;
const MIN_CROP_PIXELS = 8;
const MIN_RETAINED_RATIO = 0.35;
/** Need a meaningful matte; tiny margins are left alone. */
const MIN_BG_RATIO = 0.04;
const MAX_PIXELS = 16_000_000;

export type StudioMatteCropOptions = {
  /** Per-channel max distance from the corner seed (default 30). */
  colorDelta?: number;
  /** Fill residual matte inside the crop (default white). */
  fillRgb?: readonly [number, number, number];
};

function seedMean(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  sx: number,
  sy: number,
  size: number,
): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const x1 = Math.min(width, sx + size);
  const y1 = Math.min(height, sy + size);
  for (let y = sy; y < y1; y += 1) {
    for (let x = sx; x < x1; x += 1) {
      const o = (y * width + x) * channels;
      r += data[o] ?? 0;
      g += data[o + 1] ?? 0;
      b += data[o + 2] ?? 0;
      n += 1;
    }
  }
  return n ? [r / n, g / n, b / n] : [255, 255, 255];
}

function nearSeed(
  data: Buffer,
  offset: number,
  seed: readonly [number, number, number],
  delta: number,
): boolean {
  const r = data[offset] ?? 0;
  const g = data[offset + 1] ?? 0;
  const b = data[offset + 2] ?? 0;
  return (
    Math.abs(r - seed[0]) <= delta &&
    Math.abs(g - seed[1]) <= delta &&
    Math.abs(b - seed[2]) <= delta
  );
}

/**
 * Flood-fill matte from the four corners, crop to the subject AABB, and paint
 * leftover matte pixels inside that box. Returns the original buffer when there
 * is no useful matte to remove.
 */
export async function cropStudioMatte(
  buffer: Buffer,
  options: StudioMatteCropOptions = {},
): Promise<Buffer> {
  const delta = options.colorDelta ?? DEFAULT_COLOR_DELTA;
  const fill = options.fillRgb ?? ([255, 255, 255] as const);

  try {
    const image = sharp(buffer).rotate();
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.format === "gif" ||
      metadata.format === "svg" ||
      (metadata.pages ?? 1) > 1 ||
      metadata.width * metadata.height > MAX_PIXELS
    ) {
      return buffer;
    }

    const { data, info } = await image
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width: w, height: h, channels: ch } = info;
    const bg = new Uint8Array(w * h);

    const seeds: { x: number; y: number; color: [number, number, number] }[] = [
      { x: 0, y: 0, color: seedMean(data, w, h, ch, 0, 0, SEED_SIZE) },
      {
        x: w - 1,
        y: 0,
        color: seedMean(data, w, h, ch, Math.max(0, w - SEED_SIZE), 0, SEED_SIZE),
      },
      {
        x: 0,
        y: h - 1,
        color: seedMean(data, w, h, ch, 0, Math.max(0, h - SEED_SIZE), SEED_SIZE),
      },
      {
        x: w - 1,
        y: h - 1,
        color: seedMean(
          data,
          w,
          h,
          ch,
          Math.max(0, w - SEED_SIZE),
          Math.max(0, h - SEED_SIZE),
          SEED_SIZE,
        ),
      },
    ];

    const stack: number[] = [];
    for (const s of seeds) {
      const i = s.y * w + s.x;
      const o = i * ch;
      if (!bg[i] && nearSeed(data, o, s.color, delta)) {
        bg[i] = 1;
        stack.push(i);
      }
    }

    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i / w) | 0;
      const px: [number, number, number] = [
        data[i * ch] ?? 0,
        data[i * ch + 1] ?? 0,
        data[i * ch + 2] ?? 0,
      ];
      let best = seeds[0]!.color;
      let bestD = Infinity;
      for (const s of seeds) {
        const d =
          Math.abs(px[0] - s.color[0]) +
          Math.abs(px[1] - s.color[1]) +
          Math.abs(px[2] - s.color[2]);
        if (d < bestD) {
          bestD = d;
          best = s.color;
        }
      }
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ] as const) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (bg[ni]) continue;
        if (!nearSeed(data, ni * ch, best, delta)) continue;
        bg[ni] = 1;
        stack.push(ni);
      }
    }

    let bgCount = 0;
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (bg[y * w + x]) {
          bgCount += 1;
          continue;
        }
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    if (maxX < minX || maxY < minY) return buffer;
    const bgRatio = bgCount / (w * h);
    if (bgRatio < MIN_BG_RATIO) return buffer;

    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    if (cropW === w && cropH === h && bgRatio < 0.08) return buffer;
    if (
      cropW / w < MIN_RETAINED_RATIO ||
      cropH / h < MIN_RETAINED_RATIO
    ) {
      return buffer;
    }
    const removedX = w - cropW;
    const removedY = h - cropH;
    if (removedX < MIN_CROP_PIXELS && removedY < MIN_CROP_PIXELS && bgRatio < 0.12) {
      return buffer;
    }

    const out = Buffer.alloc(cropW * cropH * 3);
    for (let y = 0; y < cropH; y += 1) {
      for (let x = 0; x < cropW; x += 1) {
        const sx = minX + x;
        const sy = minY + y;
        const si = sy * w + sx;
        const oo = (y * cropW + x) * 3;
        if (bg[si]) {
          out[oo] = fill[0];
          out[oo + 1] = fill[1];
          out[oo + 2] = fill[2];
          continue;
        }
        const so = si * ch;
        out[oo] = data[so] ?? 0;
        out[oo + 1] = data[so + 1] ?? 0;
        out[oo + 2] = data[so + 2] ?? 0;
      }
    }

    const format = metadata.format;
    const pipeline = sharp(out, {
      raw: { width: cropW, height: cropH, channels: 3 },
    });
    if (format === "png") return pipeline.png().toBuffer();
    if (format === "webp") return pipeline.webp({ quality: 90 }).toBuffer();
    return pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  } catch {
    return buffer;
  }
}
