/**
 * On-device card embeddings — same model, crop and descriptor contract as
 * the server index (`@/core/identify/embedMath`): DINOv2-small CLS on the
 * art band. Shards built by Sync are therefore directly comparable here.
 *
 * transformers.js + ONNX Runtime Web, WebGPU → WASM. Weights are served
 * from `/models/Xenova/dinov2-small/` (~88 MB fp32 / ~24 MB q8) and cached
 * by the browser after first load.
 */
import {
  CARD_EMBED_DIM,
  CARD_EMBED_MODEL,
  cardArtBandRect,
  cardEmbedResizeTarget,
  descriptorFromFeatures,
} from "@/core/identify/embedMath";
import { configureOrt, runOrtExclusive } from "@/lib/client/scan/ortRuntime";

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

const LOCAL_MODEL_PATH = "/models/";

/**
 * Execution device transformers.js will be given — the flavour of the
 * shared ONNX runtime (see `ortRuntime.ts`; "webgpu" only where the browser
 * can actually run ORT on the GPU).
 */
export async function resolveClientEmbedDevice(): Promise<"webgpu" | "wasm"> {
  return (await configureOrt()).flavour;
}

/**
 * Static files the pipeline will request for the current device — lets the
 * host page pull them into the HTTP cache without instantiating anything.
 */
export async function clientEmbedModelFiles(): Promise<string[]> {
  const base = `${LOCAL_MODEL_PATH}${resolveClientEmbedModel()}`;
  const device = await resolveClientEmbedDevice();
  return [
    `${base}/config.json`,
    `${base}/preprocessor_config.json`,
    `${base}/onnx/${device === "webgpu" ? "model.onnx" : "model_quantized.onnx"}`,
  ];
}

async function loadExtractor(): Promise<FeatureExtractor | null> {
  if (typeof window === "undefined") return null;
  const modelId = resolveClientEmbedModel();
  if (extractorPromise && loadedModelId === modelId) return extractorPromise;

  loadedModelId = modelId;
  extractorPromise = (async () => {
    try {
      // Shared ORT env must be configured before transformers.js evaluates
      // (it only fills in its CDN default when wasmPaths is still unset).
      await configureOrt();
      const { pipeline, env } = await import("@huggingface/transformers");
      // Weights are self-hosted under `/models/<id>/` (immutable, browser
      // Cache API afterwards) — the first open never depends on the hub.
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      env.localModelPath = LOCAL_MODEL_PATH;
      const device = await resolveClientEmbedDevice();
      // fp32 on GPU (exact server parity); q8 on CPU/WASM keeps phones
      // responsive — quality delta measured below noise on Lorcana FR.
      const pipe = await runOrtExclusive("dinov2:load", () =>
        pipeline("image-feature-extraction", modelId, {
          device,
          dtype: device === "webgpu" ? "fp32" : "q8",
        }),
      );
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

/** Art band pixels, already at the size the image processor resizes to. */
export type ArtBandPixels = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

/**
 * Same crop as the server's `extractCardArtBand` (sharp) — canvas edition,
 * in one pass: the band is drawn straight from the face bitmap at the
 * processor's resize target (`cardEmbedResizeTarget`), so there is no JPEG
 * to encode then decode and no full-resolution copy to resize afterwards.
 * The scaler is the same canvas `drawImage` transformers.js would have used.
 *
 * `upsideDown` reads the face rotated half a turn, for the card presented the
 * other way up (a card lying on its side has no "up" the user can see).
 */
async function cropArtBand(
  blob: Blob,
  upsideDown = false,
): Promise<ArtBandPixels | null> {
  const bitmap = await createImageBitmap(blob).catch(() => null);
  if (!bitmap) return null;
  try {
    const rect = cardArtBandRect(bitmap.width, bitmap.height);
    if (!rect) return null;
    const target = cardEmbedResizeTarget(rect.width, rect.height);
    if (!target) return null;
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    if (upsideDown) {
      ctx.translate(target.width, target.height);
      ctx.rotate(Math.PI);
    }
    ctx.drawImage(
      bitmap,
      upsideDown ? bitmap.width - rect.left - rect.width : rect.left,
      upsideDown ? bitmap.height - rect.top - rect.height : rect.top,
      rect.width,
      rect.height,
      0,
      0,
      target.width,
      target.height,
    );
    const { data } = ctx.getImageData(0, 0, target.width, target.height);
    return { data, width: target.width, height: target.height };
  } finally {
    bitmap.close();
  }
}

/** Embed a full card-face blob: art-band crop → DINOv2 CLS → unit vector. */
export async function embedCardFaceBlobClient(
  blob: Blob,
  opts?: { upsideDown?: boolean },
): Promise<Float32Array | null> {
  try {
    const extractor = await loadExtractor();
    if (!extractor) return null;
    const band = await cropArtBand(blob, opts?.upsideDown === true);
    if (!band) return null;
    const { RawImage } = await import("@huggingface/transformers");
    const image = new RawImage(band.data, band.width, band.height, 4);
    const out = await runOrtExclusive("dinov2:run", () => extractor(image));
    return descriptorFromFeatures(out?.data ?? [], CARD_EMBED_DIM);
  } catch (err) {
    console.warn("[cardEmbed.client] embed failed", err);
    return null;
  }
}
