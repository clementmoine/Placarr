import type { MetadataFact } from "@/services/metadata";

/**
 * Consensus multi-sources pour les notes et l'âge (PEGI).
 *
 * Principe : plus on a de sources qui convergent, plus la donnée est fiable.
 * - Notes : médiane des notes normalisées (/10), à partir de toutes les sources.
 * - PEGI : valeur la plus fréquente (mode) ; en cas d'égalité, la plus élevée
 *   (prudence : on ne sous-estime jamais l'âge conseillé).
 *
 * Fonctions pures → testables et déterministes.
 */

const CONSENSUS_SOURCE = "consensus";
const CONSENSUS_RATING_LABEL = "Note";
const VALID_PEGI_AGES = new Set([3, 7, 12, 16, 18]);

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Convertit une note ("16/20", "8.5/10", "82%") en ratio 0..1, sinon null. */
export function parseRatingRatio(value: string): number | null {
  if (!value) return null;
  const v = value.trim();

  const pct = v.match(/^(\d+(?:[.,]\d+)?)\s*%$/);
  if (pct) return clamp01(parseFloat(pct[1].replace(",", ".")) / 100);

  const frac = v.match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/);
  if (frac) {
    const num = parseFloat(frac[1].replace(",", "."));
    const den = parseFloat(frac[2].replace(",", "."));
    if (den > 0) return clamp01(num / den);
  }
  return null;
}

/** Extrait l'âge PEGI ("PEGI 12", "12+", "12") parmi les valeurs valides. */
export function parsePegiAge(value: string): number | null {
  if (!value) return null;
  const m = value.match(/\b(3|7|12|16|18)\b/);
  if (!m) return null;
  const age = Number(m[1]);
  return VALID_PEGI_AGES.has(age) ? age : null;
}

function isConsensusRating(fact: MetadataFact): boolean {
  return (
    fact.kind === "rating" &&
    (fact.source === CONSENSUS_SOURCE || fact.label === CONSENSUS_RATING_LABEL)
  );
}

/** Note de consensus (médiane /10) si ≥2 sources notées convergent, sinon null. */
export function computeRatingConsensus(
  facts: MetadataFact[],
): MetadataFact | null {
  const ratings = facts.filter(
    (f) => f.kind === "rating" && !isConsensusRating(f),
  );
  const parsed = ratings
    .map((f) => ({ fact: f, ratio: parseRatingRatio(f.value) }))
    .filter(
      (x): x is { fact: MetadataFact; ratio: number } => x.ratio !== null,
    );

  if (parsed.length < 2) return null;

  const score = median(parsed.map((x) => x.ratio));
  const sources = Array.from(
    new Set(ratings.map((f) => f.source || f.label).filter(Boolean)),
  );

  return {
    kind: "rating",
    label: CONSENSUS_RATING_LABEL,
    value: `${(score * 10).toFixed(1)}/10`,
    source: CONSENSUS_SOURCE,
    unit: sources.length > 0 ? sources.join(", ") : undefined,
    confidence: Math.min(1, 0.5 + parsed.length * 0.15),
    priority: 200,
  };
}

/** PEGI consensuel (mode ; égalité → âge le plus élevé) si présent, sinon null. */
export function computeAgeConsensus(
  facts: MetadataFact[],
): MetadataFact | null {
  const pegis = facts.filter(
    (f) => f.kind === "age-rating" && /pegi/i.test(f.label),
  );
  const ages = pegis
    .map((f) => parsePegiAge(f.value))
    .filter((a): a is number => a !== null);
  if (ages.length === 0) return null;

  const counts = new Map<number, number>();
  for (const age of ages) counts.set(age, (counts.get(age) ?? 0) + 1);

  let chosen = ages[0];
  let bestCount = 0;
  for (const [age, count] of counts) {
    if (count > bestCount || (count === bestCount && age > chosen)) {
      chosen = age;
      bestCount = count;
    }
  }

  const sources = Array.from(
    new Set(pegis.map((f) => f.source).filter(Boolean)),
  );
  return {
    kind: "age-rating",
    label: "PEGI",
    value: `PEGI ${chosen}`,
    source: sources.length > 0 ? sources.join(", ") : CONSENSUS_SOURCE,
    confidence: Math.min(1, 0.5 + ages.length * 0.15),
    priority: 150,
  };
}

/**
 * Applique le consensus : ajoute une note de consensus (en tête) et remplace
 * les multiples PEGI par la valeur consensuelle. Idempotent.
 */
export function applyConsensus(facts: MetadataFact[]): MetadataFact[] {
  if (!Array.isArray(facts) || facts.length === 0) return facts;

  // Repart d'une base sans facts de consensus précédents (idempotence).
  const base = facts.filter((f) => !isConsensusRating(f));

  const consensusRating = computeRatingConsensus(base);
  const consensusPegi = computeAgeConsensus(base);

  let result = base;
  if (consensusPegi) {
    result = result.filter(
      (f) => !(f.kind === "age-rating" && /pegi/i.test(f.label)),
    );
    result = [...result, consensusPegi];
  }
  if (consensusRating) {
    result = [consensusRating, ...result];
  }
  return result;
}
