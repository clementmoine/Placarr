/**
 * Lecture des faits Dragon Ball Super CG bâtis depuis le dépôt Masters.
 *
 * `data/dbs/cg/facts.json` porte ce que le catalogue ne savait pas dire :
 * le **texte de la carte**, les traits, l'ère, les mots-clés, les coûts, le
 * verso des Leaders, le statut tournoi (119 bannies, 34 limitées) et les
 * errata. Relevé du 2026-08-19 : 7 667 tirages sur leur propre ligne, 363 qui
 * reprennent celle de leur numéro de base, 403 sans faits — le dépôt s'arrête
 * avant BT30.
 *
 * Le fichier est anglophone. Une fiche française garde donc son nom et sa
 * rareté traduits, venus du catalogue, et n'emprunte ici que ce qui n'existe
 * nulle part ailleurs.
 */
import { createFactsStore } from "@/providers/shared/cardCatalogue/factsStore";

import type { DbsCgFactsEntry } from "./buildMastersFacts";
import { normalizeDbsCgNumber } from "./mastersFacts";

export type DbsCgFactsPayload = {
  version: number;
  locale?: string;
  cards: Record<string, DbsCgFactsEntry>;
};

const store = createFactsStore<DbsCgFactsEntry>({
  packSegments: ["dbs", "cg"],
  // Les Masters ont leur propre normalisation de numéro, déjà éprouvée.
  keyFor: (setCode, number) => normalizeDbsCgNumber(`${setCode}-${number}`),
});

export const resetDbsCgFactsCache = store.resetCache;
export const dbsCgFactsFor = store.factsFor;
