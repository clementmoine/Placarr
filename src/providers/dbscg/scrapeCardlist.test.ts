import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseDbsCardlistHtml } from "./parseCardlist";
import { rowsFromCards } from "./scrapeCardlist";

const dir = path.dirname(fileURLToPath(import.meta.url));
const frFixture = readFileSync(
  path.join(dir, "fixtures/bt1-sample.html"),
  "utf8",
);
const enFixture = readFileSync(
  path.join(dir, "fixtures/bt1-en-leader.html"),
  "utf8",
);

describe("rowsFromCards", () => {
  it("merges FR and EN batches on printKey and keeps both names", () => {
    const { prints, titles, assets } = rowsFromCards([
      ...parseDbsCardlistHtml(frFixture, "fr"),
      ...parseDbsCardlistHtml(enFixture, "en"),
    ]);
    expect(prints.map((row) => row.printKey)).toEqual([
      "dbscg:bt1-001",
      "dbscg:bt1-005",
      "dbscg:bt1-011-spr",
    ]);
    const champa = titles.filter((row) => row.printKey === "dbscg:bt1-001");
    expect(champa).toHaveLength(2);
    expect(champa.find((row) => row.lang === "fr")?.awakenedName).toBe(
      "Champa, Dieu de la destruction",
    );
    expect(champa.find((row) => row.lang === "en")?.awakenedName).toBe(
      "God of Destruction Champa",
    );
    expect(
      assets
        .filter((row) => row.printKey === "dbscg:bt1-001")
        .map((row) => row.lang),
    ).toEqual(["fr", "en"]);
    expect(assets.find((row) => row.lang === "en")?.imageUrl).toContain(
      "/images/cardlist/cardimg/BT1-001.png",
    );
  });
});
