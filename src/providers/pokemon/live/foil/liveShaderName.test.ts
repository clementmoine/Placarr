import { describe, expect, it } from "vitest";

import { resolveLiveFoilName } from "@/providers/pokemon/live/foil/liveShaderName";

describe("resolveLiveFoilName", () => {
  it("reads the foil stem stamped inside the shader blob", () => {
    expect(
      resolveLiveFoilName({
        parsedName: "Hidden/Internal",
        chunks: [
          {
            platform: null,
            data: new TextEncoder().encode(
              "path TPCi/Cards3D/HoloFoil/PikachuFoil end",
            ),
          },
        ],
      }),
    ).toBe("PikachuFoil");
  });

  it("uses the parsed path when it already names the foil", () => {
    expect(
      resolveLiveFoilName({
        parsedName: "TPCi/Cards3D/Standard/FlatSilver",
        chunks: [],
      }),
    ).toBe("FlatSilver");
  });
});
