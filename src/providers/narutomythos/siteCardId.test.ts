import { describe, expect, it } from "vitest";

import {
  printKeyForNarutomythosSiteCardId,
  printKeysForNarutomythosSiteCardId,
} from "./siteCardId";

describe("narutomythos.com cardId → printKey", () => {
  it("maps base / alt / mission / legendary ids", () => {
    expect(printKeyForNarutomythosSiteCardId("KS-001")).toBe("mythos:ks1-0001");
    expect(printKeyForNarutomythosSiteCardId("KS-106-A")).toBe(
      "mythos:ks1-0106-a",
    );
    expect(printKeyForNarutomythosSiteCardId("KS-M08")).toBe(
      "mythos:ks1-mss08",
    );
    expect(printKeyForNarutomythosSiteCardId("KS-000-GOLD")).toBe(
      "mythos:ks1-lg01",
    );
  });

  it("prefers promo homes for V / ES exclusives", () => {
    expect(printKeysForNarutomythosSiteCardId("KS-113-V")[0]).toBe(
      "mythos:ks1promo-0113-v",
    );
    expect(printKeysForNarutomythosSiteCardId("KS-133-ES")[0]).toBe(
      "mythos:ks1promo-0133-v",
    );
  });

  it("refuses unknown suffixes instead of guessing", () => {
    expect(printKeyForNarutomythosSiteCardId("KS-010-GOLD")).toBeNull();
    expect(printKeyForNarutomythosSiteCardId("XY-001")).toBeNull();
  });
});
