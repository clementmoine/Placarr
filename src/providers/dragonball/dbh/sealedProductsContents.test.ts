/**
 * Namek starter: 6 battle UGMPS attested; avatar ID soft → contentsKnown false.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { CuratedSealedContentsFile } from "@/providers/shared/sealedProducts/curatedContents";

const curated = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "curated",
  "products-contents.json",
);

describe("dbh sealed products-contents (Namek starter)", () => {
  it("starter-pack-namek-battle — 6 UGMPS + declared 7, unknown until avatar", () => {
    const sku = (
      JSON.parse(readFileSync(curated, "utf8")) as CuratedSealedContentsFile
    ).skus["starter-pack-namek-battle"];
    expect(sku?.declaredCardCount).toBe(7);
    expect(sku?.contentsKnown).toBe(false);
    expect(sku?.guaranteedPrintKeys).toEqual([
      "dbh:ugmps-01",
      "dbh:ugmps-02",
      "dbh:ugmps-03",
      "dbh:ugmps-04",
      "dbh:ugmps-05",
      "dbh:ugmps-06",
    ]);
    expect(sku?.notes).toMatch(/avatar/i);
  });
});
