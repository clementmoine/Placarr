/**
 * Refuse to identify when the frame clearly has no card (black lens cover,
 * empty table, blown-out wall). Honest empty > confident false positive.
 */
import sharp from "sharp";

export type CardFrameAssessment = {
  usable: boolean;
  reason?: "too_dark" | "too_bright" | "too_flat";
  mean: number;
  variance: number;
};

const SAMPLE = 64;

/**
 * Greyscale mean/variance on a tiny downscale — cheap live preflight.
 * Thresholds tuned to reject solid black / blank walls while keeping
 * typical table+card scenes (textured wood still has variance ≫ flat).
 */
export function assessLumaStats(
  gray: Uint8Array | Buffer,
): CardFrameAssessment {
  const n = gray.length;
  if (n < 16) {
    return { usable: false, reason: "too_flat", mean: 0, variance: 0 };
  }
  let sum = 0;
  for (let i = 0; i < n; i++) sum += gray[i]!;
  const mean = sum / n;
  let varSum = 0;
  for (let i = 0; i < n; i++) {
    const d = gray[i]! - mean;
    varSum += d * d;
  }
  const variance = varSum / n;

  if (mean < 28) {
    return { usable: false, reason: "too_dark", mean, variance };
  }
  if (mean > 245 && variance < 120) {
    return { usable: false, reason: "too_bright", mean, variance };
  }
  // Near-uniform (black cover, plain table under soft light, fogged lens).
  if (variance < 180) {
    return { usable: false, reason: "too_flat", mean, variance };
  }
  return { usable: true, mean, variance };
}

export async function assessIdentifyFrame(
  buffer: Buffer,
): Promise<CardFrameAssessment> {
  try {
    const { data } = await sharp(buffer)
      .resize(SAMPLE, SAMPLE, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return assessLumaStats(data);
  } catch {
    return { usable: false, reason: "too_flat", mean: 0, variance: 0 };
  }
}
