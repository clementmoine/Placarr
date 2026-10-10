/**
 * Préremplit le sélecteur d'ajout de carte depuis le **nom d'étagère**.
 *
 * Aucun provider id en dur : on score le nom contre `catalogueLabel` + aliases
 * annoncés par chaque catalogue. Un match ambigu (plusieurs Naruto, score
 * faible) ne force rien — vide honnête, pas de faux positif confiant.
 */
import { catalogLabelSimilarity } from "@/core/enrich/titles/titleSimilarity";
import { distinctiveTitleTokens } from "@/core/enrich/titles/catalogTitleTokens";
import { normalizeDisplayTitle } from "@/core/enrich/titles/displayScore";
import { titleTokenPresentInSet } from "@/core/enrich/titles/tokenEquivalents";

export type PrintPickerCatalogueHint = {
  id: string;
  label: string;
  aliases?: ReadonlyArray<{
    label: string;
    language?: string;
  }>;
  defaultLanguage?: string | null;
  languages?: readonly string[];
  sets?: ReadonlyArray<{ id: string; label: string }>;
};

export type PrintPickerOwnedHint = {
  printKey?: string | null;
  language?: string | null;
};

export type PrintPickerDefaults = {
  catalogueId: string | null;
  language: string | null;
  setId: string | null;
};

const MIN_CATALOGUE_SCORE = 0.78;
/** Écart minimum avec le 2ᵉ pour déclarer un vainqueur unique. */
const MIN_SCORE_GAP = 0.1;

const CJK_RE =
  /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u4e00-\u9faf\uac00-\ud7af]/;

/**
 * Tokens d'un libellé catalogue. Si le libellé portait du CJK et que la
 * normalisation ne laisse que la racine latine (« Naruto 疾風伝 » → naruto),
 * on ajoute un sentinelle pour qu'une étagère « Naruto » ne gagne pas.
 */
function catalogueTokens(label: string): string[] {
  const tokens = distinctiveTitleTokens(label);
  if (CJK_RE.test(label) && !tokens.some((token) => CJK_RE.test(token))) {
    return [...tokens, "__cjk__"];
  }
  return tokens;
}

function tokenCoverage(needles: string[], haystack: string[]): number {
  if (needles.length === 0) return 0;
  const set = new Set(haystack);
  const matched = needles.filter((token) =>
    titleTokenPresentInSet(token, set),
  ).length;
  return matched / needles.length;
}

/**
 * Score étagère → libellé catalogue.
 *
 * - Le libellé doit être **entier** dans le nom d'étagère (on étend avec un
 *   set : « Lorcana Premier Chapitre »).
 * - Un préfixe franchise seul (« Naruto ») ne capture pas « Naruto Carddass ».
 */
function shelfCatalogueScore(shelfName: string, label: string): number {
  const shelfTokens = distinctiveTitleTokens(shelfName);
  const labelTokens = catalogueTokens(label);
  if (shelfTokens.length === 0 || labelTokens.length === 0) return 0;

  const labelInShelf = tokenCoverage(labelTokens, shelfTokens);
  if (labelInShelf < 1) {
    // Proche mais incomplet — score faible pour le gap, sous le seuil.
    return Math.min(catalogLabelSimilarity(shelfName, label), 0.7);
  }

  if (labelTokens.length === 1) {
    // Jeu à un mot (« Lorcana », « Pokémon ») : jeu seul, ou jeu + extension.
    if (shelfTokens.length === 1) return 0.95;
    return 0.9;
  }

  const shelfInLabel = tokenCoverage(shelfTokens, labelTokens);
  /*
    Parmi les libellés entièrement contenus, le plus **spécifique** gagne :
    « Naruto Shippuden Collectible Card Game » bat « Naruto Shippuden Card
    Game » (sous-chaîne) grâce au ratio longueur libellé / étagère.
  */
  const specificity =
    labelTokens.length / Math.max(shelfTokens.length, labelTokens.length);
  return 0.4 + 0.5 * specificity + 0.1 * shelfInLabel;
}

type ScoredAlias = {
  catalogueId: string;
  score: number;
  languageFromAlias: string | null;
};

function aliasEntries(
  catalogue: PrintPickerCatalogueHint,
): Array<{ label: string; language?: string }> {
  const rows = [{ label: catalogue.label }, ...(catalogue.aliases ?? [])];
  const seen = new Set<string>();
  const out: Array<{ label: string; language?: string }> = [];
  for (const row of rows) {
    const key = normalizeDisplayTitle(row.label).join(" ");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function pickLanguage(options: {
  catalogue: PrintPickerCatalogueHint;
  languageFromAlias: string | null;
  owned: readonly PrintPickerOwnedHint[];
}): string | null {
  const announced = new Set(
    (options.catalogue.languages ?? []).map((code) => code.toLowerCase()),
  );
  const allow = (code: string | null | undefined): string | null => {
    const normalized = code?.trim().toLowerCase() ?? "";
    if (!normalized || normalized === "unknown") return null;
    if (announced.size > 0 && !announced.has(normalized)) return null;
    return normalized;
  };

  if (options.languageFromAlias) {
    const fromAlias = allow(options.languageFromAlias);
    if (fromAlias) return fromAlias;
  }

  const counts = new Map<string, number>();
  for (const row of options.owned) {
    const code = allow(row.language);
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  if (counts.size > 0) {
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const [top, topCount] = ranked[0]!;
    const secondCount = ranked[1]?.[1] ?? 0;
    if (topCount > secondCount) return top;
  }

  return allow(options.catalogue.defaultLanguage ?? null);
}

function pickSetId(
  shelfName: string,
  catalogue: PrintPickerCatalogueHint,
): string | null {
  const sets = catalogue.sets ?? [];
  if (sets.length === 0) return null;

  const shelfTokens = distinctiveTitleTokens(shelfName);
  const catalogueTokenSet = new Set(
    aliasEntries(catalogue).flatMap((entry) => catalogueTokens(entry.label)),
  );

  const scored = sets
    .map((set) => {
      const setTokens = distinctiveTitleTokens(set.label);
      const extra = setTokens.filter(
        (token) => !titleTokenPresentInSet(token, catalogueTokenSet),
      );
      // Tokens d'extension au-delà du nom du jeu, tous présents dans l'étagère.
      const extraInShelf =
        extra.length > 0 ? tokenCoverage(extra, shelfTokens) : 0;
      const score =
        extraInShelf >= 1
          ? 0.88 + 0.08 * Math.min(1, extra.length / 3)
          : catalogLabelSimilarity(shelfName, set.label);
      return { id: set.id, score, extraCount: extra.length };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  if (!best || best.extraCount === 0 || best.score < MIN_CATALOGUE_SCORE) {
    return null;
  }
  if (second && best.score - second.score < MIN_SCORE_GAP) return null;
  return best.id;
}

/**
 * Infer catalogue / language / set from a shelf name + announced catalogues.
 *
 * Returns nulls when the name is empty or ambiguous.
 */
export function inferPrintPickerDefaults(
  shelfName: string | null | undefined,
  catalogues: readonly PrintPickerCatalogueHint[],
  owned: readonly PrintPickerOwnedHint[] = [],
): PrintPickerDefaults {
  const name = shelfName?.trim() ?? "";
  if (!name || catalogues.length === 0) {
    return { catalogueId: null, language: null, setId: null };
  }

  const scored: ScoredAlias[] = [];
  for (const catalogue of catalogues) {
    let bestForCatalogue: ScoredAlias | null = null;
    for (const alias of aliasEntries(catalogue)) {
      const score = shelfCatalogueScore(name, alias.label);
      if (!bestForCatalogue || score > bestForCatalogue.score) {
        bestForCatalogue = {
          catalogueId: catalogue.id,
          score,
          languageFromAlias: alias.language ?? null,
        };
      }
    }
    if (bestForCatalogue) scored.push(bestForCatalogue);
  }

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1];
  if (!best || best.score < MIN_CATALOGUE_SCORE) {
    return { catalogueId: null, language: null, setId: null };
  }
  if (second && best.score - second.score < MIN_SCORE_GAP) {
    return { catalogueId: null, language: null, setId: null };
  }

  const catalogue = catalogues.find((row) => row.id === best.catalogueId);
  if (!catalogue) {
    return { catalogueId: null, language: null, setId: null };
  }

  return {
    catalogueId: catalogue.id,
    language: pickLanguage({
      catalogue,
      languageFromAlias: best.languageFromAlias,
      owned,
    }),
    setId: pickSetId(name, catalogue),
  };
}
