import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const packRoot = { current: "" };

vi.mock("@/lib/packPaths", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/packPaths")>("@/lib/packPaths");
  return {
    ...actual,
    packCardsDir: () => packRoot.current || actual.packCardsDir("lorcana"),
  };
});

import { cardnexusPackCardDir } from "./fillPackFaces";
import { catalogueFaceSourceRank } from "@/lib/admin/catalogueFacePick";

describe("cardnexusPackCardDir", () => {
  afterEach(() => {
    packRoot.current = "";
  });

  it("prefers an existing lang-first folder", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "cn-pack-"));
    packRoot.current = root;
    const langFirst = path.join(root, "fr", "tdm", "1");
    mkdirSync(langFirst, { recursive: true });
    writeFileSync(path.join(langFirst, "art.webp"), "x");

    expect(
      cardnexusPackCardDir({
        packId: "mtg",
        lang: "fr",
        setCode: "tdm",
        number: "1",
      }),
    ).toBe(langFirst);
  });

  it("prefers an existing set-first folder", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "cn-pack-"));
    packRoot.current = root;
    const setFirst = path.join(root, "op01", "fr", "001");
    mkdirSync(setFirst, { recursive: true });

    expect(
      cardnexusPackCardDir({
        packId: "onepiece",
        lang: "fr",
        setCode: "op01",
        number: "001",
      }),
    ).toBe(setFirst);
  });
});

describe("catalogueFaceSourceRank cardnexus", () => {
  it("ranks below default publisher dumps and above coleka", () => {
    expect(catalogueFaceSourceRank("art.cardnexus.jpg")).toBe(45);
    expect(catalogueFaceSourceRank("art.bandai.webp")).toBe(50);
    expect(catalogueFaceSourceRank("art.coleka.webp")).toBe(35);
  });
});
