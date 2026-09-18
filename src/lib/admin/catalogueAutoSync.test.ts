import { describe, expect, it } from "vitest";

import { catalogSkipsAutoSync } from "@/lib/admin/catalogueAutoSync";

describe("catalogSkipsAutoSync", () => {
  it.each([
    { lifecycle: undefined, skip: false },
    { lifecycle: "living", skip: false },
    { lifecycle: "finished", skip: true },
  ] as const)("lifecycle $lifecycle → skip=$skip", ({ lifecycle, skip }) => {
    expect(catalogSkipsAutoSync(lifecycle)).toBe(skip);
  });
});
