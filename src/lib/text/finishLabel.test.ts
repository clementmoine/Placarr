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
      "items.finishes.none": "Normal",
      "items.finishes.nonfoil": "Normal",
      "items.finishes.normal": "Normal",
    })[key] ?? key;

  it("translates plain finishes", () => {
    expect(localizeFinishLabel("None", t)).toBe("Normal");
    expect(localizeFinishLabel("nonfoil", t)).toBe("Normal");
    expect(finishLabelMessageKey("None")).toBe("items.finishes.none");
  });

  it("keeps named foil finishes as spaced CamelCase", () => {
    expect(localizeFinishLabel("RainbowPillars", t)).toBe("Rainbow Pillars");
    expect(finishLabelMessageKey("Silver")).toBeNull();
  });
});
