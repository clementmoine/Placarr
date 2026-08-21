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
import ledger from "./attestedFinishes.json";

/** Les trois axes qui composent une finition, pris ensemble. */
export type AttestedFinish = {
  foilTypes: string[] | null;
  varnishType: string | null;
  foilEffectColors: string[] | null;
};

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
