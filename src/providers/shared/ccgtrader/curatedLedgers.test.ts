import { describe, expect, it } from "vitest";

import dbscg from "@/providers/dragonball/dbscg/curated/sources/ccgtrader.json";
import mtg from "@/providers/mtg/curated/sources/ccgtrader.json";
import pokemon from "@/providers/pokemon/tcgdex/curated/sources/ccgtrader.json";
import yugioh from "@/providers/yugioh/curated/sources/ccgtrader.json";

import { ccgtraderGamePageUrl } from "./site";

const LEDGERS = [
  {
    id: "dbscg",
    ledger: dbscg,
    urlTitle: "dragon-ball-super-card-game",
    gameId: 260,
    minSets: 50,
  },
  {
    id: "mtg",
    ledger: mtg,
    urlTitle: "magic-the-gathering-ccg",
    gameId: 21,
    minSets: 1000,
  },
  {
    id: "pokemon",
    ledger: pokemon,
    urlTitle: "pokemon-tcg",
    gameId: 158,
    minSets: 150,
  },
  {
    id: "yugioh",
    ledger: yugioh,
    urlTitle: "yu-gi-oh-tcg",
    gameId: 130,
    minSets: 600,
  },
] as const;

describe("ccgtrader curated ledgers", () => {
  it.each(LEDGERS)(
    "$id is harvest-ready with matching url_title + game page",
    ({ ledger, urlTitle, gameId, minSets }) => {
      expect(ledger.ingest).toBe("none");
      expect(ledger.status).toBe("harvest");
      expect(ledger.api.urlTitle).toBe(urlTitle);
      expect(ledger.api.gameId).toBe(gameId);
      expect(ledger.api.setCount).toBeGreaterThanOrEqual(minSets);
      expect(ledger.urls.game).toBe(ccgtraderGamePageUrl(urlTitle));
      expect(ledger.harvest.urlTitle).toBe(urlTitle);
      expect(ledger.harvest.ledger).toContain("ccgtrader-sets.json");
      expect(ledger.primaryAlready.length).toBeGreaterThan(0);
    },
  );

  it("dbscg pins the Masters set slug list observed 2026-11-10", () => {
    expect(dbscg.setSlugs).toHaveLength(dbscg.api.setCount);
    expect(dbscg.setSlugs).toContain("galactic-battle-bt1");
    expect(dbscg.setSlugs).toContain("dbs-promo-cards-p");
    expect(dbscg.not).toContain("fusion-world");
  });
});
