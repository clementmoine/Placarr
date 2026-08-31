import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import dig from "../curated/sources/pack-decouverte-packshot-2026-08-30.json";
import { narutoCuratedProductsDir } from "../curatedPaths";
import { NARUTO_SEALED_SKUS } from "../sealedProducts";

describe("pack-decouverte clean packshot", () => {
  it("wires wrappers/pack-decouverte.jpg as catalogue face", () => {
    expect(dig.slug).toBe("pack-decouverte");
    expect(dig.ingest).toContain("wrappers/pack-decouverte.jpg");
    expect(
      existsSync(
        path.join(
          narutoCuratedProductsDir(),
          "wrappers",
          "pack-decouverte.jpg",
        ),
      ),
    ).toBe(true);
    expect(
      NARUTO_SEALED_SKUS.find((row) => row.slug === "pack-decouverte"),
    ).toMatchObject({
      stagingFile: "pack-decouverte.jpg",
      stagingKind: "wrappers",
      lang: "FR",
      setCode: "s1",
    });
  });
});
