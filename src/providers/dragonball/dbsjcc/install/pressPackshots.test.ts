import { describe, expect, it } from "vitest";

import {
  pressIngestPackshots,
  pressPackshotLedger,
} from "./pressPackshots";

describe("pressPackshots", () => {
  it("covers themed starters part1–10 and dual decks for part4/5", () => {
    const ledger = pressPackshotLedger();
    expect(ledger.products.length).toBeGreaterThanOrEqual(20);
    const rows = pressIngestPackshots();
    const bySlug = new Map(rows.map((r) => [r.slug, r]));

    expect(bySlug.get("part2-starter-1193")?.title).toContain("Éveil");
    expect(bySlug.get("part2-starter-ruban-rouge")?.mint).toBe(true);
    expect(bySlug.get("part2-starter-ruban-rouge")?.host).toBe("vialudibunda");
    expect(bySlug.get("part3-starter-1197")?.title).toContain("Retour de Goku");
    expect(bySlug.get("part3-starter-championnat")?.mint).toBe(true);
    expect(bySlug.get("part3-starter-championnat")?.host).toBe("dbzcollection");
    expect(bySlug.get("part3-starter-championnat")?.url).toContain("1197_packaging");
    expect(bySlug.get("part4-starter-1200")?.host).toBe("centerblog");
    expect(bySlug.get("part4-starter-forces-du-mal")?.mint).toBe(true);
    expect(bySlug.get("part4-starter-forces-du-mal")?.host).toBe("ultrajeux");
    expect(bySlug.get("part4-booster-1199")?.host).toBe("okkazeo");
    expect(bySlug.get("part5-starter-1203")?.host).toBe("deckcardmania");
    expect(bySlug.get("part5-starter-1203")?.url).toContain("113_i2b");
    expect(bySlug.get("part5-starter-resistance")?.host).toBe("deckcardmania");
    expect(bySlug.get("part5-starter-resistance")?.url).toContain("113_i3b");
    expect(bySlug.get("part5-starter-resistance")?.mint).toBe(true);
    expect(bySlug.get("part5-booster-1202")?.url).toContain("113_i1b");
    expect(bySlug.get("part5-booster-box")?.mint).toBe(true);
    expect(bySlug.get("part5-booster-box")?.host).toBe("comicplanet");
    expect(bySlug.get("part6-starter-1206")?.host).toBe("centerblog");
    expect(bySlug.get("part6-box-1510")?.title).toContain("Édition Collector");
    expect(bySlug.get("part6-box-1510")?.host).toBe("amazon");
    expect(bySlug.get("part6-box-1510")?.url).toContain("41xLrwSJlWL");
    expect(bySlug.get("part7-starter-1208")?.host).toBe("fnac");
    expect(bySlug.get("part7-starter-box-1209")?.host).toBe("ultrajeux");
    expect(bySlug.get("part7-starter-box-1209")?.url).toContain("1066.jpg");
    expect(bySlug.get("part7-booster-1207")?.host).toBe("okkazeo");
    expect(bySlug.get("part9-starter-1216")?.title).toContain("Héros");
    expect(bySlug.get("part9-box-1512")?.host).toBe("ultrajeux");
    expect(bySlug.get("part9-box-1512")?.url).toContain("7791");
    expect(bySlug.get("part8-booster-1210")?.host).toBe("deckcardmania");
  });
});
