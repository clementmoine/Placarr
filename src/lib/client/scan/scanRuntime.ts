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
import {
  DEFAULT_DOCALIGNER_URL,
  prefetchDocAligner,
} from "@/lib/client/scan/cardQuadOnnx";
import { clientEmbedModelFiles } from "@/lib/client/scan/cardEmbed.client";
import { prefetchClientIdentify } from "@/lib/client/scan/clientIdentify";
import { PPOCR_CLIENT_MODELS } from "@/lib/client/scan/paddleCollectorOcr.client";

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

let assetsWarmed = false;

/** Pull one immutable asset into the HTTP cache, streaming the body away. */
async function warmUrl(url: string): Promise<void> {
  try {
    const res = await fetch(url, { priority: "low" } as RequestInit);
    const reader = res.body?.getReader();
    if (!reader) return;
    // Consume without retaining: an 88 MB model must not sit in the JS heap
    // of a page that is only browsing shelves.
    while (!(await reader.read()).done) {
      /* discard */
    }
  } catch {
    /* offline / aborted — the scanner fetches it itself later */
  }
}

/**
 * Idle pre-warm from the page that hosts the scan button: downloads the
 * model files (DocAligner, PP-OCR, DINOv2) into the browser cache, one at a
 * time, without creating any inference session — so browsing costs no RAM
 * and the first tap on the button opens a scanner whose models are local.
 * Skipped on data-saver connections. Pack shards are never pre-warmed.
 */
export function warmScanAssetsWhenIdle(): void {
  if (assetsWarmed || typeof window === "undefined") return;
  const conn = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection;
  if (conn?.saveData) return;
  assetsWarmed = true;
  const run = async () => {
    const urls = [
      DEFAULT_DOCALIGNER_URL,
      ...Object.values(PPOCR_CLIENT_MODELS),
      ...(await clientEmbedModelFiles()),
    ];
    for (const url of urls) await warmUrl(url);
  };
  const idle = (
    window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    }
  ).requestIdleCallback;
  if (idle) idle(() => void run(), { timeout: 4000 });
  else setTimeout(() => void run(), 1500);
}

export function resetScanRuntimeForTests(): void {
  assetsWarmed = false;
  runtime = null;
  bootPromise = null;
}
