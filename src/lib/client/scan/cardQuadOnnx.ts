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
  Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
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

/** Official DocAligner post-process threshold (`heatmap_threshold`). */
const HEATMAP_THRESHOLD = 0.3;
/**
 * Threshold for *completing* one corner from the other three: a corner the
 * model saw faintly (dark card edge on a dark table) still leaves a bump here.
 */
const HEATMAP_WEAK_THRESHOLD = 0.12;
/**
 * A completed corner must lie within this share of the frame diagonal of the
 * parallelogram prediction — phone shots of a flat card are near-affine.
 */
const COMPLETION_MAX_DRIFT = 0.08;

type HeatLayout = {
  channels: number;
  h: number;
  w: number;
  at: (c: number, i: number) => number;
};

function heatLayout(heat: Float32Array, dims: number[]): HeatLayout {
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
  const at = (c: number, i: number): number =>
    planar ? (heat[c * h * w + i] ?? 0) : (heat[i * channels + c] ?? 0);
  return { channels, h, w, at };
}

type HeatBlob = {
  /** Pixel count above threshold. */
  n: number;
  /** Heat mass. */
  sum: number;
  /** Peak value. */
  peak: number;
  /** Mass-weighted centroid, normalised to [0, 1]. */
  x: number;
  y: number;
};

/** Connected components above `threshold` in one heat channel. */
function heatBlobs(
  layout: HeatLayout,
  c: number,
  threshold: number,
): HeatBlob[] {
  const { h, w, at } = layout;
  const seen = new Uint8Array(h * w);
  const stack: number[] = [];
  const blobs: HeatBlob[] = [];
  for (let start = 0; start < h * w; start++) {
    if (seen[start] || at(c, start) < threshold) continue;
    seen[start] = 1;
    stack.length = 0;
    stack.push(start);
    let sum = 0;
    let sx = 0;
    let sy = 0;
    let n = 0;
    let peak = 0;
    while (stack.length) {
      const i = stack.pop()!;
      const v = at(c, i);
      const x = i % w;
      const y = (i / w) | 0;
      sum += v;
      sx += x * v;
      sy += y * v;
      n += 1;
      if (v > peak) peak = v;
      const nb = [
        x > 0 ? i - 1 : -1,
        x < w - 1 ? i + 1 : -1,
        y > 0 ? i - w : -1,
        y < h - 1 ? i + w : -1,
      ];
      for (const k of nb) {
        if (k < 0 || seen[k] || at(c, k) < threshold) continue;
        seen[k] = 1;
        stack.push(k);
      }
    }
    if (sum > 0) blobs.push({ n, sum, peak, x: sx / sum / w, y: sy / sum / h });
  }
  return blobs;
}

function largestBlob(blobs: readonly HeatBlob[]): HeatBlob | null {
  let best: HeatBlob | null = null;
  for (const b of blobs) if (!best || b.n > best.n) best = b;
  return best;
}

/**
 * One corner per heat-map channel: weighted centroid of the *largest*
 * connected blob above threshold — the official DocAligner post-process.
 * A global centroid would average several peaks (neighbouring cards) into a
 * point in the void. Exported for tests.
 */
export function heatmapCentroids(
  heat: Float32Array,
  dims: number[],
  threshold = HEATMAP_THRESHOLD,
): OnnxQuadPoint[] | null {
  const layout = heatLayout(heat, dims);
  const corners: OnnxQuadPoint[] = [];
  for (let c = 0; c < layout.channels; c++) {
    const best = largestBlob(heatBlobs(layout, c, threshold));
    if (!best) return null;
    corners.push({ x: best.x, y: best.y });
  }
  return corners.length === 4 ? corners : null;
}

/** The fourth vertex of the parallelogram through the other three. */
function parallelogramFourth(
  corners: readonly (OnnxQuadPoint | null)[],
  missing: number,
): OnnxQuadPoint | null {
  const prev = corners[(missing + 3) % 4];
  const next = corners[(missing + 1) % 4];
  const opposite = corners[(missing + 2) % 4];
  if (!prev || !next || !opposite) return null;
  return { x: prev.x + next.x - opposite.x, y: prev.y + next.y - opposite.y };
}

/**
 * Card corners from the heat map, in pixel space. The official largest-blob
 * pick is used when its quad is card-shaped. When exactly one channel is
 * silent or geometrically off (dark edge on a dark table, corner under a
 * finger shadow), that corner is completed from the other three — a flat card
 * photographed by a phone is near-affine — and accepted only if a faint blob
 * of the same channel confirms it within `COMPLETION_MAX_DRIFT`. Exported for
 * tests.
 */
export function heatmapCardCorners(
  heat: Float32Array,
  dims: number[],
  width: number,
  height: number,
): OnnxQuadResult["corners"] | null {
  const layout = heatLayout(heat, dims);
  if (layout.channels !== 4) return null;
  const toPx = (p: OnnxQuadPoint): OnnxQuadPoint => ({
    x: p.x * width,
    y: p.y * height,
  });
  const primary: (OnnxQuadPoint | null)[] = [];
  for (let c = 0; c < 4; c++) {
    const best = largestBlob(heatBlobs(layout, c, HEATMAP_THRESHOLD));
    primary.push(best ? { x: best.x, y: best.y } : null);
  }
  if (primary.every(Boolean)) {
    const quad = primary.map((p) => toPx(p!)) as OnnxQuadResult["corners"];
    if (quadLooksLikeCard(quad, width, height)) return quad;
  }

  // Try completing each corner in turn; keep the completion whose confirming
  // blob sits closest to the parallelogram prediction.
  const diag = Math.hypot(width, height);
  let best: { quad: OnnxQuadResult["corners"]; drift: number } | null = null;
  for (let missing = 0; missing < 4; missing++) {
    const predicted = parallelogramFourth(primary, missing);
    if (!predicted) continue;
    const predictedPx = toPx(predicted);
    const faint = heatBlobs(layout, missing, HEATMAP_WEAK_THRESHOLD);
    for (const blob of faint) {
      const px = toPx(blob);
      const drift = side(px, predictedPx) / diag;
      if (drift > COMPLETION_MAX_DRIFT) continue;
      const quad = primary.map((p, i) =>
        i === missing ? px : toPx(p!),
      ) as OnnxQuadResult["corners"];
      if (!quadLooksLikeCard(quad, width, height)) continue;
      if (!best || drift < best.drift) best = { quad, drift };
    }
  }
  return best?.quad ?? null;
}

function side(a: OnnxQuadPoint, b: OnnxQuadPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Card-shaped quad? Judged on the quad's own sides (tilt-agnostic), not its
 * bounding box — a card at 40° has a square AABB but is still 63×88.
 */
export function quadLooksLikeCard(
  corners: OnnxQuadResult["corners"],
  width: number,
  height: number,
): boolean {
  const [tl, tr, br, bl] = corners;
  const top = side(tl, tr);
  const bottom = side(bl, br);
  const left = side(tl, bl);
  const right = side(tr, br);
  const minEdge = Math.min(width, height);
  if (Math.min(top, bottom, left, right) < minEdge * 0.12) return false;
  if (Math.min(top, bottom) / Math.max(top, bottom) < 0.6) return false;
  if (Math.min(left, right) / Math.max(left, right) < 0.6) return false;
  let area2 = 0;
  for (let i = 0; i < 4; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % 4]!;
    area2 += a.x * b.y - b.x * a.y;
  }
  const frac = Math.abs(area2) / 2 / (width * height);
  if (frac < 0.06 || frac > 0.85) return false;
  const ar = (top + bottom) / (left + right);
  // Portrait TCG, or lying on its side.
  return (ar >= 0.45 && ar <= 0.95) || (ar >= 1.05 && ar <= 2.2);
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
    const tensor = new ort.Tensor("float32", input, [
      1,
      3,
      INPUT_SIZE,
      INPUT_SIZE,
    ]);
    const out = await session.run({ [inputName]: tensor });
    const firstKey = session.outputNames[0];
    if (!firstKey) return null;
    const tensorOut = out[firstKey];
    if (!tensorOut) return null;
    const corners = heatmapCardCorners(
      tensorOut.data,
      tensorOut.dims,
      width,
      height,
    );
    if (!corners) return null;
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
