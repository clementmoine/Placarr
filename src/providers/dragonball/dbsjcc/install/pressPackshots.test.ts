import { describe, expect, it } from "vitest";

import {
  carddassFrIngestPackshots,
  pressIngestPackshots,
  pressPackshotLedger,
} from "./pressPackshots";

describe("pressPackshots", () => {
  it("covers themed starters part1–10 and dual decks for part4/5", () => {
    const ledger = pressPackshotLedger();
    expect(ledger.products.length).toBeGreaterThanOrEqual(20);
    const rows = pressIngestPackshots();
    const bySlug = new Map(rows.map((r) => [r.slug, r]));

    expect(bySlug.get("part1-booster-1188")).toBeUndefined();
    expect(bySlug.get("part2-starter-1193")?.title).toContain("Éveil");
    expect(bySlug.get("part2-starter-ruban-rouge")?.mint).toBe(true);
    expect(bySlug.get("part2-starter-ruban-rouge")?.host).toBe("vialudibunda");
    expect(bySlug.get("part3-starter-1197")?.title).toContain("Retour de Goku");
    expect(bySlug.get("part3-starter-championnat")?.mint).toBe(true);
    expect(bySlug.get("part3-starter-championnat")?.host).toBe("dbzcollection");
    expect(bySlug.get("part3-starter-championnat")?.url).toContain("1197_packaging");
    expect(bySlug.get("part4-starter-1200")?.host).toBe("amazon");
    expect(bySlug.get("part4-starter-1200")?.url).toContain("51wbhDW1VSL");
    expect(bySlug.get("part4-starter-forces-du-mal")?.mint).toBe(true);
    expect(bySlug.get("part4-starter-forces-du-mal")?.host).toBe("ultrajeux");
    expect(bySlug.get("part2-booster-1192")?.host).toBe("dbcardshop");
    expect(bySlug.get("part2-booster-1192")?.face).toBe(false);
    expect(bySlug.get("part3-booster-1196")?.host).toBe("dbcardshop");
    expect(bySlug.get("part3-booster-1196")?.face).toBe(false);
    expect(bySlug.get("part4-booster-1199")?.host).toBe("dbcardshop");
    expect(bySlug.get("part4-booster-1199")?.face).toBe(false);
    expect(bySlug.get("part5-starter-1203")?.host).toBe("amazon");
    expect(bySlug.get("part5-starter-1203")?.url).toContain("61xb55o0CRL");
    expect(bySlug.get("part5-starter-resistance")?.host).toBe("centerblog");
    expect(bySlug.get("part5-starter-resistance")?.url).toContain("916c0439");
    expect(bySlug.get("part5-starter-resistance")?.mint).toBe(true);
    expect(bySlug.get("part5-booster-1202")?.host).toBe("dbcardshop");
    expect(bySlug.get("part5-booster-1202")?.face).toBe(false);
    expect(bySlug.get("part5-booster-1202")?.referer).toContain("21396748");
    expect(bySlug.get("part5-booster-box")?.mint).toBe(true);
    expect(bySlug.get("part5-booster-box")?.host).toBe("comicplanet");
    expect(bySlug.get("part6-starter-1206")?.host).toBe("amazon");
    expect(bySlug.get("part6-starter-1206")?.url).toContain("91fydENj9nS");
    expect(bySlug.get("part6-box-1510")?.title).toContain("Édition Collector");
    expect(bySlug.get("part6-box-1510")?.host).toBe("amazon");
    expect(bySlug.get("part6-box-1510")?.url).toContain("41xLrwSJlWL");
    expect(bySlug.get("part7-starter-1208")?.host).toBe("fnac");
    expect(bySlug.get("part7-starter-box-1209")?.host).toBe("ultrajeux");
    expect(bySlug.get("part7-starter-box-1209")?.url).toContain("1066.jpg");
    expect(bySlug.get("part7-booster-1207")?.host).toBe("dbcardshop");
    expect(bySlug.get("part7-booster-1207")?.face).toBe(false);
    expect(bySlug.get("part9-starter-1216")?.title).toContain("Héros");
    expect(bySlug.get("part9-starter-1216")?.host).toBe("centerblog");
    expect(bySlug.get("part9-starter-1216")?.url).toContain("758c863b");
    expect(bySlug.get("part9-booster-1215")?.host).toBe("dbcardshop");
    expect(bySlug.get("part9-booster-1215")?.face).toBe(false);
    expect(bySlug.get("part9-booster-1215")?.referer).toContain("21396761");
    expect(bySlug.get("part9-box-1512")).toBeUndefined();
    expect(bySlug.get("part8-booster-1210")?.host).toBe("deckcardmania");
    expect(bySlug.get("ss1-starter")?.mint).toBe(true);
    expect(bySlug.get("ss3-booster")?.setCode).toBe("ss3");
    expect(bySlug.get("ss4-starter")?.host).toBe("ultrajeux");
    expect(bySlug.get("ss4-starter")?.url).toContain("5330");
    expect(bySlug.get("ss5-starter")?.referer).toContain("idm=247");
    expect(bySlug.get("tinbox-2008")?.mint).toBe(true);
    expect(bySlug.get("tinbox-2008")?.setCode).toBe("tinbox");
    expect(bySlug.get("tinbox-2008")?.note).toMatch(/05056/);
    expect(bySlug.get("part6-box-1510")?.note).toMatch(/05033/);
    const tin2010 = rows.filter((r) => r.slug === "tinbox-2010");
    const tinFace = tin2010.find((r) => r.host === "invaluable" && r.ingest);
    expect(tinFace?.kind).toBe("tin");
    expect(tinFace?.note).toMatch(/05058|0581/);
    expect(tin2010.find((r) => r.host === "ultrajeux")?.face).toBe(false);
    expect(tinFace?.title).toMatch(/05058|Tin Box Boosters 2009/);
    expect(tin2010.find((r) => r.host === "ultrajeux")?.title).toMatch(
      /Ultrajeux/,
    );
    expect(bySlug.get("part6-box-1510")?.kind).toBe("tin");
    expect(bySlug.get("tinbox-2008")?.kind).toBe("tin");
  });

  it("maps carddass.fr Wayback packshots onto single SKUs without claiming face", () => {
    const rows = carddassFrIngestPackshots();
    expect(rows.length).toBeGreaterThanOrEqual(18);
    expect(rows.every((r) => r.host === "carddassfr")).toBe(true);
    expect(rows.every((r) => r.face === false)).toBe(true);
    expect(rows.every((r) => r.url.includes("web.archive.org"))).toBe(true);
    const bySlug = new Map(rows.map((r) => [r.slug, r]));
    expect(bySlug.get("part1-starter-ennemis")?.url).toMatch(/enemies_starter\.gif/);
    expect(bySlug.get("part2-starter-ruban-rouge")?.url).toMatch(/RUBAN/);
    expect(bySlug.get("part8-booster-box-1212")?.kind).toBe("display");
    expect(bySlug.get("tinbox-2008")?.url).toMatch(/Tbox08/);
    // Collages / thumbs stay out of the ingest ledger.
    expect(rows.some((r) => /packshot_serie|starters_s3|wallpaper|stuffx/i.test(r.url))).toBe(
      false,
    );
  });
});
