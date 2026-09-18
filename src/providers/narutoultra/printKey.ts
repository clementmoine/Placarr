import { buildPrintKey } from "@/core/identify/printKey";

/**
 * Ultra Challenge n'a qu'un seul set : cent cartes numérotées 1 à 100.
 *
 * `uc` ne heurte aucun code voisin — le Carddass écrit `s1`…`s28`, `tp*`,
 * `maki*`, `promo` ; Ninja Ranks `nr`/`ff`/`sd`/`nw`/`bl`/`pn` ; le 疾風伝
 * `maku*`, `gaku`, `coin`. Vérifié en base avant de le choisir.
 */
export const NARUTO_ULTRA_SET_CODE = "uc";

/** `naruto:uc-0001`. */
export function ultraChallengePrintKey(number: string): string | null {
  return buildPrintKey({
    game: "naruto",
    set: NARUTO_ULTRA_SET_CODE,
    number,
  });
}

/** Référence telle qu'elle est imprimée : `1`, `47`, `100` — jamais `0047`. */
export function formatUltraChallengeReference(number: string): string {
  const n = Number.parseInt(number.trim(), 10);
  return Number.isFinite(n) ? String(n) : number.trim();
}

export function ultraChallengeSetLabel(): string {
  return "Ultra Challenge";
}
