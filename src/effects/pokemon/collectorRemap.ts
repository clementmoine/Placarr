/**
 * Collector-number remaps when TCGdex localIds do not match Live CDN nums
 * on the shared stem (Shiny Vault inside Hidden Fates, etc.).
 */

import { reprintMetaForTcgdexSet } from "./reprintMeta";

/** Live sm11-5 packs HF main (1–68) then Shiny Vault at 70–163 (= 69 + SV#). */
export const SM115_SHINY_VAULT_LIVE_OFFSET = 69;

/**
 * Map a TCGdex collector number onto the Live table number for a given set.
 * Returns the original string when no remap applies (caller still digit-strips).
 */
export function remapCollectorNumberForLive(
  tcgdexSetId: string | null | undefined,
  collectorNumber: string | number | null | undefined,
): string | null {
  if (collectorNumber == null) return null;
  const set = tcgdexSetId?.trim().toLowerCase() ?? "";
  const raw = String(collectorNumber).trim();
  if (!raw) return null;

  if (set === "sma") {
    const shiny = /^sv(\d+)$/i.exec(raw);
    if (shiny) {
      const sv = Number.parseInt(shiny[1]!, 10);
      if (sv >= 1) return String(SM115_SHINY_VAULT_LIVE_OFFSET + sv);
    }
  }

  // Auto: TCGdex `*sv` vault splits → offset from generated reprintMeta.json
  const reprint = reprintMetaForTcgdexSet(set);
  if (reprint) {
    const shiny = /^sv(\d+)$/i.exec(raw);
    if (shiny) {
      const sv = Number.parseInt(shiny[1]!, 10);
      if (sv >= 1) return String(reprint.svOffset + sv);
    }
  }

  return raw;
}
