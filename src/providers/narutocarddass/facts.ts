/**
 * Item facts for a Naruto CCG print.
 *
 * `kind` is `category`, never `tag`: the item page remaps `tag` (and `genre`)
 * to a single "Thèmes" label, which is right for board-game families but wipes
 * a card attribute's own name — Rareté, Distribution and Langue all rendered as
 * three groups called "Thèmes".
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

import { loadAttestedPromos } from "./sources/attestedPromos";
import { narutoCuratedSourcesDir } from "./curatedPaths";
import { narutoNumbersEqual } from "./collectorIdentity";
import { narutoCatalogueLineForCard } from "./packs";
import { formatNarutoReference, type NarutoPrintDetail } from "./searchPrints";

/** Card families, as carddass.fr filed them (`cartes/5/ninjas/`, `tactique/`…). */
const CARD_FAMILY: Record<string, string> = {
  ni: "Ninja",
  ta: "Tactique",
  te: "Technique",
  cl: "Client",
  ki: "Chevalier",
  pr: "Promo",
  n: "Ninja",
  j: "Jutsu",
  m: "Mission",
  st: "Tactique",
  c: "Client",
  shi: "Ninja",
  mju: "Jutsu",
  msa: "Tactique",
  prni: "Promo",
  prte: "Promo",
  prta: "Promo",
  prcl: "Promo",
  prki: "Promo",
  opni: "Promo",
  gaku: "Ninja",
};

type SetsFile = {
  sets?: Record<
    string,
    {
      series?: number | null;
      starters?: string[];
      released?: boolean;
      /** Official expansion title when Bandai named the set (EN CCG s28…). */
      title?: string | null;
      /** EN CCG series that shares s1–s6 with Carddass FR. */
      enCcgTitle?: string | null;
    }
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
 * EN CCG Series 1 shares `s1` with Carddass — pass the printed id (`n001`).
 */
/**
 * Les sets que le registre déclare **jamais sortis en français**.
 *
 * La Série 6 est le cas : annoncée pour avril 2008, repoussée, puis annulée —
 * Carddass s'est reporté sur Dragon Ball. Les cartes existent, mais imprimées
 * **en Italie** (« Serie 6 — Rivalità Eterna »), et les entrées françaises du
 * catalogue sont des rendus de pré-production trouvés sur `carddass.fr`, pas
 * des cartes physiques.
 *
 * Mesurer les langues sur ces titres faisait donc apparaître la Série 6 sous
 * « français », pour des cartes qu'on ne peut pas posséder. Le fait curé prime
 * sur la mesure : ce que le registre sait, la statistique ne le devine pas.
 */
export function narutoSetsUnreleasedInFrench(): Set<string> {
  const entries = loadSets().sets ?? {};
  return new Set(
    Object.entries(entries)
      .filter(([, entry]) => entry?.released === false)
      .map(([code]) => code.toLowerCase()),
  );
}

export function narutoSetLabel(setCode: string, card?: string | null): string {
  const code = setCode.toLowerCase();
  if (code === "promo") return "Promo (hors série)";
  const entry = loadSets().sets?.[code];
  if (
    card &&
    narutoCatalogueLineForCard(card, setCode) === "en-ccg" &&
    entry?.enCcgTitle?.trim()
  ) {
    return entry.enCcgTitle.trim();
  }
  if (entry?.title?.trim()) return entry.title.trim();
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
    row = loadAttestedPromos().find(
      (p) =>
        p.number === number ||
        narutoNumbersEqual(p.number, number) ||
        (p.diskCardId != null && narutoNumbersEqual(p.diskCardId, number)),
    );
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
      kind: "category",
      label: "Distribution",
      value: channel,
      source: providerId,
      confidence: 0.85,
      priority: 34,
    });
  }
  if (typeof row.shuriken === "number" && row.shuriken > 0) {
    out.push({
      kind: "category",
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
      value: formatNarutoReference(row.setCode, row.number),
      source: providerId,
      confidence: 0.95,
      priority: 45,
    },
    {
      kind: "series",
      label: "Extension",
      value: narutoSetLabel(row.setCode, row.number),
      source: providerId,
      confidence: 0.9,
      priority: 36,
    },
  ];

  if (row.rarity) {
    facts.push({
      kind: "category",
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
      kind: "category",
      label: "Type",
      value: family,
      source: providerId,
      confidence: 0.9,
      priority: 26,
    });
  }

  if (row.lang) {
    facts.push({
      kind: "category",
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
