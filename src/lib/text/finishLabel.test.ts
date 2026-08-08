import { describe, expect, it } from "vitest";

import {
  finishLabelMessageKey,
  formatFinishLabel,
  localizeFinishLabel,
} from "./finishLabel";

describe("formatFinishLabel", () => {
  it.each([
    ["RainbowPillars", "Rainbow Pillars"],
    ["VerticalWave", "Vertical Wave"],
    ["CalendarWave", "Calendar Wave"],
    ["FreeForm1", "Free Form 1"],
    ["FreeForm2", "Free Form 2"],
    ["SeaWave", "Sea Wave"],
    ["ChromeRainbowHotFoil", "Chrome Rainbow Hot Foil"],
    ["Silver", "Silver"],
    ["Lava", "Lava"],
  ])("%s → %s", (input, expected) => {
    expect(formatFinishLabel(input)).toBe(expected);
  });
});

describe("localizeFinishLabel", () => {
  const t = (key: string) =>
    ({
      "items.finishes.none": "Regular",
      "items.finishes.nonfoil": "Regular",
      "items.finishes.normal": "Regular",
      "items.finishes.holo": "Holofoil",
      "items.finishes.reverse": "Reverse Holofoil",
      "items.finishes.firstEdition": "1st Edition",
      "items.finishes.wPromo": "W Promo",
    })[key] ?? key;

  it("uses the collector lexicon for catalogue finishes", () => {
    expect(localizeFinishLabel("None", t)).toBe("Regular");
    expect(localizeFinishLabel("normal", t)).toBe("Regular");
    expect(localizeFinishLabel("holo", t)).toBe("Holofoil");
    expect(localizeFinishLabel("reverse", t)).toBe("Reverse Holofoil");
    expect(localizeFinishLabel("firstEdition", t)).toBe("1st Edition");
    expect(finishLabelMessageKey("None")).toBe("items.finishes.none");
    expect(finishLabelMessageKey("holo")).toBe("items.finishes.holo");
  });

  it("maps synthetic Live finishes to Holofoil / Reverse Holofoil", () => {
    expect(finishLabelMessageKey("live-std")).toBe("items.finishes.holo");
    expect(finishLabelMessageKey("live-ph")).toBe("items.finishes.reverse");
    expect(localizeFinishLabel("live-std", t)).toBe("Holofoil");
    expect(localizeFinishLabel("live-ph", t)).toBe("Reverse Holofoil");
  });

  it("keeps named foil finishes as spaced CamelCase", () => {
    expect(localizeFinishLabel("RainbowPillars", t)).toBe("Rainbow Pillars");
    expect(finishLabelMessageKey("Silver")).toBeNull();
  });
});
