/**
 * Lecture des faits Fusion World récoltés sur les fiches détaillées.
 *
 * `data/dbs/fw/facts.json` porte ce que la liste de cartes ne dit pas :
 * rareté, type, couleur, coût, puissance, traits et le texte de la carte —
 * **1 919 fiches** relevées le 2026-08-19 sur les 1 927 numéros distincts du
 * pack. Les huit restants (`E-91`, `E-92`, `FP-022`, `FP-023`, `FP-082` à
 * `FP-085`) répondent 200 avec un gabarit vide : l'éditeur n'a rien publié
 * dessus, ce n'est pas une récolte ratée.
 *
 * Module séparé du récolteur exprès : celui-ci tire le client HTTP, alors que
 * lire le fichier n'a besoin que de `fs`.
 */
import { createFactsStore } from "@/providers/shared/cardCatalogue/factsStore";

import type { DbsFwCardDetail } from "./parseCardDetail";

export type DbsFwFactsPayload = {
  version: number;
  locale?: string;
  count?: number;
  cards: Record<string, DbsFwCardDetail>;
};

const store = createFactsStore<DbsFwCardDetail>({
  packSegments: ["dbs", "fw"],
  /*
    `FB01-045_p1` est une autre illustration de `FB01-045` : même fiche, même
    texte, donc le suffixe tombe.
  */
  keyFor: (setCode, number) =>
    `${setCode}-${number}`.replace(/[-_]p\d+$/i, "").toUpperCase(),
});

export const resetDbsFwFactsCache = store.resetCache;
export const dbsFwFactsFor = store.factsFor;
