import { describe, expect, it } from "vitest";

import {
  ENGLISH_NUMBER_WORD_MAP,
  englishNumberWordToDigits,
} from "@/core/enrich/titles/numberWords";

describe("englishNumberWordToDigits", () => {
  it.each([
    ["two", "2"],
    ["Twelve", "12"],
    ["hundred", "100"],
  ])("maps %s → %s", (word, digits) => {
    expect(englishNumberWordToDigits(word)).toBe(digits);
  });

  it("rejects non-number tokens", () => {
    expect(englishNumberWordToDigits("zelda")).toBeNull();
  });

  it("covers a closed 1–20 + tens taxonomy", () => {
    expect(Object.keys(ENGLISH_NUMBER_WORD_MAP).length).toBeGreaterThanOrEqual(
      20,
    );
  });
});
