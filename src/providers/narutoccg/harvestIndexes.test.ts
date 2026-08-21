import { describe, expect, it } from "vitest";

import gamexfood from "./curated/sources/gamexfood.json";
import liveinternet from "./curated/sources/liveinternet.json";
import retrotcg from "./curated/sources/retrotcg.json";
import tradecardsonline from "./curated/sources/tradecardsonline.json";
import vintage from "./curated/sources/vintage-naruto-ccg.json";
import { VINTAGE_NARUTO_SET_SLUGS } from "./parseVintageNarutoCcg";

describe("liveinternet naruto_boys", () => {
  it("only keeps attachments named on archived posts, not brute-forced ids", () => {
    expect(liveinternet.ingest).toBe("none");
    expect(liveinternet.skip).toContain("brute-force-attach-ids");
    expect(liveinternet.postsFromHub.map((row) => row.number).sort()).toEqual([
      "ni089",
      "ni142",
      "ni155",
      "ta151",
    ]);
    expect(liveinternet.holesNotOnArchivedHub).toEqual([
      "ni232",
      "ni236",
      "ni252",
      "ni253",
      "ta221",
      "ta226",
    ]);
  });
});

describe("RetroTCG naruto-ccg", () => {
  it("is the CCG Trader set list, not a second face dump", () => {
    expect(retrotcg.ingest).toBe("none");
    expect(retrotcg.gamesIndexNarutoSlugs).toEqual(["naruto-ccg"]);
    expect(retrotcg.skip).toContain("shinobis-dream");
    expect(retrotcg.sameAssetsAs).toBe("vintage-naruto-ccg.json");
    expect(retrotcg.sampleAssetId).toBe("7le1t5u9evswcck4");
    const official = retrotcg.sets.filter((slug) => slug !== "shinobis-dream");
    expect(new Set(official)).toEqual(
      new Set(Object.keys(VINTAGE_NARUTO_SET_SLUGS)),
    );
    expect(retrotcg.tins).toEqual([
      "fierce-ambitions",
      "untouchables",
      "ultimate-battle",
      "rebirth",
    ]);
    expect(vintage.ingest).toBe("faces");
  });
});

describe("TradeCardsOnline game 48 Wayback 2008", () => {
  it("recovered the search form without ingesting dream-card faces", () => {
    expect(tradecardsonline.ingest).toBe("none");
    expect(tradecardsonline.wayback.htmlThisSession).toBe(true);
    expect(tradecardsonline.wayback.timestamp).toBe("20081205121420");
    expect(tradecardsonline.series2008.map((row) => row.setCode)).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
      "s5",
      "s6",
      "s7",
      "s8",
      "s9",
      "s10",
      "promo",
    ]);
    expect(tradecardsonline.types2008).toEqual([
      "Ninja",
      "Jutsu",
      "Mission",
      "Client",
    ]);
    expect(tradecardsonline.related.dreamCards).toContain("goal/DC");
  });
});

describe("GameXFood S6 IT booster URL", () => {
  it("records the 404 without inventing another product path", () => {
    expect(gamexfood.ingest).toBe("none");
    expect(gamexfood.status).toBe(404);
    expect(gamexfood.skip).toContain("site-wide-crawl");
  });
});
