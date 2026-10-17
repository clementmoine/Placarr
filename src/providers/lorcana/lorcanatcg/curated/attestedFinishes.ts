/**
 * Finitions attestées sur exemplaire physique.
 *
 * Les tirages que Lorcast bouche arrivent sans finition, et ce vide est
 * délibéré : Lorcast n'a aucun champ pour la dire — ses vingt-huit champs vont
 * de `cost` à `purchase_uris` — et LorcanaJSON ne publie pas les sets promo
 * comme sets, donc ne la dira jamais non plus. Étendre le `Silver` majoritaire
 * serait une invention.
 *
 * Une carte en main, elle, tranche. Ce module verse ces observations, et
 * seulement là où aucune source ne parle : il ne contredit jamais un fait
 * déclaré, et le dit bruyamment s'il en croise un.
 *
 * **Ce qu'on stocke est une relation, pas une valeur.** Ce qui est observable à
 * l'œil, c'est « cette carte a la même finition que celle-là » — pas
 * « `Glitter` », qui est un nom interne à LorcanaJSON. On garde donc la
 * référence, et le type se résout au build depuis elle. Si LorcanaJSON corrige
 * la carte de référence, l'attestation suit au lieu de rester figée sur un nom
 * périmé.
 */
import { assetsCardUrl, cardDiskIdFromPrintKey } from "@/lib/packAssetUrls";

import ledger from "./attestedFinishes.json";

/** Greyscale art facsimile next to Lorcast art — MotifMask for attested fills. */
export const ATTESTED_ART_MASK_FILE = "mask.attested.webp";

/** Les trois axes qui composent une finition, pris ensemble. */
export type AttestedFinish = {
  foilTypes: string[] | null;
  varnishType: string | null;
  foilEffectColors: string[] | null;
};

/**
 * Print whose foil *mask* may be reused when this key has none.
 *
 * Attestations store a same-finish relation that, for observed cards, also
 * shares the foil window (e.g. P2 gold star frame: `p2-36` ↔ `6-25-p2`).
 * Finish type alone is not enough — Mickey `1-12` is the same character with
 * a different frame and must not donate its mask.
 *
 * @deprecated Prefer {@link attestedNeedsFullFoilMask}: donor character masks
 * misalign on a different art; attested fills use an art facsimile MotifMask.
 */
export function attestedFoilMaskDonor(
  printKey: string | null | undefined,
): string | null {
  const key = printKey?.trim();
  if (!key) return null;
  const entry = ledger.entries.find((row) => row.printKey === key);
  const donor = entry?.sameFinishAs?.trim();
  return donor || null;
}

/**
 * Attested Lorcast fills with a known finish but no per-print RB mask.
 * They need a stand-in MotifMask — not another print's character window.
 */
export function attestedNeedsFullFoilMask(
  printKey: string | null | undefined,
): boolean {
  return Boolean(attestedFoilMaskDonor(printKey));
}

/**
 * URL for the greyscale art facsimile (`mask.attested.webp`).
 *
 * CardFoilGlitter samples MotifMask as a luminance field of the card face —
 * a solid white plate breaks that; borrowing Lilo's window misaligns.
 */
export function attestedArtFoilMaskUrl(
  printKey: string | null | undefined,
  language: string | null | undefined,
): string | null {
  if (!attestedNeedsFullFoilMask(printKey) || !printKey) return null;
  const lang = language?.trim() || "en";
  const id = cardDiskIdFromPrintKey(printKey, lang);
  if (!id) return null;
  return assetsCardUrl("lorcana", id, ATTESTED_ART_MASK_FILE);
}

/** Une finition est vide quand aucun de ses trois axes n'est renseigné. */
function isEmpty(finish: AttestedFinish): boolean {
  return (
    !finish.foilTypes?.length &&
    finish.varnishType == null &&
    !finish.foilEffectColors?.length
  );
}

export type AttestedFinishResolution = {
  /** Ce qu'il faut appliquer, par clé de tirage. */
  finishes: Map<string, AttestedFinish>;
  /** Ce qui n'a pas pu l'être, et pourquoi. Jamais silencieux. */
  notes: string[];
};

/**
 * Résout chaque attestation contre le catalogue déjà construit.
 *
 * @param finishOf rend la finition d'une clé de tirage, ou `undefined` si le
 *   tirage n'existe pas — les deux cas se distinguent et se signalent.
 */
export function resolveAttestedFinishes(
  finishOf: (printKey: string) => AttestedFinish | undefined,
): AttestedFinishResolution {
  const finishes = new Map<string, AttestedFinish>();
  const notes: string[] = [];

  for (const entry of ledger.entries) {
    const target = finishOf(entry.printKey);
    if (target === undefined) {
      notes.push(
        `${entry.printKey} (${entry.card}) attesté, mais absent du catalogue — attestation ignorée`,
      );
      continue;
    }
    if (!isEmpty(target)) {
      notes.push(
        `${entry.printKey} (${entry.card}) porte déjà une finition déclarée — attestation ignorée, une source prime sur l'œil`,
      );
      continue;
    }

    const reference = finishOf(entry.sameFinishAs);
    if (reference === undefined) {
      notes.push(
        `${entry.printKey} : la référence ${entry.sameFinishAs} (${entry.reference}) est absente du catalogue — rien à copier`,
      );
      continue;
    }
    if (isEmpty(reference)) {
      notes.push(
        `${entry.printKey} : la référence ${entry.sameFinishAs} (${entry.reference}) n'a elle-même aucune finition — rien à copier`,
      );
      continue;
    }

    finishes.set(entry.printKey, {
      foilTypes: reference.foilTypes,
      varnishType: reference.varnishType,
      foilEffectColors: reference.foilEffectColors,
    });
    notes.push(
      `${entry.printKey} (${entry.card}) : finition ${JSON.stringify(
        reference.foilTypes,
      )} reprise de ${entry.sameFinishAs} (${entry.reference}), attestée sur exemplaire`,
    );
  }

  return { finishes, notes };
}
