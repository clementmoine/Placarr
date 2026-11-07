/**
 * Shared TCG catalogue face attachment role.
 *
 * Shape: `{game}-face-{lang}-{source}` (e.g. `mythos-face-fr-kana`,
 * `pokemon-face-en-live`). When language is unknown: `{game}-face-{source}`.
 *
 * Affiche chips parse language + « Face » from this — keep the contract stable
 * across localTcgLine, Carddass, Pokémon, Lorcana, …
 */

const LANG_RE = /^[a-z]{2}$/;
const SOURCE_RE = /[^a-z0-9]+/g;

export function tcgFaceAttachmentRole(opts: {
  printGame: string;
  lang?: string | null;
  /** Dump / provenance token (`kana`, `live`, `carddass`, `art`, …). */
  source?: string | null;
}): string {
  const game = opts.printGame.trim().toLowerCase() || "tcg";
  const lang = opts.lang?.trim().toLowerCase() || "";
  const rawSource = opts.source?.trim().toLowerCase() || "art";
  const sourceToken = rawSource.replace(SOURCE_RE, "") || "art";
  if (lang && LANG_RE.test(lang)) {
    return `${game}-face-${lang}-${sourceToken}`;
  }
  return `${game}-face-${sourceToken}`;
}
