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
import { prefetchClientIdentify } from "@/lib/client/scan/clientIdentify";

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

/** Camera start: backend probe + DocAligner + optional OCR/DINOv2 prefetch. */
export async function bootScanRuntime(
  packIds: readonly string[] = [],
): Promise<ScanRuntime> {
  const rt = getScanRuntime();
  const [backend] = await Promise.all([
    detectBackend(),
    prefetchDocAligner(),
    prefetchClientIdentify(packIds),
  ]);
  rt.backend = backend;
  rt.ready = true;
  return rt;
}

export function resetScanRuntimeForTests(): void {
  runtime = null;
}
