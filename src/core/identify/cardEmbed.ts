/**
 * CLIP vision embeddings for cardboard ID (art-band → vector).
 *
 * Apache-2.0 stack via `@huggingface/transformers` + Xenova ONNX weights —
 * not CollectorVision (AGPL). Lazy-loaded; first call downloads the model.
 */
import { extractCardArtBand } from "@/core/enrich/media/imageAssets";
import {
  CARD_EMBED_DIM,
  CARD_EMBED_MODEL,
  l2Normalize,
} from "@/core/identify/embedMath";

export {
  CARD_EMBED_DIM,
  CARD_EMBED_MODEL,
  cosineSimilarity,
  cosineToDistance,
  l2Normalize,
} from "@/core/identify/embedMath";

type FeatureExtractor = (
  input: unknown,
  options?: { pooling?: string; normalize?: boolean },
) => Promise<{ data: Float32Array | number[]; dims?: number[] }>;

let extractorPromise: Promise<FeatureExtractor> | null = null;

async function loadExtractor(): Promise<FeatureExtractor> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      // Node: keep weights under the project cache, not a global home dir.
      env.cacheDir =
        process.env.TRANSFORMERS_CACHE?.trim() ||
        `${process.cwd()}/.cache/transformers`;
      env.allowLocalModels = true;
      const pipe = await pipeline(
        "image-feature-extraction",
        CARD_EMBED_MODEL,
        { dtype: "q8" },
      );
      return pipe as unknown as FeatureExtractor;
    })().catch((err) => {
      extractorPromise = null;
      throw err;
    });
  }
  return extractorPromise;
}

/** Warm CLIP ONNX (route boot) — soft-fails like paddle prefetch. */
export async function prefetchCardEmbed(): Promise<void> {
  try {
    await loadExtractor();
  } catch (err) {
    console.warn("[cardEmbed] prefetch failed", err);
  }
}

async function embedJpegBytes(jpeg: Buffer): Promise<Float32Array | null> {
  try {
    const { RawImage } = await import("@huggingface/transformers");
    const extractor = await loadExtractor();
    // Transformers.js RawImage.read accepts Blob / path / URL — not Uint8Array.
    const image = await RawImage.read(new Blob([new Uint8Array(jpeg)]));
    const out = await extractor(image, { pooling: "mean", normalize: true });
    const data = out?.data;
    if (!data || data.length < 8) return null;
    const vec = Float32Array.from(data);
    // Mean-pool may yield [1, dim]; take the trailing CARD_EMBED_DIM.
    const start = Math.max(0, vec.length - CARD_EMBED_DIM);
    return l2Normalize(vec.subarray(start, start + CARD_EMBED_DIM));
  } catch {
    return null;
  }
}

/** Embed a full card face after art-band crop (must match index build). */
export async function embedCardFaceBuffer(
  buffer: Buffer,
): Promise<Float32Array | null> {
  const band = await extractCardArtBand(buffer);
  if (!band) return null;
  return embedJpegBytes(band);
}

/** Embed an already-cropped art JPEG/PNG buffer (index build path). */
export async function embedArtBandBuffer(
  buffer: Buffer,
): Promise<Float32Array | null> {
  return embedJpegBytes(buffer);
}
