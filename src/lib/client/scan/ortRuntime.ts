/**
 * One ONNX Runtime Web configuration for every on-device model — DINOv2
 * (transformers.js), PP-OCR (ppu-paddle-ocr) and DocAligner.
 *
 * All three import the same `onnxruntime-web` instance (pnpm override in
 * `pnpm-workspace.yaml`), so `ort.env` is shared: the libraries only fill in
 * their defaults when nothing is set yet, and whoever configures first wins.
 * {@link configureOrt} therefore runs before any of them is imported.
 *
 * Runtime flavour is feature-detected, never a setting:
 *
 * - **WebGPU build (asyncify)** only where the browser has a GPU adapter
 *   *and* JSPI (`WebAssembly.Suspending`). JSPI is used purely as the
 *   "modern engine" signal: WebKit has neither JSPI nor a working ORT GPU
 *   path, and its WebGPU-flavoured builds (JSEP, asyncify) run the CPU hot
 *   and grow memory until the tab is killed — microsoft/onnxruntime#26827 —
 *   on iOS/iPadOS 26 even with `executionProviders: ["wasm"]`. The plain
 *   build is stable there, and iOS Safari exposes `navigator.gpu` today, so
 *   "adapter present" alone would send iPhones straight into that failure.
 *   The file is asyncify (not jspi) because the `onnxruntime-web/webgpu`
 *   bundle's JS glue is built for that variant.
 * - **Plain WASM build** everywhere else (SIMD + threads; thread count left
 *   to ORT, which only goes multi-threaded under cross-origin isolation).
 *
 * Files are self-hosted under `/models/ort/<version>/`, copied from the
 * installed package by `scripts/copy-ort-wasm.mjs`: no CDN on the scan
 * path, works offline, bytes always match the JS bundle. Both libraries'
 * CDN defaults would otherwise fetch 28–30 MB WebGPU builds from jsDelivr.
 *
 * The JS side is one module too: `next.config.js` aliases `onnxruntime-web`
 * and `onnxruntime-web/webgpu` to the same bundle in the browser.
 */

import { isScanDebugEnabled } from "@/lib/client/scan/scanDebugStore";

export type OrtFlavour = "wasm" | "webgpu";

export type OrtCapabilities = {
  /** `navigator.gpu.requestAdapter()` resolved to an adapter. */
  gpuAdapter: boolean;
  /** JavaScript Promise Integration — `'Suspending' in WebAssembly`. */
  jspi: boolean;
};

/** File stems under `/models/ort/<version>/` — mirrored in `scripts/copy-ort-wasm.mjs`. */
export const ORT_WASM_FILES: Readonly<Record<OrtFlavour, string>> = {
  wasm: "ort-wasm-simd-threaded",
  webgpu: "ort-wasm-simd-threaded.asyncify",
};

export const ORT_PUBLIC_BASE = "/models/ort";

export function pickOrtFlavour(caps: OrtCapabilities): OrtFlavour {
  return caps.gpuAdapter && caps.jspi ? "webgpu" : "wasm";
}

export function ortWasmPaths(
  version: string,
  flavour: OrtFlavour,
): { wasm: string; mjs: string } {
  const base = `${ORT_PUBLIC_BASE}/${version}/${ORT_WASM_FILES[flavour]}`;
  return { wasm: `${base}.wasm`, mjs: `${base}.mjs` };
}

/**
 * Execution providers for sessions created by third-party libraries that
 * open several sessions at once (ppu-paddle-ocr `initialize()` creates its
 * detection and recognition sessions in parallel). The WebGPU EP cannot be
 * used there: creating a WebGPU session suspends the Asyncify module, ORT
 * rejects the second creation ("another WebGPU EP inference session is
 * being created") and the library immediately retries with `wasm` while the
 * first creation is still suspended — re-entering a suspended Asyncify
 * module hangs the main thread for good (observed: `webgpuOnCreateSession`
 * spinning, tab frozen). The CPU EP never suspends, so concurrent creations
 * are safe, and these small CNN/LSTM models with dynamic shapes gain little
 * from WebGPU anyway (shader recompilation per new shape).
 */
export const ORT_LIBRARY_SESSION_PROVIDERS: readonly ["wasm"] = ["wasm"];

export async function detectOrtCapabilities(): Promise<OrtCapabilities> {
  const jspi =
    typeof WebAssembly !== "undefined" && "Suspending" in WebAssembly;
  let gpuAdapter = false;
  if (typeof navigator !== "undefined" && "gpu" in navigator) {
    try {
      const adapter = await (
        navigator as Navigator & {
          gpu?: { requestAdapter: () => Promise<unknown> };
        }
      ).gpu?.requestAdapter();
      gpuAdapter = adapter != null;
    } catch {
      gpuAdapter = false;
    }
  }
  return { gpuAdapter, jspi };
}

/** Subset of `onnxruntime-web`'s `env` the scanner configures. */
type OrtEnvLike = {
  versions?: { web?: string; common?: string };
  wasm?: {
    wasmPaths?: string | { wasm?: string | URL; mjs?: string | URL };
    numThreads?: number;
  };
};

export type OrtRuntime = {
  flavour: OrtFlavour;
  version: string;
  paths: { wasm: string; mjs: string };
  caps: OrtCapabilities;
};

let runtimePromise: Promise<OrtRuntime> | null = null;

/**
 * The ORT factory (`.mjs`) handed over as a blob URL. The Emscripten glue
 * spawns its pthread workers from `import.meta.url`; a worker created from a
 * plain https URL is refused by Chromium when the page's certificate has
 * errors (dev / LAN self-signed), and ORT then waits for threads that never
 * come up — every session on the page hangs, silently. Blob workers are
 * never refused. (transformers.js loads the factory the same way.)
 */
async function factoryBlobUrl(url: string): Promise<string | null> {
  if (typeof URL === "undefined" || typeof Blob === "undefined") return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    return URL.createObjectURL(new Blob([text], { type: "text/javascript" }));
  } catch {
    return null;
  }
}

/**
 * Configure the shared `ort.env` once (memoized). Call before importing
 * `@huggingface/transformers`, `ppu-paddle-ocr/web` or creating any session.
 */
export function configureOrt(): Promise<OrtRuntime> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const [ort, caps] = await Promise.all([
        import("onnxruntime-web") as Promise<{ env?: OrtEnvLike }>,
        detectOrtCapabilities(),
      ]);
      const flavour = pickOrtFlavour(caps);
      const version =
        ort.env?.versions?.web ?? ort.env?.versions?.common ?? "unknown";
      const paths = ortWasmPaths(version, flavour);
      if (ort.env?.wasm) {
        const mjs = (await factoryBlobUrl(paths.mjs)) ?? paths.mjs;
        ort.env.wasm.wasmPaths = { wasm: paths.wasm, mjs };
      }
      return { flavour, version, paths, caps };
    })();
    runtimePromise.catch(() => {
      runtimePromise = null;
    });
  }
  return runtimePromise;
}

let exclusiveChain: Promise<unknown> = Promise.resolve();

/**
 * Run `fn` with exclusive access to the ONNX runtime.
 *
 * All models share one WebAssembly instance, and ORT's WebGPU build is
 * compiled with Emscripten Asyncify: `session.run()` suspends the module
 * while the GPU works, and a second run (or session creation) entering the
 * module during that suspension corrupts its stack — "concurrent run
 * support is disabled" (onnxruntime PR #14579), Emscripten: "it is not
 * safe to start an async operation while another is already running". So
 * every inference and every session creation on the page goes through this
 * one queue: subject detection, OCR and embedding take turns, never
 * overlap. On the plain WASM build runs are synchronous and the queue costs
 * nothing. transformers.js keeps its own chain internally; wrapping the
 * whole extractor call here folds it into this one.
 */
export function runOrtExclusive<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  const traced = isScanDebugEnabled()
    ? async () => {
        const t0 = performance.now();
        console.debug(`[ort] ▶ ${label}`);
        try {
          return await fn();
        } finally {
          console.debug(
            `[ort] ■ ${label} ${Math.round(performance.now() - t0)}ms`,
          );
        }
      }
    : fn;
  const next = exclusiveChain.then(traced, traced);
  exclusiveChain = next.catch(() => undefined);
  return next;
}

/** Static files the chosen runtime will request — for idle pre-warming. */
export async function ortRuntimeFiles(): Promise<string[]> {
  const rt = await configureOrt();
  return [rt.paths.wasm, rt.paths.mjs];
}

export function resetOrtRuntimeForTests(): void {
  runtimePromise = null;
  exclusiveChain = Promise.resolve();
}
