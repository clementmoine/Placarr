/**
 * Pure embedding math — client-safe (no sharp / transformers imports).
 * Shared by server CLIP index and on-device MobileCLIP matching.
 */

export const CARD_EMBED_MODEL = "Xenova/clip-vit-base-patch32";
export const CARD_EMBED_DIM = 512;

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
