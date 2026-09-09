/**
 * Côtes approximatives Collection Naruto (YT 7r7) — estimations `~` pour
 * valoriser la collection, pas des prix marché live ni des facts d'identité.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  narutoCollectorNumberKey,
  narutoNumbersEqual,
  parseNarutoCollector,
} from "../collectorIdentity";
import { narutoCuratedSourcesDir } from "../curatedPaths";
import { narutoCatalogueLineForCard } from "../packs";
import { loadAttestedPromos } from "./attestedPromos";

type PremiumRow = { number?: string; priceEur?: number };
type SeriesQuotes = {
  normalEur?: number;
  holoEur?: number;
  prereleaseEur?: number;
  premium?: readonly PremiumRow[];
};

type PromoQuotes = {
  shuriken1Eur?: number;
  shuriken2Eur?: number;
  shuriken3Eur?: number;
  special?: readonly PremiumRow[];
};

type DigFile = {
  promos?: {
    lists?: {
      "1"?: readonly string[];
      "2"?: readonly string[];
      "3"?: readonly string[];
    };
  };
  indicativePrices?: {
    source?: string;
    observed?: string;
    s1?: SeriesQuotes;
    s2?: SeriesQuotes;
    s3?: SeriesQuotes;
    s4?: SeriesQuotes;
    s5?: SeriesQuotes;
    s6?: SeriesQuotes;
    promo?: PromoQuotes;
  };
  prerelease?: {
    fullTen?: readonly string[];
    nonHoloAltsOfHolos?: {
      cards?: readonly { number?: string }[];
    };
  };
};

export type NarutoIndicativeQuote = {
  cents: number;
  displayValue: string;
  sourceUrl: string;
  observed: string | null;
  tier: "premium" | "prerelease" | "holo" | "normal";
};

let cache: DigFile | null = null;

function loadDig(): DigFile {
  if (cache) return cache;
  try {
    cache = JSON.parse(
      readFileSync(
        path.join(
          narutoCuratedSourcesDir(),
          "collection-naruto-youtube-2026-08-29.json",
        ),
        "utf8",
      ),
    ) as DigFile;
  } catch {
    cache = {};
  }
  return cache;
}

export function resetNarutoIndicativeQuotesCache(): void {
  cache = null;
}

function euroToCents(eur: number): number | null {
  if (!Number.isFinite(eur) || eur <= 0) return null;
  return Math.round(eur * 100);
}

function formatEuroDisplay(cents: number): string {
  const euros = cents / 100;
  const text =
    Number.isInteger(euros) || euros >= 1
      ? euros.toLocaleString("fr-FR", {
          minimumFractionDigits: Number.isInteger(euros) ? 0 : 2,
          maximumFractionDigits: 2,
        })
      : euros.toLocaleString("fr-FR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  return `${text} €`;
}

function seriesBucket(setCode: string): SeriesQuotes | null {
  const id = setCode.trim().toLowerCase();
  const prices = loadDig().indicativePrices;
  if (!prices) return null;
  if (id === "s1") return prices.s1 ?? null;
  if (id === "s2") return prices.s2 ?? null;
  if (id === "s3") return prices.s3 ?? null;
  if (id === "s4") return prices.s4 ?? null;
  if (id === "s5") return prices.s5 ?? null;
  if (id === "s6") return prices.s6 ?? null;
  return null;
}

/** Dig lists use bare `ni023` ; catalogue prints are `ni0023-promo`. */
function digNumberMatches(listed: string, printNumber: string): boolean {
  if (narutoNumbersEqual(listed, printNumber)) return true;
  const left = narutoCollectorNumberKey(listed);
  const right = narutoCollectorNumberKey(printNumber);
  return left != null && left === right;
}

function isPrereleasePrint(number: string): boolean {
  return parseNarutoCollector(number)?.grouping?.toLowerCase() === "prerelease";
}

function isHoloRarity(rarity: string | null | undefined): boolean {
  return /holo/i.test(rarity?.trim() ?? "");
}

function premiumCents(
  series: SeriesQuotes,
  number: string,
): number | null {
  for (const row of series.premium ?? []) {
    if (
      row.number &&
      digNumberMatches(row.number, number) &&
      typeof row.priceEur === "number"
    ) {
      return euroToCents(row.priceEur);
    }
  }
  return null;
}

function quoteFromCents(
  cents: number,
  sourceUrl: string,
  observed: string | null,
  tier: NarutoIndicativeQuote["tier"],
): NarutoIndicativeQuote {
  return {
    cents,
    displayValue: formatEuroDisplay(cents),
    sourceUrl,
    observed,
    tier,
  };
}

function shurikenListTier(number: string): 1 | 2 | 3 | null {
  const lists = loadDig().promos?.lists;
  if (!lists) return null;
  for (const tier of [1, 2, 3] as const) {
    for (const row of lists[String(tier) as "1" | "2" | "3"] ?? []) {
      if (digNumberMatches(row, number)) return tier;
    }
  }
  return null;
}

function shurikenEur(promo: PromoQuotes, tier: 1 | 2 | 3): number | null {
  if (tier === 1) return typeof promo.shuriken1Eur === "number" ? promo.shuriken1Eur : null;
  if (tier === 2) return typeof promo.shuriken2Eur === "number" ? promo.shuriken2Eur : null;
  return typeof promo.shuriken3Eur === "number" ? promo.shuriken3Eur : null;
}

function attestedShuriken(number: string): 1 | 2 | 3 | null {
  try {
    for (const row of loadAttestedPromos()) {
      if (
        (digNumberMatches(row.number, number) ||
          (row.diskCardId != null &&
            digNumberMatches(row.diskCardId, number))) &&
        (row.shuriken === 1 || row.shuriken === 2 || row.shuriken === 3)
      ) {
        return row.shuriken;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function promoQuoteForNumber(
  number: string,
  sourceUrl: string,
  observed: string | null,
): NarutoIndicativeQuote | null {
  const promo = loadDig().indicativePrices?.promo;
  if (!promo) return null;

  for (const row of promo.special ?? []) {
    if (
      row.number &&
      digNumberMatches(row.number, number) &&
      typeof row.priceEur === "number"
    ) {
      const cents = euroToCents(row.priceEur);
      if (cents != null) {
        return quoteFromCents(cents, sourceUrl, observed, "premium");
      }
    }
  }

  const tier = shurikenListTier(number) ?? attestedShuriken(number);
  if (tier == null) return null;
  const eur = shurikenEur(promo, tier);
  if (eur == null) return null;
  const cents = euroToCents(eur);
  if (cents == null) return null;
  return quoteFromCents(cents, sourceUrl, observed, "premium");
}

/**
 * Cote ~ pour un tirage FR Carddass S1–S6, ou promo hors série (shuriken / tin).
 * Premium > printKey `-prerelease` > rareté holo > normale.
 * S6 = premiums inserts seulement (pas de tier bulk).
 * Promo : specials dig (NI-023 CdF 100 €, PR tin) puis paliers 1★/2★/3★.
 */
export function narutoIndicativeQuoteForPrint(input: {
  setCode: string;
  number: string;
  rarity?: string | null;
}): NarutoIndicativeQuote | null {
  const sourceUrl =
    loadDig().indicativePrices?.source?.trim() ||
    "https://www.youtube.com/watch?v=7r7LwtIENKs";
  const observed = loadDig().indicativePrices?.observed?.trim() || null;
  const set = input.setCode.trim().toLowerCase();

  if (set === "promo") {
    return promoQuoteForNumber(input.number, sourceUrl, observed);
  }

  if (narutoCatalogueLineForCard(input.number, input.setCode) !== "carddass-fr") {
    return null;
  }
  const series = seriesBucket(input.setCode);
  if (!series) return null;

  const premium = premiumCents(series, input.number);
  if (premium != null) {
    return quoteFromCents(premium, sourceUrl, observed, "premium");
  }

  if (
    isPrereleasePrint(input.number) &&
    typeof series.prereleaseEur === "number"
  ) {
    const cents = euroToCents(series.prereleaseEur);
    if (cents != null) {
      return quoteFromCents(cents, sourceUrl, observed, "prerelease");
    }
  }

  if (isHoloRarity(input.rarity) && typeof series.holoEur === "number") {
    const cents = euroToCents(series.holoEur);
    if (cents != null) {
      return quoteFromCents(cents, sourceUrl, observed, "holo");
    }
  }

  if (typeof series.normalEur === "number") {
    const cents = euroToCents(series.normalEur);
    if (cents != null) {
      return quoteFromCents(cents, sourceUrl, observed, "normal");
    }
  }

  return null;
}
