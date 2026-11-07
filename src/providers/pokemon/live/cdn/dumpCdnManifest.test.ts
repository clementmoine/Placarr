import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveBuckets } from "./dumpCdnManifest";

describe("resolveBuckets", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("cold_start_all_without_dirs_manifest_uses_fallback_and_probe_extras", () => {
    expect(resolveBuckets("all", "10101_0000", undefined, ["20260915_1700"])).toEqual([
      "10101_0000",
      "20260915_1700",
    ]);
    expect(resolveBuckets("all", "10101_0000", "/missing/asset-bundle-manifest_0.0.json")).toEqual([
      "10101_0000",
    ]);
  });

  it("all_with_dirs_manifest_unions_manifest_dirs_and_extras", () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "placarr-dirs-manifest-"));
    const manifest = path.join(dir, "asset-bundle-manifest_0.0.json");
    writeFileSync(
      manifest,
      JSON.stringify({
        keys: {
          manifest: {
            contentString: JSON.stringify({
              directories: ["10101_0000", "20260521_1700"],
            }),
          },
        },
      }),
      "utf8",
    );
    expect(resolveBuckets("all", "10101_0000", manifest, ["20260915_1700"])).toEqual([
      "10101_0000",
      "20260521_1700",
      "20260915_1700",
    ]);
  });
});
