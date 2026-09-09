import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import dig from "../curated/sources/tin-box-hobby-sleeve-2026-08-30.json";
import { narutoCuratedProductsDir } from "../curatedPaths";
import { NARUTO_SEALED_SKUS } from "../sealedProducts";

describe("tin-box-hobby sleeve packshot", () => {
  it("keeps the curated blue sleeve as the Hobby catalogue face", () => {
    expect(dig.slug).toBe("tin-box-hobby");
    expect(dig.ingest).toContain("wrappers/tin-box-hobby.png");
    expect(
      existsSync(
        path.join(narutoCuratedProductsDir(), "wrappers", "tin-box-hobby.png"),
      ),
    ).toBe(true);
    expect(NARUTO_SEALED_SKUS.find((row) => row.slug === "tin-box-hobby")).toMatchObject({
      stagingFile: "tin-box-hobby.png",
      stagingKind: "wrappers",
      name: "Tin Box Hobby",
    });
  });
});
