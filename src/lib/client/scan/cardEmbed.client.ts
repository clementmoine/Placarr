/**
 * MobileCLIP-S0 vision embeddings on-device (transformers.js + ort-web).
 *
 * Incompatible with server Xenova CLIP ViT-B/32 — Sync must rebuild shards
 * with the same model id before client NN is useful; until then identify
 * soft-falls back to the server automatically.
 */
import { l2Normalize } from "@/core/identify/embedMath";

export const MOBILECLIP_S0 = "Xenova/mobileclip_s0";
/** MobileCLIP-S0 image projection dim. */
export const MOBILECLIP_DIM = 512;

export function resolveClientEmbedModel(): string {
  return MOBILECLIP_S0;
}

type VisionBundle = {
  processor: {
    (image: unknown): Promise<Record<string, unknown>>;
  };
  vision: (inputs: Record<string, unknown>) => Promise<{
    image_embeds?: {
      data?: Float32Array | number[];
      normalize?: () => {
        data: Float32Array | number[];
        tolist?: () => number[][];
      };
    };
  }>;
};

let bundlePromise: Promise<VisionBundle | null> | null = null;
let loadedModelId: string | null = null;

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

async function loadBundle(): Promise<VisionBundle | null> {
  if (typeof window === "undefined") return null;
  const modelId = resolveClientEmbedModel();
  if (bundlePromise && loadedModelId === modelId) return bundlePromise;

  loadedModelId = modelId;
  bundlePromise = (async () => {
    try {
      const { AutoProcessor, CLIPVisionModelWithProjection, env } =
        await import("@huggingface/transformers");
      env.allowLocalModels = true;
      const device = await pickDevice();
      const processor = await AutoProcessor.from_pretrained(modelId);
      const vision = await CLIPVisionModelWithProjection.from_pretrained(
        modelId,
        {
          device,
          // Vision branch is quantization-sensitive (Xenova notes).
          dtype: "fp32",
        } as Parameters<
          typeof CLIPVisionModelWithProjection.from_pretrained
        >[1],
      );
      return {
        processor: processor as VisionBundle["processor"],
        vision: vision as VisionBundle["vision"],
      };
    } catch (err) {
      console.warn("[cardEmbed.client] load failed", err);
      loadedModelId = null;
      return null;
    }
  })().catch(() => {
    loadedModelId = null;
    return null;
  });
  return bundlePromise;
}

/** Prefetch MobileCLIP at camera start. Soft-fail. */
export async function prefetchCardEmbedClient(): Promise<void> {
  try {
    await loadBundle();
  } catch {
    /* soft */
  }
}

export function resetCardEmbedClient(): void {
  bundlePromise = null;
  loadedModelId = null;
}

export function clientEmbedModelId(): string {
  return loadedModelId ?? resolveClientEmbedModel();
}

export function clientEmbedDim(): number {
  return MOBILECLIP_DIM;
}

/**
 * Embed a card-face JPEG/PNG blob (caller should pass art-band crop when possible).
 */
export async function embedCardFaceBlobClient(
  blob: Blob,
): Promise<Float32Array | null> {
  try {
    const bundle = await loadBundle();
    if (!bundle) return null;
    const { RawImage } = await import("@huggingface/transformers");
    const image = await RawImage.read(blob);
    const inputs = await bundle.processor(image);
    const out = await bundle.vision(inputs);
    const embeds = out?.image_embeds;
    if (!embeds) return null;

    let data: Float32Array | number[] | undefined;
    if (typeof embeds.normalize === "function") {
      const normed = embeds.normalize();
      data = normed.data;
    } else {
      data = embeds.data;
    }
    if (!data || data.length < 8) return null;
    const vec = Float32Array.from(data);
    const dim = MOBILECLIP_DIM;
    const start = Math.max(0, vec.length - dim);
    return l2Normalize(vec.subarray(start, start + dim));
  } catch (err) {
    console.warn("[cardEmbed.client] embed failed", err);
    return null;
  }
}
