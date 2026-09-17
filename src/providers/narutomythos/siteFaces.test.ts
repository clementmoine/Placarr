import { describe, expect, it } from "vitest";

import type { LocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import {
  narutomythosStorageUrl,
  resolveNarutomythosSiteCardAgainstIndex,
} from "./siteFaces";

function stubIndex(keys: readonly string[]): LocalPrintsIndex {
  const set = new Set(keys);
  return {
    lookupRow: (printKey: string) =>
      set.has(printKey)
        ? ({
            printKey,
            setCode: "",
            number: "",
            name: "",
            language: "fr",
          } as never)
        : null,
  } as LocalPrintsIndex;
}

describe("narutomythos.com faces", () => {
  it("builds storage URLs from relative API paths", () => {
    expect(narutomythosStorageUrl("cards/fr/KS-001.webp")).toBe(
      "https://www.narutomythos.com/storage/cards/fr/KS-001.webp",
    );
    expect(narutomythosStorageUrl(null)).toBeNull();
  });

  it("resolves onto an existing catalogue key (promo V before bare ks1)", () => {
    const index = stubIndex([
      "mythos:ks1promo-0133-v",
      "mythos:ks1-0133-v",
    ]);
    expect(resolveNarutomythosSiteCardAgainstIndex("KS-133-ES", index)).toEqual(
      {
        printKey: "mythos:ks1promo-0133-v",
        setCode: "ks1promo",
        number: "0133",
        grouping: "v",
      },
    );
  });

  it("does not mint when no official printKey exists", () => {
    const index = stubIndex([]);
    expect(resolveNarutomythosSiteCardAgainstIndex("KS-106-A", index)).toBeNull();
  });
});
