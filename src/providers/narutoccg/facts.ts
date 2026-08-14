/**
 * Item facts for a Naruto CCG print.
 *
 * The pack is a closed local corpus, so everything here is read from
 * `catalog.sqlite` plus the curated ledgers — no network, no guessing. What the
 * catalogue does not hold (chakra cost, power, printed effect text) is simply
 * not emitted: the faces are scans, never a structured card database, and
 * inventing values would be worse than a shorter table.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import type { MetadataFact } from "@/types/metadataProvider";

import { loadAttestedPromos } from "./attestedPromos";
import { narutoCuratedSourcesDir } from "./curatedPaths";
import { formatNarutoReference, type NarutoPrintDetail } from "./searchPrints";

/** Card families, as carddass.fr filed them (`cartes/5/ninjas/`, `tactique/`…). */
const CARD_FAMILY: Record<string, string> = {
  ni: "Ninja",
  ta: "Tactique",
  te: "Technique",
  cl: "Client",
  pr: "Promo",
};

type SetsFile = {
  sets?: Record<
    string,
    { series?: number | null; starters?: string[]; released?: boolean }
  >;
};

let setsCache: SetsFile | null = null;

function loadSets(): SetsFile {
  if (setsCache) return setsCache;
  try {
    setsCache = JSON.parse(
      readFileSync(path.join(narutoCuratedSourcesDir(), "sets.json"), "utf8"),
    ) as SetsFile;
  } catch {
    setsCache = {};
  }
  return setsCache;
}

/**
 * `s5` → `Série 5 — La quête / Un nouveau départ`. Bandai never titled its
 * series; the two starter names are what a collector actually recognises, so
 * both are shown rather than the collector-convention single label.
 */
export function narutoSetLabel(setCode: string): string {
  const code = setCode.toLowerCase();
  if (code === "promo") return "Promo (hors série)";
  const entry = loadSets().sets?.[code];
  if (!entry?.series) return setCode.toUpperCase();
  const starters = (entry.starters ?? []).filter(Boolean);
  const base = `Série ${entry.series}`;
  const suffix = starters.length ? ` — ${starters.join(" / ")}` : "";
  const cancelled = entry.released === false ? " (annulée)" : "";
  return `${base}${suffix}${cancelled}`;
}

/** Promo distribution channels, as the curated ledger records them. */
const PROMO_CHANNEL_LABEL: Record<string, string> = {
  tin: "Tin box (coffret)",
  tournament: "Tournoi",
  "tournament-s5-example": "Tournoi",
  "cdf-champion-2007": "Coupe de France 2007 — champion",
  "cdf-top8-2007": "Coupe de France 2007 — top 8",
  "cdf-participants-2007": "Coupe de France 2007 — participants",
  "avant-premiere-s4": "Avant-première Série 4",
  "league-vacances-konoha": "Ligue « Vacances à Konoha »",
  "upcoming-2007": "Annonce 2007",
};

function promoFacts(number: string, providerId: string): MetadataFact[] {
  let row;
  try {
    row = loadAttestedPromos().find((p) => p.number === number);
  } catch {
    return [];
  }
  if (!row) return [];
  const out: MetadataFact[] = [];
  const channel = row.channel
    ? (PROMO_CHANNEL_LABEL[row.channel] ?? row.channel)
    : null;
  if (channel) {
    out.push({
      kind: "tag",
      label: "Distribution",
      value: channel,
      source: providerId,
      confidence: 0.85,
      priority: 34,
    });
  }
  if (typeof row.shuriken === "number" && row.shuriken > 0) {
    out.push({
      kind: "tag",
      // The printed PROMO stamp carries 1–3 shurikens; more = scarcer.
      label: "Shurikens",
      value: "★".repeat(row.shuriken),
      source: providerId,
      confidence: 0.85,
      priority: 32,
    });
  }
  return out;
}

export function narutoPrintFacts(
  row: NarutoPrintDetail,
  providerId: string,
): MetadataFact[] {
  const facts: MetadataFact[] = [
    {
      // `format`, not `identifier`: identifiers are hidden from the detail
      // table, and the printed number is the first thing a collector reads.
      kind: "format",
      label: "Numéro",
      value:
        formatNarutoReference(row.setCode, row.number).split(" · ")[1] ??
        row.number,
      source: providerId,
      confidence: 0.95,
      priority: 45,
    },
    {
      kind: "series",
      label: "Extension",
      value: narutoSetLabel(row.setCode),
      source: providerId,
      confidence: 0.9,
      priority: 36,
    },
  ];

  if (row.rarity) {
    facts.push({
      kind: "tag",
      label: "Rareté",
      value: row.rarity,
      source: providerId,
      confidence: 0.9,
      priority: 40,
    });
  }

  const code = row.cardType?.toLowerCase() ?? "";
  // `pr` is not a card family — the promo line reuses Ninja / Tactique /
  // Technique art. Emitting it here would just repeat the rarity.
  const family =
    code && code !== "pr" ? (CARD_FAMILY[code] ?? row.cardType) : null;
  if (family) {
    facts.push({
      kind: "tag",
      label: "Type",
      value: family,
      source: providerId,
      confidence: 0.9,
      priority: 26,
    });
  }

  if (row.lang) {
    facts.push({
      kind: "tag",
      label: "Langue",
      value: row.lang.toUpperCase(),
      source: providerId,
      confidence: 0.9,
      priority: 18,
    });
  }

  if (row.setCode.toLowerCase() === "promo") {
    facts.push(...promoFacts(row.number, providerId));
  }

  return facts;
}
