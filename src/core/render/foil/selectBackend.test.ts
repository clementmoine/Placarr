import { describe, expect, it } from "vitest";

import { selectFoilBackend } from "./selectBackend";

describe("selectFoilBackend", () => {
  const ready = {
    supportsWebgl2: true,
    hasMaterial: true,
    hasPoolSlot: true,
  };

  it("always picks css when preference is css", () => {
    expect(
      selectFoilBackend({ preference: "css", ...ready }),
    ).toBe("css");
    expect(
      selectFoilBackend({
        preference: "css",
        supportsWebgl2: false,
        hasMaterial: false,
        hasPoolSlot: false,
      }),
    ).toBe("css");
  });

  it("picks webgl when preference is webgl and requirements are met", () => {
    expect(
      selectFoilBackend({ preference: "webgl", ...ready }),
    ).toBe("webgl");
  });

  it("falls back to css when webgl preference cannot be satisfied", () => {
    expect(
      selectFoilBackend({
        preference: "webgl",
        supportsWebgl2: false,
        hasMaterial: true,
        hasPoolSlot: true,
      }),
    ).toBe("css");
    expect(
      selectFoilBackend({
        preference: "webgl",
        supportsWebgl2: true,
        hasMaterial: false,
        hasPoolSlot: true,
      }),
    ).toBe("css");
    expect(
      selectFoilBackend({
        preference: "webgl",
        supportsWebgl2: true,
        hasMaterial: true,
        hasPoolSlot: false,
      }),
    ).toBe("css");
  });

  it("auto behaves like webgl preference", () => {
    expect(
      selectFoilBackend({ preference: "auto", ...ready }),
    ).toBe("webgl");
    expect(
      selectFoilBackend({
        preference: "auto",
        supportsWebgl2: true,
        hasMaterial: true,
        hasPoolSlot: false,
      }),
    ).toBe("css");
  });
});
