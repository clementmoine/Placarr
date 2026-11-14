import { describe, expect, it } from "vitest";

import { shaderNameFromPath } from "@/lib/unity/shader";

describe("shaderNameFromPath", () => {
  it("takes the last segment of any asset path", () => {
    expect(shaderNameFromPath("Shader Graphs/FoilCard")).toBe("FoilCard");
    expect(shaderNameFromPath("")).toBeNull();
  });
});
