/**
 * Map Narutopia Mythos S1 headings → official `mythos:` print identity.
 */
import {
  NARUTO_MYTHOS_KS1E2_SET_CODE,
  NARUTO_MYTHOS_KS1PROMO_SET_CODE,
} from "./parseOfficialCards";
import {
  NARUTO_MYTHOS_KS1_SET_CODE,
  mythosPrintKey,
} from "./printKey";

export type MythosNarutopiaMapped = {
  setCode: string;
  number: string;
  grouping: string | null;
  printKey: string;
  rarity: string | null;
};

/** Prefer promo / 2e éd. homes for Mythos V when resolving later. */
export function mapNarutopiaMythosHeading(
  code: string,
): MythosNarutopiaMapped | null {
  const raw = code.trim().replace(/\s+/g, " ");
  if (!raw) return null;

  if (/^legend(ray|ary)/i.test(raw)) {
    const printKey = mythosPrintKey(NARUTO_MYTHOS_KS1_SET_CODE, "lg01", null);
    if (!printKey) return null;
    return {
      setCode: NARUTO_MYTHOS_KS1_SET_CODE,
      number: "lg01",
      grouping: null,
      printKey,
      rarity: "LG",
    };
  }

  const mission = raw.match(/^mission\s*0*(\d+)$/i);
  if (mission) {
    const number = `mss${mission[1]!.padStart(2, "0")}`;
    const printKey = mythosPrintKey(NARUTO_MYTHOS_KS1_SET_CODE, number, null);
    if (!printKey) return null;
    return {
      setCode: NARUTO_MYTHOS_KS1_SET_CODE,
      number,
      grouping: null,
      printKey,
      rarity: "Mission",
    };
  }

  const mythosV = raw.match(/^mythos\s*-?\s*0*(\d+)\s*v$/i);
  if (mythosV) {
    const number = mythosV[1]!.padStart(4, "0");
    const printKey = mythosPrintKey(
      NARUTO_MYTHOS_KS1PROMO_SET_CODE,
      number,
      "v",
    );
    if (!printKey) return null;
    return {
      setCode: NARUTO_MYTHOS_KS1PROMO_SET_CODE,
      number,
      grouping: "v",
      printKey,
      rarity: "MY",
    };
  }

  const mythosPlain = raw.match(/^mythos\s*-?\s*0*(\d+)$/i);
  if (mythosPlain) {
    const number = mythosPlain[1]!.padStart(4, "0");
    // 141–148 live as MY on ks1; 145–148 also on ks1e2 — prefer ks1.
    const setCode =
      Number(number) >= 145
        ? NARUTO_MYTHOS_KS1E2_SET_CODE
        : NARUTO_MYTHOS_KS1_SET_CODE;
    const grouping = Number(number) >= 141 ? "v" : null;
    const printKey = mythosPrintKey(setCode, number, grouping);
    if (!printKey) return null;
    return {
      setCode,
      number,
      grouping,
      printKey,
      rarity: "MY",
    };
  }

  const secret = raw.match(/^secret\s*-?\s*0*(\d+)(?:\s*(v))?$/i);
  if (secret) {
    const number = secret[1]!.padStart(4, "0");
    const grouping = secret[2] ? "sv" : "s";
    const printKey = mythosPrintKey(
      NARUTO_MYTHOS_KS1_SET_CODE,
      number,
      grouping,
    );
    if (!printKey) return null;
    return {
      setCode: NARUTO_MYTHOS_KS1_SET_CODE,
      number,
      grouping,
      printKey,
      rarity: grouping === "sv" ? "SV" : "S",
    };
  }

  const rarity = raw.match(/^(C|UC|R|RA|S|SV|L)-0*(\d+)(?:\s*([A-Z]+))?$/i);
  if (rarity) {
    const letter = (rarity[1] ?? "").toUpperCase();
    const number = rarity[2]!.padStart(4, "0");
    const suffix = (rarity[3] ?? "").toUpperCase();
    let grouping: string | null = null;
    let rarityCode: string | null = letter;
    if (suffix === "A" || letter === "RA") {
      grouping = "a";
      rarityCode = "RA";
    } else if (suffix === "V") {
      grouping = "v";
    } else if (letter === "SV") {
      grouping = "sv";
    } else if (letter === "S") {
      grouping = "s";
    } else if (letter === "L") {
      grouping = "l";
    }
    const printKey = mythosPrintKey(
      NARUTO_MYTHOS_KS1_SET_CODE,
      number,
      grouping,
    );
    if (!printKey) return null;
    return {
      setCode: NARUTO_MYTHOS_KS1_SET_CODE,
      number,
      grouping,
      printKey,
      rarity: rarityCode,
    };
  }

  return null;
}
