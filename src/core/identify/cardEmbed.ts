/**
 * DINOv2 vision embeddings for cardboard ID (art-band → CLS vector).
 *
 * Apache-2.0 stack via `@huggingface/transformers` + Xenova ONNX weights —
 * not CollectorVision (AGPL). Lazy-loaded; first call downloads the model.
 * Model / pooling / crop contract lives in `embedMath.ts` (shared with the
 * browser path so server shards and on-device queries share one space).
 */
import { prepareEmbedImageBuffer } from "@/core/enrich/media/imageAssets";
import {
  CARD_EMBED_DIM,
  CARD_EMBED_MODEL,
  descriptorFromFeatures,
} from "@/core/identify/embedMath";
import { runServerOrtExclusive } from "@/lib/server/ortExclusive";

export {
  CARD_EMBED_DIM,
  CARD_EMBED_MODEL,
  cosineSimilarity,
  cosineToDistance,
  l2Normalize,
} from "@/core/identify/embedMath";

type FeatureExtractor = (
  input: unknown,
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
        { dtype: "fp32" },
      );
      return pipe as unknown as FeatureExtractor;
    })().catch((err) => {
      extractorPromise = null;
      throw err;
    });
  }
  return extractorPromise;
}

/** Warm the embed ONNX session (route boot) — soft-fails like paddle prefetch. */
export async function prefetchCardEmbed(): Promise<void> {
  try {
    await loadExtractor();
  } catch (err) {
    console.warn("[cardEmbed] prefetch failed", err);
  }
}

async function embedJpegBytes(jpeg: Buffer): Promise<Float32Array | null> {
  try {
    // Same native ORT as PP-OCR — never overlap a run (see ortExclusive.ts).
    return await runServerOrtExclusive(async () => {
      const { RawImage } = await import("@huggingface/transformers");
      const extractor = await loadExtractor();
      // Transformers.js RawImage.read accepts Blob / path / URL — not Uint8Array.
      const image = await RawImage.read(new Blob([new Uint8Array(jpeg)]));
      // No `pool` (ONNX export has no pooler head): CLS token, see embedMath.
      const out = await extractor(image);
      return descriptorFromFeatures(out?.data ?? [], CARD_EMBED_DIM);
    });
  } catch {
    return null;
  }
}

/** Embed a full card face after art-band crop (must match index build). */
export async function embedCardFaceBuffer(
  buffer: Buffer,
): Promise<Float32Array | null> {
  const band = await prepareEmbedImageBuffer(buffer, { cropMode: "artBand" });
  if (!band) return null;
  return embedJpegBytes(band);
}

/** Embed an already-cropped art JPEG/PNG buffer (index build path). */
export async function embedArtBandBuffer(
  buffer: Buffer,
): Promise<Float32Array | null> {
  return embedJpegBytes(buffer);
}

/**
 * Embed a sealed packshot (or any full-frame image) with no CARD_ART_BAND crop.
 * Product indexes must use this — never {@link embedCardFaceBuffer}.
 */
export async function embedFullFrameBuffer(
  buffer: Buffer,
): Promise<Float32Array | null> {
  const frame = await prepareEmbedImageBuffer(buffer, { cropMode: "full" });
  if (!frame) return null;
  return embedJpegBytes(frame);
}
