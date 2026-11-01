import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import {
  ORT_PUBLIC_BASE,
  ORT_LIBRARY_SESSION_PROVIDERS,
  ORT_WASM_FILES,
  ortWasmPaths,
  pickOrtFlavour,
  resetOrtRuntimeForTests,
  runOrtExclusive,
} from "@/lib/client/scan/ortRuntime";

describe("runOrtExclusive", () => {
  beforeEach(() => resetOrtRuntimeForTests());

  it("never lets two runs overlap — the Asyncify re-entrancy guard", async () => {
    let active = 0;
    let maxActive = 0;
    const order: string[] = [];
    const job = (name: string, ms: number) => () =>
      new Promise<string>((resolve) => {
        active++;
        maxActive = Math.max(maxActive, active);
        order.push(`${name}:start`);
        setTimeout(() => {
          active--;
          order.push(`${name}:end`);
          resolve(name);
        }, ms);
      });
    // Detection (fast, frequent) fired while an embed (slow) is in flight.
    const results = await Promise.all([
      runOrtExclusive("embed", job("embed", 30)),
      runOrtExclusive("detect", job("detect", 5)),
      runOrtExclusive("ocr", job("ocr", 10)),
    ]);
    expect(results).toEqual(["embed", "detect", "ocr"]);
    expect(maxActive).toBe(1);
    expect(order).toEqual([
      "embed:start",
      "embed:end",
      "detect:start",
      "detect:end",
      "ocr:start",
      "ocr:end",
    ]);
  });

  it("a failing run does not block the queue", async () => {
    await expect(
      runOrtExclusive("fail", () => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
    await expect(runOrtExclusive("ok", async () => 42)).resolves.toBe(42);
  });
});

describe("pickOrtFlavour", () => {
  it.each([
    // WebKit today: GPU adapter advertised, no JSPI → plain WASM (the
    // WebGPU builds leak until the tab dies there, onnxruntime#26827).
    [{ gpuAdapter: true, jspi: false }, "wasm"],
    // Chromium desktop / Android: both → GPU build.
    [{ gpuAdapter: true, jspi: true }, "webgpu"],
    // JSPI without a usable adapter (headless, blocked GPU) → WASM.
    [{ gpuAdapter: false, jspi: true }, "wasm"],
    [{ gpuAdapter: false, jspi: false }, "wasm"],
  ] as const)("%o → %s", (caps, expected) => {
    expect(pickOrtFlavour(caps)).toBe(expected);
  });
});

describe("ortWasmPaths", () => {
  it("points both files at the self-hosted, version-scoped directory", () => {
    expect(ortWasmPaths("1.31.1", "wasm")).toEqual({
      wasm: "/models/ort/1.31.1/ort-wasm-simd-threaded.wasm",
      mjs: "/models/ort/1.31.1/ort-wasm-simd-threaded.mjs",
    });
    expect(ortWasmPaths("1.31.1", "webgpu")).toEqual({
      wasm: "/models/ort/1.31.1/ort-wasm-simd-threaded.asyncify.wasm",
      mjs: "/models/ort/1.31.1/ort-wasm-simd-threaded.asyncify.mjs",
    });
  });

  it("never reaches for a CDN", () => {
    for (const flavour of ["wasm", "webgpu"] as const) {
      const p = ortWasmPaths("9.9.9", flavour);
      expect(p.wasm.startsWith(`${ORT_PUBLIC_BASE}/`)).toBe(true);
      expect(p.mjs.startsWith(`${ORT_PUBLIC_BASE}/`)).toBe(true);
      expect(p.wasm).not.toMatch(/^https?:/);
    }
  });

  it("the plain flavour is the non-JSEP, non-asyncify build", () => {
    expect(ORT_WASM_FILES.wasm).toBe("ort-wasm-simd-threaded");
    expect(ORT_WASM_FILES.wasm).not.toMatch(/jsep|asyncify|jspi/);
  });
});

describe("ORT_LIBRARY_SESSION_PROVIDERS — the PP-OCR main-thread freeze", () => {
  // ppu-paddle-ocr creates det+rec sessions concurrently; a WebGPU session
  // creation suspends the Asyncify module and the library's wasm retry
  // re-enters it → tab frozen (webgpuOnCreateSession spinning). Regression
  // guard: libraries that open several sessions at once stay on the CPU EP.
  it("never hands WebGPU to libraries that create sessions concurrently", () => {
    expect(ORT_LIBRARY_SESSION_PROVIDERS).toEqual(["wasm"]);
    expect(ORT_LIBRARY_SESSION_PROVIDERS).not.toContain("webgpu");
  });

  it("the PP-OCR client uses it and never names webgpu itself", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/client/scan/paddleCollectorOcr.client.ts"),
      "utf8",
    );
    expect(src).toContain("ORT_LIBRARY_SESSION_PROVIDERS");
    expect(
      src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""),
    ).not.toMatch(/["']webgpu["']/);
  });
});

describe("copy-ort-wasm.mjs stays in sync with ORT_WASM_FILES", () => {
  const script = readFileSync(
    join(process.cwd(), "scripts/copy-ort-wasm.mjs"),
    "utf8",
  );

  it("copies every stem the runtime can pick", () => {
    for (const stem of Object.values(ORT_WASM_FILES)) {
      expect(script).toContain(`"${stem}"`);
    }
  });

  it("the installed package ships both variants (.wasm + .mjs)", () => {
    const dist = join(process.cwd(), "node_modules/onnxruntime-web/dist");
    const files = new Set(readdirSync(dist));
    for (const stem of Object.values(ORT_WASM_FILES)) {
      expect(files.has(`${stem}.wasm`)).toBe(true);
      expect(files.has(`${stem}.mjs`)).toBe(true);
    }
  });
});
