import { describe, expect, it } from "vitest";

import { formatFinishLabel } from "./finishLabel";

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
