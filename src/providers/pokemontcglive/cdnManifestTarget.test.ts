import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  cdnManifestTargetFingerprint,
  shouldReuseCdnManifestDump,
  writeCdnManifestTargetMeta,
} from "./cdnManifestTarget";

describe("cdnManifestTargetFingerprint", () => {
  it("normalizes trailing slash and lang order", () => {
    expect(
      cdnManifestTargetFingerprint({
        version: "1.42",
        contentDir: "dir",
        contentBase: "https://cdn.example/base/",
        langs: ["en", "fr"],
      }),
    ).toBe(
      cdnManifestTargetFingerprint({
        version: "1.42",
        contentDir: "dir",
        contentBase: "https://cdn.example/base",
        langs: ["fr", "en"],
      }),
    );
  });
});

describe("shouldReuseCdnManifestDump", () => {
  it("reuses when meta matches and dumps exist", () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "cdn-manifest-"));
    writeCdnManifestTargetMeta(outDir, {
      version: "1.42",
      contentDir: "Content/1.42",
      contentBase: "https://cdn.example/base/",
      langs: ["fr", "en"],
      complete: true,
    });
    writeFileSync(path.join(outDir, "manifest_fr_10101_0000.json"), "{}");
    writeFileSync(path.join(outDir, "manifest_en_10101_0000.json"), "{}");
    expect(
      shouldReuseCdnManifestDump({
        outDir,
        version: "1.42",
        contentDir: "Content/1.42",
        contentBase: "https://cdn.example/base",
        langs: ["en", "fr"],
      }),
    ).toBe(true);
  });

  it("refetches when the CDN version moved", () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "cdn-manifest-stale-"));
    writeCdnManifestTargetMeta(outDir, {
      version: "1.41",
      contentDir: "Content/1.41",
      contentBase: "https://cdn.example/base/",
      langs: ["fr"],
    });
    writeFileSync(path.join(outDir, "manifest_fr_10101_0000.json"), "{}");
    expect(
      shouldReuseCdnManifestDump({
        outDir,
        version: "1.42",
        contentDir: "Content/1.42",
        contentBase: "https://cdn.example/base/",
        langs: ["fr"],
      }),
    ).toBe(false);
  });

  it("does not full-reuse an interrupted dump", () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "cdn-manifest-incomplete-"));
    writeCdnManifestTargetMeta(outDir, {
      version: "1.42",
      contentDir: "Content/1.42",
      contentBase: "https://cdn.example/base/",
      langs: ["fr"],
      complete: false,
    });
    writeFileSync(path.join(outDir, "manifest_fr_10101_0000.json"), "{}");
    expect(
      shouldReuseCdnManifestDump({
        outDir,
        version: "1.42",
        contentDir: "Content/1.42",
        contentBase: "https://cdn.example/base/",
        langs: ["fr"],
      }),
    ).toBe(false);
  });
});

describe("shouldResumeCdnManifestDump", () => {
  it("resumes an incomplete dump for the same CDN target", async () => {
    const { shouldResumeCdnManifestDump } = await import("./cdnManifestTarget");
    const outDir = mkdtempSync(path.join(tmpdir(), "cdn-manifest-resume-"));
    writeCdnManifestTargetMeta(outDir, {
      version: "1.42",
      contentDir: "Content/1.42",
      contentBase: "https://cdn.example/base/",
      langs: ["fr", "en"],
      complete: false,
    });
    writeFileSync(path.join(outDir, "manifest_fr_10101_0000.json"), "{}");
    expect(
      shouldResumeCdnManifestDump({
        outDir,
        version: "1.42",
        contentDir: "Content/1.42",
        contentBase: "https://cdn.example/base/",
        langs: ["fr", "en"],
      }),
    ).toBe(true);
  });
});
