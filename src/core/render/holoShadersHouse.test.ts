import { describe, expect, it } from "vitest";

import {
  HOUSE_HOLO_SHADER_IDS,
  houseHoloShader,
  houseHoloShaderIdsAreSelfNaming,
} from "@/core/render/holoShadersHouse";

describe("holoShadersHouse", () => {
  it("names every look after itself", () => {
    expect(houseHoloShaderIdsAreSelfNaming()).toBe(true);
  });

  it("ships flare as the gallery lobe driven by --combined", () => {
    /*
      Catalogue packs without a captured foil (Carddass, …) land on house
      `flare`. Paint = gallery soft lobe (`.holo-flare-shimmer`); soft-light
      is on the lobe pseudo only so the full-card layer does not fringe
      corners. Motion = `--combined` (Lorcana/Pokémon idle handoff).
    */
    const flare = houseHoloShader("flare");
    expect(flare.layerClassName).toBe("holo-flare-shimmer");
    expect(flare.mixBlendMode).toBe("normal");
    expect(flare.pointerFalloff).toBe(false);
    expect(flare.backgroundImage).toBe("none");
    expect(flare.opacity).toBeUndefined();
  });

  it("keeps every other house look on painted backgrounds", () => {
    for (const id of HOUSE_HOLO_SHADER_IDS) {
      if (id === "flare") continue;
      const look = houseHoloShader(id);
      expect(look.layerClassName, id).toBeUndefined();
      expect(look.backgroundImage, id).not.toBe("none");
    }
  });
});
