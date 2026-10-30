import { describe, expect, it } from "vitest";

import { dbsJccNikitaBackDataPaths } from "./nikitaBack";

describe("dbsJccNikitaBackDataPaths", () => {
  it("writes URL-recoverable Nikita sleeve under data/jcc/cards, not curated", () => {
    const paths = dbsJccNikitaBackDataPaths();
    for (const p of [paths.ja, paths.en]) {
      expect(p).toMatch(/[/\\]data[/\\]dragonball[/\\]jcc[/\\]cards[/\\]/);
      expect(p).not.toMatch(/curated/);
      expect(p).toMatch(/back\.(ja|en)\.webp$/);
    }
  });
});
