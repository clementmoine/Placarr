import { describe, expect, it } from "vitest";

import carddasCom from "./curated/sources/carddas-com-naruto.json";
import dreamHobby from "./curated/sources/dream-hobby.json";
import hobbysearch from "./curated/sources/hobbysearch.json";
import juggernauts from "./curated/sources/juggernauts-xrea.json";
import tvTokyo from "./curated/sources/tv-tokyo-naruto-goods.json";
import yahooShopping from "./curated/sources/yahoo-shopping.json";

describe("JP VPN 2026-08-18 source probes", () => {
  it("records the Juggernauts SKU table without minting jumbo as makiN", () => {
    expect(juggernauts.ingest).toBe("none");
    expect(juggernauts.crawlLive).toBe(false);
    expect(juggernauts.url).toBe("http://card.g1.xrea.com/t2/tbc28nrt.html");
    expect(juggernauts.skuNotInSetsJson.map((row) => row.name)).toEqual([
      "秘儀伝授スターター",
      "極意忍法帳",
      "忍法法札絵巻",
      "雪姫忍法帳",
      "忍法法札絵巻2",
      "拡張ファイリングシート",
      "拡張ファイリングシート2",
      "ナルティメットカードバトルスペシャルコンボシート",
      "ナルティメットカードバトルスペシャルコンボシート2",
    ]);
    expect(
      juggernauts.skuNotInSetsJson.filter(
        (row) => row.skip === "data-carddass-mix",
      ),
    ).toHaveLength(2);
    expect(juggernauts.not).toContain("data-carddass");
    expect(juggernauts.not).toContain("faces");
  });

  it("keeps dream-hobby and TV Tokyo as SKU copy, not face dumps", () => {
    expect(dreamHobby.ingest).toBe("none");
    expect(dreamHobby.startersNamed).toContain("蝦蟇の書");
    expect(dreamHobby.maki16Split.carddass100).toBe("火の継承者編");
    expect(tvTokyo.ingest).toBe("none");
    expect(tvTokyo.pages[0]?.starters?.map((row) => row.set)).toEqual([
      "maki5",
      "maki8",
      "maki10",
    ]);
    expect(tvTokyo.pages[2]?.not).toContain("maki1");
  });

  it("does not treat Yahoo Shopping or HobbySearch as new face hosts", () => {
    expect(yahooShopping.ingest).toBe("none");
    expect(yahooShopping.crawlLive).toBe(false);
    expect(yahooShopping.sameAs).toBe("suruga-ya-carddass.json");
    expect(yahooShopping.sampleIds[0]).toMatch(/^GL/);
    expect(hobbysearch.ingest).toBe("none");
    expect(hobbysearch.note).toMatch(/0 product tiles/);
    expect(
      carddasCom.live["vpnTokyo2026-08-18"]["www.carddas.com/naruto"],
    ).toBe(404);
  });
});
