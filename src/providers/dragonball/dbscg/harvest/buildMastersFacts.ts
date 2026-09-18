/**
 * Écrit `data/dbs/cg/facts.json` depuis le dépôt Masters déjà en staging.
 *
 * Même adresse que les faits Fusion World (`data/dbs/fw/facts.json`) et que
 * `facts-ja.json` côté Naruto : la forme de `cards-index.json` est commune à
 * tous les packs, et un bloc de règles Dragon Ball n'a rien à y faire.
 *
 * Le rapprochement est mesuré, pas supposé (relevé du 2026-08-19, 8 434
 * tirages au catalogue) :
 *
 *   - **7 668** tirages tombent sur leur propre ligne ;
 *   - **363** n'ont que la ligne de leur numéro de base — une réimpression
 *     promo rejoue le texte de la carte d'origine, donc le fait est repris
 *     mais marqué `inheritedFrom` ;
 *   - **403** restent sans faits : le dépôt s'arrête avant BT30, ce n'est pas
 *     un défaut de rapprochement mais un dépôt à rafraîchir.
 *
 * Rien n'est deviné au-delà de ça. `BT1-008-BD` au catalogue et `BT1-008-PR`
 * chez Masters se ressemblent, mais rien ne prouve que ce soit le même
 * tirage : ils passent par le numéro de base comme les autres.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { CardsIndexV1 } from "@/effects/cardsIndex";
import { dataRoot } from "@/lib/runtimeData";

import {
  dbsCgBaseNumber,
  normalizeDbsCgNumber,
  parseDbsCgMastersSuperset,
  type DbsCgCardFacts,
} from "./mastersFacts";

export const DBS_CG_PACK_ID = "dbs/cg";
export const DBS_CG_FACTS_FILE = "facts.json";
const MASTERS_STAGING = path.join(
  "staging",
  "dragon-ball-masters-arena",
  "masters_superset.json",
);

export type DbsCgFactsEntry = DbsCgCardFacts & {
  /** Numéro de la carte d'origine quand ces faits sont ceux d'un autre tirage. */
  inheritedFrom?: string;
};

export type DbsCgFactsFile = {
  version: 1;
  source: string;
  locale: string;
  capturedAt: string;
  count: number;
  coverage: {
    prints: number;
    exact: number;
    inherited: number;
    missing: number;
    /** Numéros sans faits, pour savoir quoi aller chercher ensuite. */
    missingSample: string[];
  };
  /** Indexé par numéro normalisé (`BT1-005`, `BT24-086-PR2`). */
  cards: Record<string, DbsCgFactsEntry>;
};

function packRoot(root?: string): string {
  return path.join(root ?? dataRoot(), DBS_CG_PACK_ID);
}

export function dbsCgFactsPath(root?: string): string {
  return path.join(packRoot(root), DBS_CG_FACTS_FILE);
}

export function loadDbsCgFacts(root?: string): DbsCgFactsFile | null {
  try {
    const raw = JSON.parse(
      readFileSync(dbsCgFactsPath(root), "utf8"),
    ) as DbsCgFactsFile;
    return raw?.version === 1 && raw.cards ? raw : null;
  } catch {
    return null;
  }
}

/** Numéros normalisés des tirages du pack. */
export function dbsCgIndexNumbers(index: CardsIndexV1): string[] {
  const out = new Set<string>();
  for (const card of Object.values(index.cards)) {
    const set = (card.set ?? "").trim();
    const number = (card.card ?? "").trim();
    if (!set || !number) continue;
    out.add(normalizeDbsCgNumber(`${set}-${number}`));
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

/**
 * Rapproche les lignes Masters des tirages du pack. Un tirage sans ligne à lui
 * reprend celle de son numéro de base, en le disant.
 */
export function joinDbsCgFacts(
  cards: readonly DbsCgCardFacts[],
  numbers: readonly string[],
): Pick<DbsCgFactsFile, "cards" | "coverage"> {
  const byNumber = new Map(cards.map((card) => [card.cardNumber, card]));
  const byBase = new Map<string, DbsCgCardFacts>();
  for (const card of cards) {
    const base = dbsCgBaseNumber(card.cardNumber);
    if (!byBase.has(base)) byBase.set(base, card);
  }

  const out: Record<string, DbsCgFactsEntry> = {};
  let exact = 0;
  let inherited = 0;
  const missing: string[] = [];
  for (const number of numbers) {
    const own = byNumber.get(number);
    if (own) {
      out[number] = own;
      exact += 1;
      continue;
    }
    const base = byBase.get(dbsCgBaseNumber(number));
    if (base) {
      out[number] = { ...base, inheritedFrom: base.cardNumber };
      inherited += 1;
      continue;
    }
    missing.push(number);
  }
  // Les lignes Masters qu'aucun tirage ne réclame restent lisibles : le dépôt
  // connaît des tirages que le catalogue n'a pas encore.
  for (const card of cards) {
    if (!out[card.cardNumber]) out[card.cardNumber] = card;
  }

  return {
    cards: out,
    coverage: {
      prints: numbers.length,
      exact,
      inherited,
      missing: missing.length,
      missingSample: missing.slice(0, 30),
    },
  };
}

export function buildDbsCgFacts(opts: { root?: string } = {}): DbsCgFactsFile {
  const root = packRoot(opts.root);
  const mastersPath = path.join(root, MASTERS_STAGING);
  if (!existsSync(mastersPath)) {
    throw new Error(`dépôt Masters absent : ${mastersPath}`);
  }
  const indexPath = path.join(root, "cards-index.json");
  if (!existsSync(indexPath)) {
    throw new Error(`cards-index.json absent : ${indexPath}`);
  }

  const cards = parseDbsCgMastersSuperset(
    JSON.parse(readFileSync(mastersPath, "utf8")),
  );
  const numbers = dbsCgIndexNumbers(
    JSON.parse(readFileSync(indexPath, "utf8")) as CardsIndexV1,
  );
  const { cards: joined, coverage } = joinDbsCgFacts(cards, numbers);

  const file: DbsCgFactsFile = {
    version: 1,
    source: "dragon-ball-masters-arena / masters_superset.json",
    locale: "en",
    capturedAt: new Date().toISOString(),
    count: Object.keys(joined).length,
    coverage,
    cards: joined,
  };
  mkdirSync(root, { recursive: true });
  writeFileSync(
    dbsCgFactsPath(opts.root),
    `${JSON.stringify(file, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `── DBS/CG faits → ${DBS_CG_FACTS_FILE} : ${coverage.exact} exacts, ` +
      `${coverage.inherited} hérités, ${coverage.missing} sans faits ` +
      `(${file.count} fiches écrites)`,
  );
  return file;
}
