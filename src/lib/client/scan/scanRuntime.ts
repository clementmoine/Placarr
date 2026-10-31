/**
 * Main-thread bridge to the scan worker + budget clock.
 * Prefetch models once; never re-download on IDB / HTTP cache hit.
 */
import {
  createScanBudgetClock,
  type ScanBudgetClock,
} from "@/lib/client/scan/scanBudget";
import type {
  ScanWorkerRequest,
  ScanWorkerResponse,
} from "@/lib/client/scan/scan.worker";
import { prefetchDocAligner } from "@/lib/client/scan/cardQuadOnnx";
import { prefetchClientIdentify } from "@/lib/client/scan/clientIdentify";

export type ScanRuntime = {
  budget: ScanBudgetClock;
  backend: "webgpu" | "wasm" | "unknown";
  ready: boolean;
};

let runtime: ScanRuntime | null = null;
let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (v: ScanWorkerResponse) => void; reject: (e: unknown) => void }
>();

function ensureWorker(): Worker | null {
  if (typeof window === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(
      new URL("./scan.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (event: MessageEvent<ScanWorkerResponse>) => {
      const msg = event.data;
      const wait = pending.get(msg.id);
      if (!wait) return;
      pending.delete(msg.id);
      wait.resolve(msg);
    };
    worker.onerror = (err) => {
      console.warn("[scanRuntime] worker error", err);
    };
    return worker;
  } catch (err) {
    console.warn("[scanRuntime] worker unavailable", err);
    return null;
  }
}

function postWorker(
  req: Omit<ScanWorkerRequest, "id">,
): Promise<ScanWorkerResponse | null> {
  const w = ensureWorker();
  if (!w) return Promise.resolve(null);
  const id = nextId++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(null);
    }, 4000);
    pending.set(id, {
      resolve: (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      reject: () => {
        clearTimeout(timer);
        resolve(null);
      },
    });
    w.postMessage({ ...req, id } as ScanWorkerRequest);
  });
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

/** Camera start: worker ping + DocAligner + optional OCR/CLIP prefetch. */
export async function bootScanRuntime(
  packIds: readonly string[] = [],
): Promise<ScanRuntime> {
  const rt = getScanRuntime();
  ensureWorker();
  const pong = await postWorker({ type: "ping" });
  if (pong && pong.type === "pong") {
    rt.backend = pong.backend;
  }
  await Promise.all([
    prefetchDocAligner(),
    prefetchClientIdentify(packIds),
  ]);
  rt.ready = true;
  return rt;
}

export function resetScanRuntimeForTests(): void {
  runtime = null;
  if (worker) {
    worker.terminate();
    worker = null;
  }
  pending.clear();
  nextId = 1;
}
