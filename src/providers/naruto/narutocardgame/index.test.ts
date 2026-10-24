import { describe, expect, it } from "vitest";

import { narutocardgameModule } from "./index";
import {
  NARUTO_CARDGAME_EFFECT_PACK_ID,
  NARUTO_CARDGAME_PACK_ID,
  NARUTO_CARDGAME_PRINT_GAME,
  NARUTO_CARDGAME_PROVIDER_ID,
} from "./pack";
import { narutoCardgamePrintKey } from "./printKey";

describe("narutocardgame module", () => {
  it("exposes a living empty local catalogue line", () => {
    expect(narutocardgameModule.info.id).toBe(NARUTO_CARDGAME_PROVIDER_ID);
    expect(narutocardgameModule.catalog?.dataPack).toBe(NARUTO_CARDGAME_PACK_ID);
    expect(narutocardgameModule.catalog?.effectPack).toBe(
      NARUTO_CARDGAME_EFFECT_PACK_ID,
    );
    expect(narutocardgameModule.printGames).toEqual([NARUTO_CARDGAME_PRINT_GAME]);
    expect(narutoCardgamePrintKey("preview", "g01")).toBe(
      "narutocardgame:preview-g01",
    );
  });
});
