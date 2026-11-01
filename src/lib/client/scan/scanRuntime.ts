/**
 * Scan runtime: budget clock + one-shot model prefetch at camera start.
 *
 * All on-device inference (DocAligner, PP-OCR, DINOv2) runs through its own
 * engine (onnxruntime-web / transformers.js) which picks WebGPU and falls
 * back to WASM internally — no custom worker to keep in sync.
 * Prefetch once; never re-download on IDB / HTTP cache hit.
 */
import {
  createScanBudgetClock,
  type ScanBudgetClock,
} from "@/lib/client/scan/scanBudget";
import { prefetchDocAligner } from "@/lib/client/scan/cardQuadOnnx";
import { prefetchCardEmbedClient } from "@/lib/client/scan/cardEmbed.client";
import { prefetchClientIdentify } from "@/lib/client/scan/clientIdentify";
import { prefetchPaddleCollectorOcrClient } from "@/lib/client/scan/paddleCollectorOcr.client";

export type ScanRuntime = {
  budget: ScanBudgetClock;
  backend: "webgpu" | "wasm" | "unknown";
  ready: boolean;
};

let runtime: ScanRuntime | null = null;

/** Best-effort backend label for the HUD (engines decide for real). */
async function detectBackend(): Promise<ScanRuntime["backend"]> {
  if (typeof navigator === "undefined") return "unknown";
  try {
    const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
    if (gpu && (await gpu.requestAdapter())) return "webgpu";
  } catch {
    // fall through
  }
  return "wasm";
}

export function getScanRuntime(): ScanRuntime {
  if (!runtime) {
    runtime = {
      budget: createScanBudgetClock(),
      backend: "unknown",
      ready: false,
    };
  }
  return runtime;
}

let bootPromise: Promise<ScanRuntime> | null = null;

/**
 * Camera start, in the order the user feels it:
 * 1. DocAligner (4.7 MB, IDB-cached) — the frame starts tracking;
 * 2. OCR + DINOv2 engines — on-device identify takes over from the server;
 * 3. shard manifest → background queue, cheapest first.
 * Identify runs from the first sample regardless (server until 2 lands).
 */
export function bootScanRuntime(
  packIds: readonly string[] = [],
): Promise<ScanRuntime> {
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    const rt = getScanRuntime();
    const backend = detectBackend();
    await prefetchDocAligner();
    await prefetchClientIdentify(packIds);
    rt.backend = await backend;
    rt.ready = true;
    return rt;
  })();
  bootPromise.catch(() => {
    bootPromise = null;
  });
  return bootPromise;
}

let enginesWarmed = false;

/**
 * Idle pre-warm from the page that hosts the scan button: engines only
 * (DocAligner, PP-OCR, DINOv2 — a one-time download, then browser cache),
 * never the pack shards. Skipped on data-saver connections. By the time
 * the user taps the button the models are already on disk.
 */
export function warmScanEnginesWhenIdle(): void {
  if (enginesWarmed || typeof window === "undefined") return;
  const conn = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection;
  if (conn?.saveData) return;
  enginesWarmed = true;
  const run = () => {
    void prefetchDocAligner();
    void prefetchPaddleCollectorOcrClient();
    void prefetchCardEmbedClient();
  };
  const idle = (
    window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    }
  ).requestIdleCallback;
  if (idle) idle(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}

export function resetScanRuntimeForTests(): void {
  enginesWarmed = false;
  runtime = null;
  bootPromise = null;
}
