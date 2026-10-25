import { describe, expect, it } from "vitest";

import { narutoCardgameBackTierFromPrintKey } from "./cardBack";

describe("narutoCardgameBackTierFromPrintKey", () => {
  it.each([
    ["narutocardgame:demo-c001", "chakra"],
    ["narutocardgame:promo-cp001-event", "chakra"],
    ["narutocardgame:premium00-c002-premiumvol00", "chakra"],
    ["narutocardgame:demo-s001", "summon"],
    ["narutocardgame:premium00-s001-premiumvol00", "summon"],
    ["narutocardgame:demo-n001", "leader"],
    ["narutocardgame:demo-n012", "leader"],
    ["narutocardgame:demo-n005", null],
    ["narutocardgame:preview-g01", null],
    ["narutocardgame:n01-sample19", null],
    ["narutocardgame:demo-k039", null],
    ["lorcana:6-48", null],
    ["", null],
  ] as const)("%s → %s", (printKey, tier) => {
    expect(narutoCardgameBackTierFromPrintKey(printKey)).toBe(tier);
  });
});
