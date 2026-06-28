import sharp from "sharp";

import type { CoverExposureMetrics } from "@/lib/media/coverExposure";

const DARK_LUMINANCE = 80;
const SAMPLE_MAX_EDGE = 128;

export function measureCoverExposureFromBuffer(
  buffer: Buffer,
): Promise<CoverExposureMetrics | null> {
  return measureCoverExposureFromSharp(sharp(buffer).rotate());
}

async function measureCoverExposureFromSharp(
  image: sharp.Sharp,
): Promise<CoverExposureMetrics | null> {
  try {
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) return null;

    const longest = Math.max(metadata.width, metadata.height);
    const scale =
      longest > SAMPLE_MAX_EDGE ? SAMPLE_MAX_EDGE / longest : 1;
    const sampleWidth = Math.max(1, Math.round(metadata.width * scale));
    const sampleHeight = Math.max(1, Math.round(metadata.height * scale));

    const { data, info } = await image
      .clone()
      .resize(sampleWidth, sampleHeight, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let luminanceSum = 0;
    let darkCount = 0;
    let total = 0;
    const channels = info.channels;

    for (let offset = 0; offset < data.length; offset += channels) {
      const red = data[offset] ?? 0;
      const green = data[offset + 1] ?? 0;
      const blue = data[offset + 2] ?? 0;
      const alpha = data[offset + 3] ?? 255;
      if (alpha < 12) continue;

      const luminance = (red + green + blue) / 3;
      luminanceSum += luminance;
      total += 1;
      if (luminance < DARK_LUMINANCE) darkCount += 1;
    }

    if (total <= 0) return null;

    return {
      meanLuminance: luminanceSum / total,
      darkPixelRatio: darkCount / total,
    };
  } catch {
    return null;
  }
}
