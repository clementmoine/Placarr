import { describe, expect, it } from "vitest";

import { PROVIDER_MODULES } from "./registry";

describe("provider registry manifest", () => {
  it("lists modules with unique ids, types, and capabilities", () => {
    const ids = PROVIDER_MODULES.map((mdl) => mdl.info.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const mdl of PROVIDER_MODULES) {
      expect(mdl.info.label.trim().length).toBeGreaterThan(0);
      expect(mdl.info.types.length).toBeGreaterThan(0);
      expect(mdl.info.capabilities.length).toBeGreaterThan(0);
    }
  });
});
