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
const CONSENSUS_PLAYTIME_KIND = "playtime";
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

/** Formate une durée en minutes vers "30 min" / "1 h" / "1 h 30". */
export function formatPlaytimeMinutes(total: number): string {
  if (total <= 0) return "";
  if (total % 60 === 0) return `${total / 60} h`;
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${hours} h ${String(minutes).padStart(2, "0")}`;
}

function detectDurationUnit(part: string): "h" | "min" | null {
  if (/h/.test(part)) return "h";
  if (/min/.test(part)) return "min";
  return null;
}

function parseSingleDuration(
  part: string,
  inheritedUnit: "h" | "min" | null,
): number | null {
  const s = part.trim();
  const hourMinutes = s.match(/^(\d+)\s*h\s*(\d+)?$/);
  if (hourMinutes) {
    return (
      Number(hourMinutes[1]) * 60 +
      (hourMinutes[2] ? Number(hourMinutes[2]) : 0)
    );
  }
  const minutes = s.match(/^(\d+)\s*min$/);
  if (minutes) return Number(minutes[1]);
  const bare = s.match(/^(\d+)$/);
  if (bare) {
    if (inheritedUnit === "h") return Number(bare[1]) * 60;
    if (inheritedUnit === "min") return Number(bare[1]);
  }
  return null;
}

/**
 * Convertit une durée de partie ("30mn à 1h", "1 à 2h", "45 min") en intervalle
 * [lo, hi] de minutes. Renvoie null si la valeur n'est pas exploitable avec
 * certitude (on préfère ne rien fusionner plutôt que d'inventer).
 */
export function parsePlaytimeRange(value: string): [number, number] | null {
  if (!value) return null;
  // Normalise les unités, y compris collées aux chiffres ("30mn", "1 heure").
  const normalized = value
    .toLowerCase()
    .replace(/(\d)\s*h(?:eures?|rs?)?/g, "$1h")
    .replace(/(\d)\s*(?:mn|min(?:ute)?s?)/g, "$1min")
    .trim();

  const parts = normalized
    .split(/\s*(?:à|-|–|—|\bto\b)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 1) {
    const single = parseSingleDuration(parts[0], detectDurationUnit(parts[0]));
    return single != null ? [single, single] : null;
  }
  if (parts.length === 2) {
    // L'unité n'est souvent portée que par la borne haute ("1 à 2h") : on la
    // fait hériter à la borne basse quand celle-ci n'en a pas.
    const upperUnit = detectDurationUnit(parts[1]);
    const hi = parseSingleDuration(parts[1], upperUnit);
    const lo = parseSingleDuration(
      parts[0],
      detectDurationUnit(parts[0]) ?? upperUnit,
    );
    if (lo == null || hi == null) return null;
    return [Math.min(lo, hi), Math.max(lo, hi)];
  }
  return null;
}

/**
 * Durée de partie consensuelle : union des intervalles de toutes les sources
 * (≥2) qui expriment une durée exploitable. Les sources sont créditées
 * ensemble. Renvoie null s'il n'y a pas matière à fusionner.
 */
export function computePlaytimeConsensus(
  facts: MetadataFact[],
): MetadataFact | null {
  const parsed = facts
    .filter((fact) => fact.kind === CONSENSUS_PLAYTIME_KIND)
    .map((fact) => ({ fact, range: parsePlaytimeRange(fact.value) }))
    .filter(
      (entry): entry is { fact: MetadataFact; range: [number, number] } =>
        entry.range !== null,
    );

  if (parsed.length < 2) return null;

  const lo = Math.min(...parsed.map((entry) => entry.range[0]));
  const hi = Math.max(...parsed.map((entry) => entry.range[1]));
  const value =
    lo === hi
      ? formatPlaytimeMinutes(lo)
      : `${formatPlaytimeMinutes(lo)} à ${formatPlaytimeMinutes(hi)}`;
  if (!value) return null;

  const sources = Array.from(
    new Set(parsed.map((entry) => entry.fact.source).filter(Boolean)),
  );

  return {
    kind: CONSENSUS_PLAYTIME_KIND,
    label: parsed[0].fact.label,
    value,
    source: sources.length > 0 ? sources.join(", ") : CONSENSUS_SOURCE,
    confidence: Math.min(1, 0.5 + parsed.length * 0.15),
    priority: Math.max(...parsed.map((entry) => entry.fact.priority ?? 0), 86),
  };
}

/**
 * Applique le consensus : note (en tête), PEGI consensuel, et durée de partie
 * fusionnée. Idempotent : après fusion il ne reste qu'un seul fact par champ,
 * donc une seconde passe ne re-déclenche aucun consensus.
 */
export function applyConsensus(facts: MetadataFact[]): MetadataFact[] {
  if (!Array.isArray(facts) || facts.length === 0) return facts;

  // Repart d'une base sans facts de consensus précédents (idempotence).
  const base = facts.filter((f) => !isConsensusRating(f));

  const consensusRating = computeRatingConsensus(base);
  const consensusPegi = computeAgeConsensus(base);
  const consensusPlaytime = computePlaytimeConsensus(base);

  let result = base;
  if (consensusPegi) {
    result = result.filter(
      (f) => !(f.kind === "age-rating" && /pegi/i.test(f.label)),
    );
    result = [...result, consensusPegi];
  }
  if (consensusPlaytime) {
    // Retire les durées fusionnées (exploitables), garde celles non parsables.
    result = result.filter(
      (f) =>
        f.kind !== CONSENSUS_PLAYTIME_KIND ||
        parsePlaytimeRange(f.value) === null,
    );
    result = [...result, consensusPlaytime];
  }
  if (consensusRating) {
    result = [consensusRating, ...result];
  }
  return result;
}
