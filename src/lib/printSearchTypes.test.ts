import { describe, expect, it } from "vitest";

import { PROVIDER_MODULES } from "@/core/catalog/registry";

import { PRINT_SEARCH_MEDIA_TYPES, usesPrintSearch } from "./printSearchTypes";

describe("printSearchTypes", () => {
  it("mirrors the media types whose providers can search prints", () => {
    const fromRegistry = new Set<string>();
    for (const provider of PROVIDER_MODULES) {
      if (typeof provider.searchPrints !== "function") continue;
      for (const type of provider.info.types) fromRegistry.add(type);
    }

    expect([...PRINT_SEARCH_MEDIA_TYPES].sort()).toEqual(
      [...fromRegistry].sort(),
    );
  });

  it("answers for a type, and tolerates a missing one", () => {
    expect(usesPrintSearch("tcg")).toBe(true);
    expect(usesPrintSearch("games")).toBe(false);
    expect(usesPrintSearch(null)).toBe(false);
    expect(usesPrintSearch(undefined)).toBe(false);
    expect(usesPrintSearch("")).toBe(false);
  });
});
