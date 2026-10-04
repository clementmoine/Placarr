/**
 * Reconstruit `products-contents.json` skus depuis le ledger
 * `dbzcollection-contents` (canal Autres infos).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { SealedPrintLink } from "@/providers/shared/sealedProducts/indexFormat";
import { installProviderProductsContents } from "@/providers/shared/sealedProducts/curatedContents";
import {
  loadSealedProductsIndex,
  persistSealedProductsIndexDoc,
} from "@/providers/shared/sealedProducts/persistProductsIndex";

import {
  readDbzcollectionContentsLedger,
  type DbzcContentCard,
} from "../harvest/dbzcollectionContents";
import { DBS_JCC_PACK_ID, dbsJccCuratedDir } from "../pack";
import {
  DBSJCC_DETECTEUR_NUMBER,
  DBSJCC_DETECTEUR_PRINT_KEY,
  dbsjccStarterIncludesDetecteur,
} from "../printKey";
import { resolveDbsjccPrintKeyAlias } from "../printKeyAliases";

const DETECTEUR_LINK: SealedPrintLink = {
  name: "Détecteur",
  slug: DBSJCC_DETECTEUR_NUMBER,
  ref: "Détecteur",
  printKey: DBSJCC_DETECTEUR_PRINT_KEY,
  qty: 1,
};

function withStarterDetecteur(
  slug: string,
  links: SealedPrintLink[],
): SealedPrintLink[] {
  if (!dbsjccStarterIncludesDetecteur(slug)) return links;
  if (links.some((link) => link.printKey === DBSJCC_DETECTEUR_PRINT_KEY)) {
    return links;
  }
  return [...links, DETECTEUR_LINK];
}

/** Thème canal → slug produit starter. */
const DECK_SLUG_BY_THEME: Readonly<Record<string, string>> = {
  "super-saiyans:part1": "part1-starter-1190",
  "ennemis:part1": "part1-starter-ennemis",
  "eveil-de-gohan:part2": "part2-starter-1193",
  "ruban-rouge:part2": "part2-starter-ruban-rouge",
  "retour-de-goku:part3": "part3-starter-1197",
  "championnat-du-monde:part3": "part3-starter-championnat",
  "vaincre-la-menace:part4": "part4-starter-1200",
  "forces-du-mal:part4": "part4-starter-forces-du-mal",
  "planete:part5": "part5-starter-1203",
  "resistance:part5": "part5-starter-resistance",
  "fusion:part6": "part6-starter-1206",
  "origine:part7": "part7-starter-1208",
  "nouvelle-epreuve:part8": "part8-starter-1213",
  "heros:part9": "part9-starter-1216",
  "guerriers-legendaires:part10": "part10-starter-1219",
};

/** Slug booster par set (SKU dbzc principal). */
const BOOSTER_SLUG_BY_SET: Readonly<Record<string, string>> = {
  part1: "part1-booster-1188",
  part2: "part2-booster-1192",
  part3: "part3-booster-1196",
  part4: "part4-booster-1199",
  part5: "part5-booster-1202",
  part6: "part6-booster-1205",
  part7: "part7-booster-1207",
  part8: "part8-booster-1210",
  part9: "part9-booster-1215",
  part10: "part10-booster-1218",
};

function printLink(card: DbzcContentCard): SealedPrintLink | null {
  if (!card.printKey || !card.printed) return null;
  return {
    name: card.name?.trim() || card.printed,
    slug: card.number ?? card.printed.toLowerCase(),
    ref: card.printed,
    printKey: resolveDbsjccPrintKeyAlias(card.printKey),
    qty: 1,
  };
}

function themeFromChannel(channel: string): string | null {
  const m = /^deck:([^:]+):(.+)$/.exec(channel);
  if (!m) return null;
  return `${m[1]}:${m[2]}`;
}

export type BuildSealedContentsReport = {
  decks: number;
  boosters: number;
  prints: number;
  unknownChannels: string[];
};

export function buildSealedContentsFromDbzcLedger(): {
  skus: Record<string, unknown>;
  report: BuildSealedContentsReport;
} {
  const ledger = readDbzcollectionContentsLedger();
  if (!ledger) {
    return {
      skus: {},
      report: { decks: 0, boosters: 0, prints: 0, unknownChannels: [] },
    };
  }

  const byDeck = new Map<string, DbzcContentCard[]>();
  const byBoosterSet = new Map<string, DbzcContentCard[]>();
  const unknown = new Set<string>();

  for (const card of ledger.cards) {
    if (card.channel === "booster") {
      const list = byBoosterSet.get(card.setCode) ?? [];
      list.push(card);
      byBoosterSet.set(card.setCode, list);
      continue;
    }
    if (card.channel.startsWith("deck:shared:")) {
      const setCode = card.channel.slice("deck:shared:".length);
      for (const [themeKey, slug] of Object.entries(DECK_SLUG_BY_THEME)) {
        if (!themeKey.endsWith(`:${setCode}`)) continue;
        const list = byDeck.get(slug) ?? [];
        list.push(card);
        byDeck.set(slug, list);
      }
      continue;
    }
    if (card.channel.startsWith("deck:")) {
      const theme = themeFromChannel(card.channel);
      const slug = theme ? DECK_SLUG_BY_THEME[theme] : null;
      if (!slug) {
        unknown.add(card.channel);
        continue;
      }
      const list = byDeck.get(slug) ?? [];
      list.push(card);
      byDeck.set(slug, list);
      continue;
    }
    if (card.channel !== "other") unknown.add(card.channel);
  }

  const skus: Record<string, unknown> = {};
  let prints = 0;

  for (const [slug, cards] of byDeck) {
    const links = withStarterDetecteur(
      slug,
      dedupeLinks(cards.map(printLink).filter(Boolean) as SealedPrintLink[]),
    );
    prints += links.length;
    const cardLinks = links.filter(
      (link) => link.printKey !== DBSJCC_DETECTEUR_PRINT_KEY,
    );
    const complete = cardLinks.length >= 32;
    const hasDetecteur = links.length > cardLinks.length;
    skus[slug] = {
      source: "dbzcollection Autres infos (Deck …) — exclusives + shared",
      verifiedAt: ledger.observed,
      kind: "deck",
      behavior: "known_bundle",
      cardsPerPack: 32,
      packsContained: 1,
      randomPoolScope: "none",
      contentsKnown: complete,
      declaredCardCount: 32,
      guaranteedPrints: links,
      notes: complete
        ? `${cardLinks.length} cartes attestees (canal Deck)${hasDetecteur ? " + Détecteur" : ""}.`
        : `${cardLinks.length}/32 cartes attestees — liste partielle, contentsKnown false${hasDetecteur ? " ; + Détecteur" : ""}.`,
    };
  }

  for (const [setCode, cards] of byBoosterSet) {
    const slug = BOOSTER_SLUG_BY_SET[setCode];
    if (!slug) continue;
    // Loterie set : on n'inventorie pas les cartes booster comme garanties.
    skus[slug] = {
      source: "dbzcollection Autres infos = Booster + structure presse",
      verifiedAt: ledger.observed,
      kind: "booster",
      behavior: "random_pack",
      cardsPerPack: 8,
      packsContained: 1,
      randomPoolScope: "set",
      contentsKnown: false,
      notes: `${cards.length} cartes taguées Booster dans le set (pool loterie, pas de liste fixe).`,
    };
  }

  return {
    skus,
    report: {
      decks: byDeck.size,
      boosters: byBoosterSet.size,
      prints,
      unknownChannels: [...unknown].sort(),
    },
  };
}

function dedupeLinks(links: SealedPrintLink[]): SealedPrintLink[] {
  const best = new Map<string, SealedPrintLink>();
  for (const link of links) {
    const key = link.printKey ?? link.ref ?? link.slug;
    if (!key) continue;
    if (!best.has(key)) best.set(key, link);
  }
  return [...best.values()].sort((a, b) =>
    (a.ref ?? a.slug).localeCompare(b.ref ?? b.slug, "en", { numeric: true }),
  );
}

/** Fusionne les skus reconstruits dans products-contents.json + charge l'index. */
export function writeSealedContentsFromDbzc(): BuildSealedContentsReport {
  const contentsPath = path.join(dbsJccCuratedDir(), "products-contents.json");
  const current = JSON.parse(readFileSync(contentsPath, "utf8")) as {
    version: number;
    pack: string;
    updatedAt: string;
    byKind: Record<string, unknown>;
    skus: Record<string, unknown>;
  };
  const { skus, report } = buildSealedContentsFromDbzcLedger();
  const next = {
    ...current,
    updatedAt: new Date().toISOString().slice(0, 10),
    skus: { ...current.skus, ...skus },
  };
  writeFileSync(contentsPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  installProviderProductsContents(DBS_JCC_PACK_ID, contentsPath);
  // Recharge + merge curated → sqlite (sinon entry_json reste sans Détecteur).
  persistSealedProductsIndexDoc(loadSealedProductsIndex(DBS_JCC_PACK_ID), {
    alreadyMerged: true,
  });
  return report;
}
