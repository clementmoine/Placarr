import { describe, expect, it } from "vitest";

import {
  LIVE_PH_FINISH,
  LIVE_STD_FINISH,
  appendUnreachableLiveFinishes,
  coveredLiveKeys,
  isLiveSyntheticFinish,
  unreachableLiveKeys,
} from "./liveFinishVariants";
import type { PaperCardEntry } from "./resolveEffect";

const dualFoil: PaperCardEntry = {
  std: {
    foil: "HoloFoil_Tinsel_Amplify_J",
    shader: "Tinsel",
    cardTex: "x",
    maskTex: "mask_std",
  },
  ph: {
    foil: "HoloFoil_Rainbow_Amplify_J",
    shader: "Rainbow",
    cardTex: "x",
    maskTex: "mask_ph",
  },
};

describe("liveFinishVariants", () => {
  it("detects synthetic finish ids", () => {
    expect(isLiveSyntheticFinish(LIVE_STD_FINISH)).toBe(true);
    expect(isLiveSyntheticFinish(LIVE_PH_FINISH)).toBe(true);
    expect(isLiveSyntheticFinish("holo")).toBe(false);
  });

  it("marks ph unreachable when catalogue only lists holo", () => {
    expect([...coveredLiveKeys(dualFoil, ["holo"])]).toEqual(["std"]);
    expect(unreachableLiveKeys(dualFoil, ["holo"])).toEqual(["ph"]);
    expect(appendUnreachableLiveFinishes(["holo"], dualFoil)).toEqual([
      "holo",
      LIVE_PH_FINISH,
    ]);
  });

  it("marks std unreachable when catalogue only lists reverse", () => {
    expect(unreachableLiveKeys(dualFoil, ["reverse"])).toEqual(["std"]);
    expect(appendUnreachableLiveFinishes(["reverse"], dualFoil)).toEqual([
      "reverse",
      LIVE_STD_FINISH,
    ]);
  });

  it("adds nothing when holo + reverse already cover both", () => {
    expect(
      appendUnreachableLiveFinishes(["holo", "reverse"], dualFoil),
    ).toEqual(["holo", "reverse"]);
  });

  it("exposes both when catalogue has no foil finishes", () => {
    expect(appendUnreachableLiveFinishes(["normal"], dualFoil)).toEqual([
      "normal",
      LIVE_STD_FINISH,
      LIVE_PH_FINISH,
    ]);
  });

  it("skips NonFoil live rows", () => {
    const phOnly: PaperCardEntry = {
      std: {
        foil: "Standard_NonFoil_J",
        shader: "NonFoil",
        cardTex: "x",
        maskTex: "",
      },
      ph: dualFoil.ph,
    };
    expect(appendUnreachableLiveFinishes(["holo"], phOnly)).toEqual(["holo"]);
  });
});
