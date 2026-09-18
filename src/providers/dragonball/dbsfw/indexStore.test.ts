/**
 * Fusion World cards-index export — multi-lang + sibling titles.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { exportDbsFwCardsIndexJson } from "./indexStore";

describe("exportDbsFwCardsIndexJson", () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  it("keeps EN + JA titles and fills a nameless sibling with nameSource", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "dbsfw-index-"));
    dirs.push(dir);
    const out = path.join(dir, "cards-index.json");
    exportDbsFwCardsIndexJson(
      [{ printKey: "dbsfw:fb01-001", setCode: "fb01", number: "001" }],
      [
        {
          printKey: "dbsfw:fb01-001",
          lang: "en",
          fullName: "Son Goku",
        },
      ],
      [
        {
          printKey: "dbsfw:fb01-001",
          lang: "en",
          imageUrl: "https://example.test/en.webp",
        },
        {
          printKey: "dbsfw:fb01-001",
          lang: "ja",
          imageUrl: "https://example.test/ja.webp",
        },
      ],
      out,
    );
    const json = JSON.parse(readFileSync(out, "utf8")) as {
      cards: Record<
        string,
        {
          langs: Record<
            string,
            { name?: string; nameSource?: string; artUrl?: string }
          >;
        }
      >;
    };
    const entry = json.cards["dbsfw:fb01-001"];
    expect(entry?.langs.en?.name).toBe("Son Goku");
    expect(entry?.langs.en?.artUrl).toContain("en.webp");
    expect(entry?.langs.ja?.artUrl).toContain("ja.webp");
    expect(entry?.langs.ja?.name).toBe("Son Goku");
    expect(entry?.langs.ja?.nameSource).toBe("en");
  });
});
