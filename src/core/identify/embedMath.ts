/**
 * Pure embedding math + model contract — client-safe (no sharp / ORT).
 * Shared by the server index build, the identify route and on-device NN.
 *
 * Model: DINOv2-small (Meta, Apache-2.0), CLS token, 384-d. Chosen on the
 * Lorcana FR pack (3 462 arts, 150 phone-degraded queries): 4 true errors vs
 * 41 for CLIP ViT-B/32, #1–#2 margin p50 124 vs 33 milli. CLIP is a semantic
 * model; instance re-identification is DINO's job.
 */

export const CARD_EMBED_MODEL = "Xenova/dinov2-small";
export const CARD_EMBED_DIM = 384;

/**
 * Art band crop (fractions of the card face). Must be identical on index
 * build and query, server and client — the vector space depends on it.
 */
export const CARD_ART_BAND = {
  left: 0.08,
  top: 0.12,
  width: 0.84,
  height: 0.48,
} as const;

export function cardArtBandRect(
  width: number,
  height: number,
): { left: number; top: number; width: number; height: number } | null {
  if (width < 32 || height < 32) return null;
  const left = Math.floor(width * CARD_ART_BAND.left);
  const top = Math.floor(height * CARD_ART_BAND.top);
  const cropW = Math.max(16, Math.floor(width * CARD_ART_BAND.width));
  const cropH = Math.max(16, Math.floor(height * CARD_ART_BAND.height));
  return {
    left,
    top,
    width: Math.min(cropW, width - left),
    height: Math.min(cropH, height - top),
  };
}

/**
 * Image-processor geometry of the model (`preprocessor_config.json`:
 * `size.shortest_edge` / `crop_size`). Locked by `embedMath.test.ts` against
 * the self-hosted config so the two cannot drift apart.
 */
export const CARD_EMBED_PREPROCESS = {
  shortestEdge: 256,
  cropSize: 224,
} as const;

/**
 * Size the processor resizes an art band to before its centre crop — same
 * arithmetic as transformers.js `get_resize_output_image_size` for a
 * `shortest_edge` size (scale so the short side hits 256; `toFixed(2)` then
 * floor on each side). A band drawn at exactly this size makes the
 * processor's own resize a no-op, so the client can crop + scale the camera
 * face in one canvas pass instead of encoding a JPEG for it to decode.
 */
export function cardEmbedResizeTarget(
  width: number,
  height: number,
): { width: number; height: number } | null {
  if (!(width > 0) || !(height > 0)) return null;
  const edge = CARD_EMBED_PREPROCESS.shortestEdge;
  const factor = Math.max(edge / width, edge / height);
  return {
    width: Math.floor(Number((width * factor).toFixed(2))),
    height: Math.floor(Number((height * factor).toFixed(2))),
  };
}

/** L2-normalize in place (defensive — pipeline may already normalize). */
export function l2Normalize(vec: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i]! * vec[i]!;
  const norm = Math.sqrt(sum);
  if (!(norm > 0)) return vec;
  for (let i = 0; i < vec.length; i++) vec[i]! /= norm;
  return vec;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i]! * b[i]!;
  return dot;
}

/**
 * Dissimilarity for API/UI: lower is better, same direction as Hamming.
 * `round((1 - cosine) * 1000)` → cosine 0.90 → 100; 0.75 → 250.
 */
export function cosineToDistance(cosine: number): number {
  return Math.max(0, Math.round((1 - cosine) * 1000));
}

/**
 * Take the descriptor out of a transformers.js `image-feature-extraction`
 * tensor. DINOv2 returns `last_hidden_state` `[1, tokens, dim]`: the
 * descriptor is the **CLS token = first `dim` values** (mean-pooling the
 * patches drops Lorcana R@1 from 97 % to 15 %). A pooled `[1, dim]` output
 * reads identically.
 */
export function descriptorFromFeatures(
  data: ArrayLike<number>,
  dim: number = CARD_EMBED_DIM,
): Float32Array | null {
  if (!data || data.length < dim) return null;
  const vec = Float32Array.from(Array.prototype.slice.call(data, 0, dim));
  return l2Normalize(vec);
}
