/**
 * Lire le fichier de faits d'un pack — ce que le catalogue ne sait pas dire.
 *
 * Un pack range à côté de son catalogue un `facts.json` : texte de la carte,
 * traits, coûts, statut tournoi… tout ce qu'une liste de tirages n'a pas. Le
 * **mécanisme** de lecture, lui, ne varie pas : un cache de module, une lecture
 * qui tolère l'absence, et une recherche par clé.
 *
 * Ce qui varie vraiment, et que le pack fournit : **comment une paire
 * (set, numéro) devient une clé**. `FB01-045_p1` est une autre illustration de
 * `FB01-045` — même fiche, donc le suffixe tombe ; un autre pack a ses propres
 * règles. C'est là que vit la connaissance du jeu, et elle y reste.
 *
 * Le cache n'est gardé que pour la racine par défaut : un test qui lit un
 * dossier temporaire ne doit pas empoisonner la lecture suivante.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";

export type FactsPayload<TEntry> = {
  version: number;
  locale?: string;
  count?: number;
  cards: Record<string, TEntry>;
};

export type FactsStore<TEntry> = {
  /** Les faits d'un tirage, ou `null` quand rien n'a été relevé pour lui. */
  factsFor: (
    setCode: string,
    number: string,
    opts?: { root?: string },
  ) => TEntry | null;
  /** Le fichier entier, pour qui veut le parcourir. */
  payload: (root?: string) => FactsPayload<TEntry> | null;
  resetCache: () => void;
};

export function createFactsStore<TEntry>(input: {
  /** Segments du pack sous la racine de données : `["dbs", "cg"]`. */
  packSegments: readonly string[];
  /**
   * De `(set, numéro)` à la clé du fichier. Rendre `null` écarte la recherche
   * — une paire qu'aucune clé ne peut représenter n'a pas de faits.
   */
  keyFor: (setCode: string, number: string) => string | null;
  /** Nom du fichier, si le pack s'écarte de la convention. */
  fileName?: string;
}): FactsStore<TEntry> {
  let cache: FactsPayload<TEntry> | null | undefined;
  const fileName = input.fileName ?? "facts.json";

  const payload = (root?: string): FactsPayload<TEntry> | null => {
    if (cache !== undefined && !root) return cache;
    let loaded: FactsPayload<TEntry> | null = null;
    try {
      const raw = JSON.parse(
        readFileSync(
          path.join(root ?? dataRoot(), ...input.packSegments, fileName),
          "utf8",
        ),
      ) as FactsPayload<TEntry>;
      /*
        Un fichier sans `cards` n'est pas un fichier vide : c'est un fichier
        d'autre chose. On le refuse plutôt que d'en tirer des lectures nulles
        qui se liraient comme « aucun fait relevé ».
      */
      loaded = raw?.cards ? raw : null;
    } catch {
      loaded = null;
    }
    if (!root) cache = loaded;
    return loaded;
  };

  return {
    payload,
    resetCache: () => {
      cache = undefined;
    },
    factsFor: (setCode, number, opts = {}) => {
      const set = setCode?.trim();
      const num = number?.trim();
      if (!set || !num) return null;
      const key = input.keyFor(set, num);
      if (!key) return null;
      return payload(opts.root)?.cards[key] ?? null;
    },
  };
}
