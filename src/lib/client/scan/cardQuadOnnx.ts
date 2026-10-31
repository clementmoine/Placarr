/**
 * DocAligner LCNet corner detector (Apache-2.0 weights).
 *
 * Classical Sobel remains the sync always-on path. DocAligner runs async when
 * enabled (default: on, unless `localStorage.placarr.scan.docaligner=0`) and
 * the ~4.5 MB ONNX is reachable under `/models/…`.
 *
 * Loads `onnxruntime-web` + weights lazily (IndexedDB cache). Not CollectorVision
 * / Cornelius (AGPL).
 */

import { isDocAlignerEnabled } from "@/lib/client/scan/scanDebugStore";

/** Official DocAligner 1.1.1 LCNet-100 heatmap (matches GitHub release name). */
export const DEFAULT_DOCALIGNER_URL =
  "/models/lcnet100_h_e_bifpn_256_fp32.onnx";

export type OnnxQuadPoint = { x: number; y: number };

export type OnnxQuadResult = {
  /** TL→TR→BR→BL in source pixel space. */
  corners: [OnnxQuadPoint, OnnxQuadPoint, OnnxQuadPoint, OnnxQuadPoint];
  confidence: number;
  source: "onnx";
};

type OrtSession = {
  inputNames: string[];
  outputNames: string[];
  run: (
    feeds: Record<string, unknown>,
  ) => Promise<Record<string, { data: Float32Array; dims: number[] }>>;
};

type OrtModule = {
  InferenceSession: {
    create: (
      path: string | Uint8Array,
      opts?: { executionProviders?: string[] },
    ) => Promise<OrtSession>;
  };
  Tensor: new (
    type: string,
    data: Float32Array,
    dims: number[],
  ) => unknown;
  env?: { wasm?: { wasmPaths?: string; numThreads?: number } };
};

const IDB_NAME = "placarr-scan-models";
const IDB_STORE = "onnx";
const INPUT_SIZE = 256;

let sessionPromise: Promise<OrtSession | null> | null = null;
let ortModule: OrtModule | null = null;

function modelUrl(): string {
  if (typeof window === "undefined") return DEFAULT_DOCALIGNER_URL;
  try {
    return (
      window.localStorage.getItem("placarr.scan.docalignerUrl") ||
      DEFAULT_DOCALIGNER_URL
    );
  } catch {
    return DEFAULT_DOCALIGNER_URL;
  }
}

async function idbGet(key: string): Promise<ArrayBuffer | null> {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      try {
        const db = req.result;
        const tx = db.transaction(IDB_STORE, "readonly");
        const get = tx.objectStore(IDB_STORE).get(key);
        get.onsuccess = () => resolve((get.result as ArrayBuffer) ?? null);
        get.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    };
  });
}

async function idbSet(key: string, buf: ArrayBuffer): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  return new Promise((resolve) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onerror = () => resolve();
    req.onsuccess = () => {
      try {
        const db = req.result;
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(buf, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    };
  });
}

async function loadOrt(): Promise<OrtModule | null> {
  if (ortModule) return ortModule;
  try {
    const mod = (await import("onnxruntime-web")) as unknown as OrtModule;
    // Host WASM from the package CDN so Next does not need copied .wasm files.
    if (mod.env?.wasm) {
      mod.env.wasm.wasmPaths =
        "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/";
      mod.env.wasm.numThreads = 1;
    }
    ortModule = mod;
    return mod;
  } catch {
    return null;
  }
}

async function fetchModelBytes(url: string): Promise<Uint8Array | null> {
  const cached = await idbGet(url);
  if (cached) return new Uint8Array(cached);
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    void idbSet(url, buf);
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

async function getSession(): Promise<OrtSession | null> {
  if (!isDocAlignerEnabled()) return null;
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await loadOrt();
      if (!ort) return null;
      const bytes = await fetchModelBytes(modelUrl());
      if (!bytes) return null;
      try {
        return await ort.InferenceSession.create(bytes, {
          executionProviders: ["wasm"],
        });
      } catch {
        return null;
      }
    })();
  }
  return sessionPromise;
}

/** Soft-warm session after camera start (no-op when disabled / missing). */
export async function prefetchDocAligner(): Promise<void> {
  await getSession();
}

function rgbaToNchw256(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Float32Array {
  const size = INPUT_SIZE;
  const out = new Float32Array(1 * 3 * size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = Math.min(width - 1, Math.floor((x / size) * width));
      const sy = Math.min(height - 1, Math.floor((y / size) * height));
      const o = (sy * width + sx) * 4;
      const i = y * size + x;
      out[i] = (data[o] ?? 0) / 255;
      out[size * size + i] = (data[o + 1] ?? 0) / 255;
      out[2 * size * size + i] = (data[o + 2] ?? 0) / 255;
    }
  }
  return out;
}

function heatmapCentroids(
  heat: Float32Array,
  dims: number[],
  threshold = 0.25,
): OnnxQuadPoint[] | null {
  let channels = 4;
  let h = 64;
  let w = 64;
  let planar = true;
  if (dims.length === 4) {
    if (dims[1] === 4) {
      channels = 4;
      h = dims[2] ?? 64;
      w = dims[3] ?? 64;
      planar = true;
    } else if (dims[3] === 4) {
      channels = 4;
      h = dims[1] ?? 64;
      w = dims[2] ?? 64;
      planar = false;
    }
  }
  const corners: OnnxQuadPoint[] = [];
  let confSum = 0;
  for (let c = 0; c < channels; c++) {
    let sum = 0;
    let sx = 0;
    let sy = 0;
    let peak = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = planar
          ? (heat[c * h * w + y * w + x] ?? 0)
          : (heat[(y * w + x) * channels + c] ?? 0);
        if (v > peak) peak = v;
        if (v < threshold) continue;
        sum += v;
        sx += x * v;
        sy += y * v;
      }
    }
    if (sum <= 0) return null;
    confSum += peak;
    corners.push({ x: sx / sum / w, y: sy / sum / h });
  }
  return corners.length === 4 ? corners : null;
}

function quadLooksLikeCard(
  corners: OnnxQuadResult["corners"],
  width: number,
  height: number,
): boolean {
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = maxX - minX;
  const h = maxY - minY;
  if (w < width * 0.12 || h < height * 0.12) return false;
  const frac = (w * h) / (width * height);
  if (frac < 0.06 || frac > 0.85) return false;
  const ar = w / h;
  // Portrait TCG or slight landscape tilt.
  return (ar >= 0.45 && ar <= 0.95) || (ar >= 1.05 && ar <= 1.6);
}

async function runOnRgba(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Promise<OnnxQuadResult | null> {
  if (!isDocAlignerEnabled()) return null;
  const session = await getSession();
  const ort = ortModule;
  if (!session || !ort) return null;

  const input = rgbaToNchw256(data, width, height);
  const inputName = session.inputNames[0];
  if (!inputName) return null;
  try {
    const tensor = new ort.Tensor("float32", input, [1, 3, INPUT_SIZE, INPUT_SIZE]);
    const out = await session.run({ [inputName]: tensor });
    const firstKey = session.outputNames[0];
    if (!firstKey) return null;
    const tensorOut = out[firstKey];
    if (!tensorOut) return null;
    const norm = heatmapCentroids(tensorOut.data, tensorOut.dims);
    if (!norm) return null;
    const corners = norm.map((p) => ({
      x: p.x * width,
      y: p.y * height,
    })) as OnnxQuadResult["corners"];
    if (!quadLooksLikeCard(corners, width, height)) return null;
    return { corners, confidence: 0.75, source: "onnx" };
  } catch {
    return null;
  }
}

/**
 * Run DocAligner on an RGBA ROI. Returns null when flag/model/runtime missing.
 */
export async function detectQuadOnnx(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Promise<OnnxQuadResult | null> {
  return runOnRgba(data, width, height);
}

/**
 * Live video path — downscale then DocAligner. Soft-fails always.
 */
export async function detectQuadOnnxFromVideo(
  video: HTMLVideoElement,
): Promise<OnnxQuadResult | null> {
  if (!isDocAlignerEnabled()) return null;
  const fullW = video.videoWidth;
  const fullH = video.videoHeight;
  if (!fullW || !fullH) return null;

  const scale = Math.min(1, 480 / Math.max(fullW, fullH));
  const dw = Math.max(64, Math.round(fullW * scale));
  const dh = Math.max(64, Math.round(fullH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, fullW, fullH, 0, 0, dw, dh);
  const image = ctx.getImageData(0, 0, dw, dh);
  const local = await runOnRgba(image.data, dw, dh);
  if (!local) return null;
  const sx = fullW / dw;
  const sy = fullH / dh;
  return {
    source: "onnx",
    confidence: local.confidence,
    corners: local.corners.map((p) => ({
      x: p.x * sx,
      y: p.y * sy,
    })) as OnnxQuadResult["corners"],
  };
}

/** Reset cached session (tests). */
export function resetDocAlignerSession(): void {
  sessionPromise = null;
}
