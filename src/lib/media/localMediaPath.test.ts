import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { localMediaFilePath } from "./localMediaPath";

describe("localMediaFilePath", () => {
  let dataRoot: string;
  let prevData: string | undefined;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(os.tmpdir(), "placarr-media-"));
    prevData = process.env.PLACARR_DATA_DIR;
    process.env.PLACARR_DATA_DIR = dataRoot;
    mkdirSync(path.join(dataRoot, "uploads"), { recursive: true });
    mkdirSync(
      path.join(dataRoot, "naruto", "carddass", "cards", "ninja", "ni0001", "fr"),
      { recursive: true },
    );
  });

  afterEach(() => {
    if (prevData === undefined) delete process.env.PLACARR_DATA_DIR;
    else process.env.PLACARR_DATA_DIR = prevData;
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it("resolves /uploads under data/uploads, not public/", () => {
    const file = path.join(dataRoot, "uploads", "abc.webp");
    writeFileSync(file, "x");
    expect(localMediaFilePath("/uploads/abc.webp")).toBe(file);
    expect(
      existsSync(path.join(process.cwd(), "public", "uploads", "abc.webp")),
    ).toBe(false);
  });

  it("resolves /assets pack faces under data/<pack>/", () => {
    const file = path.join(
      dataRoot,
      "naruto",
      "carddass",
      "cards",
      "ninja",
      "ni0001",
      "fr",
      "art.webp",
    );
    writeFileSync(file, "y");
    expect(
      localMediaFilePath(
        "/assets/naruto/carddass/cards/ninja/ni0001/fr/art.webp",
      ),
    ).toBe(file);
  });

  it("returns null for non-local URLs", () => {
    expect(localMediaFilePath("https://cdn.example/x.webp")).toBeNull();
    expect(localMediaFilePath("")).toBeNull();
  });
});
