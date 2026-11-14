/**
 * Self-host the ONNX Runtime Web binaries the scanner runs on.
 *
 * Copies the WASM runtime variants `src/lib/client/scan/ortRuntime.ts` can
 * pick from `node_modules/onnxruntime-web/dist/` into
 * `public/models/ort/<version>/` (gitignored — the bytes always match the
 * installed JS bundle, which ORT requires). Runs before `next dev` / `next
 * build`; idempotent, skips files already copied byte-for-byte (by size).
 *
 * Why not the CDN default: the scan page then depends on a third party for
 * a 15–30 MB download at first use, fails offline, and the libraries' CDN
 * defaults pick WebGPU-flavoured builds that WebKit cannot run safely.
 */
import { createRequire } from "node:module";
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// The package does not export `./package.json`; resolve a public file from
// `dist/` and walk up to the package root instead.
const dist = dirname(
  require.resolve("onnxruntime-web/ort-wasm-simd-threaded.wasm"),
);
const { version } = JSON.parse(
  readFileSync(join(dist, "..", "package.json"), "utf8"),
);

/** Keep in sync with `ORT_WASM_FILES` in `src/lib/client/scan/ortRuntime.ts`. */
const STEMS = ["ort-wasm-simd-threaded", "ort-wasm-simd-threaded.asyncify"];
const EXTS = [".wasm", ".mjs"];

const outRoot = join(root, "public", "models", "ort");
const outDir = join(outRoot, version);
mkdirSync(outDir, { recursive: true });

// Drop runtimes of other versions: the page only ever asks for the one that
// matches its bundle, stale directories just waste disk.
for (const entry of readdirSync(outRoot)) {
  if (entry !== version)
    rmSync(join(outRoot, entry), { recursive: true, force: true });
}

const wanted = new Set(STEMS.flatMap((s) => EXTS.map((e) => `${s}${e}`)));
for (const entry of readdirSync(outDir)) {
  if (!wanted.has(entry)) rmSync(join(outDir, entry), { force: true });
}

let copied = 0;
for (const stem of STEMS) {
  for (const ext of EXTS) {
    const src = join(dist, `${stem}${ext}`);
    const dst = join(outDir, `${stem}${ext}`);
    const srcSize = statSync(src).size;
    let same = false;
    try {
      same = statSync(dst).size === srcSize;
    } catch {
      same = false;
    }
    if (same) continue;
    copyFileSync(src, dst);
    copied++;
  }
}

console.log(
  `[copy-ort-wasm] onnxruntime-web ${version} → public/models/ort/${version} (${copied} file(s) copied)`,
);
