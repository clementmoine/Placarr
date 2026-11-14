/**
 * Quatre « logo sides » officiels (Card Types welcome) → tiers sleeve.
 * Character / EX partagent le dos pack blanc ; Leader / Chakra / Summon ont
 * chacun une couleur (voir curated/BACK.md).
 */
export type NarutoCardgameBackTier = "leader" | "chakra" | "summon";

/** Leaders attestés (N-001 Naruto, N-012 Sasuke) — refs market / type_img. */
const LEADER_NUMBERS = new Set(["n001", "n012"]);

/**
 * Tier verso depuis `printKey` (`narutocardgame:demo-c001`,
 * `…:promo-cp001-event`, `…:demo-n001`, …). `null` = dos pack Character.
 */
export function narutoCardgameBackTierFromPrintKey(
  printKey: string | null | undefined,
): NarutoCardgameBackTier | null {
  const raw = (printKey ?? "").trim().toLowerCase();
  if (!raw.startsWith("narutocardgame:")) return null;
  const body = raw.slice("narutocardgame:".length);
  // `set-number` or `set-number-grouping`
  const parts = body.split("-");
  if (parts.length < 2) return null;
  const number = parts[1] ?? "";
  if (!number) return null;

  if (number.startsWith("cp") || /^c\d/.test(number)) return "chakra";
  if (/^s\d/.test(number)) return "summon";
  if (LEADER_NUMBERS.has(number)) return "leader";
  return null;
}
