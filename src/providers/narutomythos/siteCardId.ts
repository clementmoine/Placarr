/**
 * Card ids from narutomythos.com (`KS-106-A`, `KS-M08`, …) → Mythos printKeys.
 *
 * Fan site only — map onto official CICABOOM keys; never invent catalogue rows.
 */
import {
  NARUTO_MYTHOS_KS1_SET_CODE,
  NARUTO_MYTHOS_KS1E2_SET_CODE,
  NARUTO_MYTHOS_KS1PROMO_SET_CODE,
  mythosPrintKey,
} from "./printKey";

const PREFIX_TO_SET: Record<string, string> = {
  KS: NARUTO_MYTHOS_KS1_SET_CODE,
  SS: "ss2",
  AK: "ak3",
};

/**
 * Grouping letter on the fan-site id (`A` / `V` / `SV`).
 * Rarity codes on the site (`AR`, `MY`) are not on the id itself.
 */
export function groupingFromNarutomythosSiteSuffix(
  suffix: string | null | undefined,
): string | null {
  const letter = (suffix ?? "").trim().toUpperCase();
  if (!letter) return null;
  if (letter === "A") return "a";
  if (letter === "V") return "v";
  if (letter === "SV") return "sv";
  // Fan DB « ES » = exclu FR (tome / promo) — printed as Mythos V.
  if (letter === "ES") return "v";
  return null;
}

/**
 * Candidate printKeys for a marketplace / cards API id (preferred first).
 * Empty when the id is unknown or not Mythos.
 */
export function printKeysForNarutomythosSiteCardId(cardId: string): string[] {
  const raw = cardId.trim().toUpperCase().replace(/\s+/g, "");
  if (!raw) return [];

  // Showcase / legendary on the fan DB — official key is lg01.
  if (raw === "KS-000-GOLD" || raw === "KS-000" || raw === "KS-LEG01") {
    const key = mythosPrintKey(NARUTO_MYTHOS_KS1_SET_CODE, "lg01", null);
    return key ? [key] : [];
  }

  let m = raw.match(/^([A-Z]+)-M0*(\d+)$/);
  if (m) {
    const setCode = PREFIX_TO_SET[m[1]!] ?? null;
    if (!setCode) return [];
    const number = `mss${m[2]!.padStart(2, "0")}`;
    const key = mythosPrintKey(setCode, number, null);
    return key ? [key] : [];
  }

  m = raw.match(/^([A-Z]+)-LEG0*(\d+)$/);
  if (m) {
    const setCode = PREFIX_TO_SET[m[1]!] ?? null;
    if (!setCode) return [];
    const number = `lg${m[2]!.padStart(2, "0")}`;
    const key = mythosPrintKey(setCode, number, null);
    return key ? [key] : [];
  }

  m = raw.match(/^([A-Z]+)-0*(\d+)(?:-([A-Z]+))?$/);
  if (!m) return [];
  const setCode = PREFIX_TO_SET[m[1]!] ?? null;
  if (!setCode) return [];
  const number = m[2]!.padStart(4, "0");
  const grouping = groupingFromNarutomythosSiteSuffix(m[3] ?? null);
  // Unknown suffix (e.g. GOLD on a numbered card) — skip rather than guess.
  if (m[3] && !grouping) return [];

  const keys: string[] = [];
  const push = (set: string, g: string | null) => {
    const key = mythosPrintKey(set, number, g);
    if (key && !keys.includes(key)) keys.push(key);
  };

  if (grouping === "v" || grouping === "sv") {
    push(NARUTO_MYTHOS_KS1PROMO_SET_CODE, grouping);
    push(NARUTO_MYTHOS_KS1E2_SET_CODE, grouping);
  }
  push(setCode, grouping);
  if (grouping === "a") {
    push(NARUTO_MYTHOS_KS1E2_SET_CODE, grouping);
  }
  return keys;
}

/** Primary printKey (first candidate), or null. */
export function printKeyForNarutomythosSiteCardId(
  cardId: string,
): string | null {
  return printKeysForNarutomythosSiteCardId(cardId)[0] ?? null;
}
