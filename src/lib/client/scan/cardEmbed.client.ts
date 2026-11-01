/**
 * On-device card embeddings — same model, crop and descriptor contract as
 * the server index (`@/core/identify/embedMath`): DINOv2-small CLS on the
 * art band. Shards built by Sync are therefore directly comparable here.
 *
 * transformers.js + ONNX Runtime Web, WebGPU → WASM. Weights are cached by
 * the browser after first load (~88 MB fp32 / ~24 MB q8).
 */
import {
  CARD_EMBED_DIM,
  CARD_EMBED_MODEL,
  cardArtBandRect,
  descriptorFromFeatures,
} from "@/core/identify/embedMath";

export function resolveClientEmbedModel(): string {
  return CARD_EMBED_MODEL;
}

type FeatureExtractor = (
  input: unknown,
) => Promise<{ data: Float32Array | number[]; dims?: number[] }>;

let extractorPromise: Promise<FeatureExtractor | null> | null = null;
let loadedModelId: string | null = null;
let extractorReady = false;

/**
 * True once the pipeline is built. Identify must not wait for an 88 MB
 * download on first open — it answers from the server until this flips.
 */
export function isCardEmbedClientReady(): boolean {
  return extractorReady;
}

async function pickDevice(): Promise<"webgpu" | "wasm"> {
  if (typeof navigator !== "undefined" && "gpu" in navigator) {
    try {
      const adapter = await (
        navigator as Navigator & {
          gpu?: { requestAdapter: () => Promise<unknown> };
        }
      ).gpu?.requestAdapter();
      if (adapter) return "webgpu";
    } catch {
      /* fall through */
    }
  }
  return "wasm";
}

async function loadExtractor(): Promise<FeatureExtractor | null> {
  if (typeof window === "undefined") return null;
  const modelId = resolveClientEmbedModel();
  if (extractorPromise && loadedModelId === modelId) return extractorPromise;

  loadedModelId = modelId;
  extractorPromise = (async () => {
    try {
      const { pipeline, env } = await import("@huggingface/transformers");
      // Weights come from the hub (browser Cache API afterwards); skipping
      // the `/models/<id>` probe avoids a 404 round-trip per file.
      env.allowLocalModels = false;
      const device = await pickDevice();
      // fp32 on GPU (exact server parity); q8 on CPU/WASM keeps phones
      // responsive — quality delta measured below noise on Lorcana FR.
      const pipe = await pipeline("image-feature-extraction", modelId, {
        device,
        dtype: device === "webgpu" ? "fp32" : "q8",
      });
      extractorReady = true;
      return pipe as unknown as FeatureExtractor;
    } catch (err) {
      console.warn("[cardEmbed.client] load failed", err);
      loadedModelId = null;
      return null;
    }
  })().catch(() => {
    loadedModelId = null;
    return null;
  });
  return extractorPromise;
}

/** Prefetch the embed model at camera start. Soft-fail. */
export async function prefetchCardEmbedClient(): Promise<void> {
  try {
    await loadExtractor();
  } catch {
    /* soft */
  }
}

export function resetCardEmbedClient(): void {
  extractorPromise = null;
  loadedModelId = null;
  extractorReady = false;
}

export function clientEmbedModelId(): string {
  return loadedModelId ?? resolveClientEmbedModel();
}

export function clientEmbedDim(): number {
  return CARD_EMBED_DIM;
}

/** Same crop as the server's `extractCardArtBand` (sharp) — canvas edition. */
async function cropArtBand(blob: Blob): Promise<Blob | null> {
  const bitmap = await createImageBitmap(blob).catch(() => null);
  if (!bitmap) return null;
  try {
    const rect = cardArtBandRect(bitmap.width, bitmap.height);
    if (!rect) return null;
    const canvas = document.createElement("canvas");
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(
      bitmap,
      rect.left,
      rect.top,
      rect.width,
      rect.height,
      0,
      0,
      rect.width,
      rect.height,
    );
    return new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9),
    );
  } finally {
    bitmap.close();
  }
}

/** Embed a full card-face blob: art-band crop → DINOv2 CLS → unit vector. */
export async function embedCardFaceBlobClient(
  blob: Blob,
): Promise<Float32Array | null> {
  try {
    const extractor = await loadExtractor();
    if (!extractor) return null;
    const band = await cropArtBand(blob);
    if (!band) return null;
    const { RawImage } = await import("@huggingface/transformers");
    const image = await RawImage.read(band);
    const out = await extractor(image);
    return descriptorFromFeatures(out?.data ?? [], CARD_EMBED_DIM);
  } catch (err) {
    console.warn("[cardEmbed.client] embed failed", err);
    return null;
  }
}
