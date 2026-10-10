import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const uploadsRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "placarr-assets-uploads-"),
);

/**
 * Only uploads are redirected. Pack resolution still uses the real `data/`
 * tree — `packPaths` imports `runtimeData` via a relative path that Vitest
 * does not rewrite when we mock the `@/` alias alone.
 */
vi.mock("@/lib/runtimeData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/runtimeData")>();
  return {
    ...actual,
    uploadsDir: () => uploadsRoot,
  };
});

const SAMPLE =
  "/assets/naruto/ninja-ranks/cards/nr/fr/0001/art.coleka.webp";

describe("assetsPath", () => {
  beforeEach(() => {
    fs.rmSync(uploadsRoot, { recursive: true, force: true });
    fs.mkdirSync(uploadsRoot, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(uploadsRoot, { recursive: true, force: true });
  });

  it("resolves a nested pack card URL to the on-disk face", async () => {
    const { assetsFilePath } = await import("./assetsPath");
    const disk = assetsFilePath(SAMPLE);
    expect(disk).toMatch(/art\.coleka\.webp$/);
    expect(disk && fs.existsSync(disk)).toBe(true);
  });

  it("copies a pack asset into uploads once, keyed by URL", async () => {
    const { assetsFilePath, localizePackAssetToUploads } = await import(
      "./assetsPath"
    );
    const disk = assetsFilePath(SAMPLE);
    expect(disk).toBeTruthy();

    const first = localizePackAssetToUploads(SAMPLE);
    const second = localizePackAssetToUploads(SAMPLE);

    const hash = createHash("md5").update(SAMPLE).digest("hex");
    expect(first).toBe(`/uploads/${hash}.webp`);
    expect(second).toBe(first);
    expect(
      fs.readFileSync(path.join(uploadsRoot, `${hash}.webp`)),
    ).toEqual(fs.readFileSync(disk!));
  });

  it("rejects path traversal and unknown prefixes", async () => {
    const { assetsFilePath, localizePackAssetToUploads } = await import(
      "./assetsPath"
    );
    expect(assetsFilePath("/uploads/abc.webp")).toBeNull();
    expect(assetsFilePath("/assets/../etc/passwd")).toBeNull();
    expect(
      localizePackAssetToUploads("/assets/missing/cards/x.webp"),
    ).toBeNull();
  });
});
