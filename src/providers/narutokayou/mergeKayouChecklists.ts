/**
 * Merge Kayou ledgers — narutocards.ca + capsulecorpgear + alertehit.
 */
import {
  canonicalizeKayouNumber,
  canonicalizeKayouNumberForSet,
} from "./kayouIdNormalize";
import type { KayouChecklist, KayouChecklistCard, KayouChecklistSet } from "./kayouLedgerTypes";

export type KayouMergeSource =
  | "narutocards"
  | "capsulecorpgear"
  | "alertehit"
  | "kayouofficial"
  | "narutodb";

function cardKey(setCode: string, number: string): string {
  return `${setCode.trim().toLowerCase()}:${canonicalizeKayouNumberForSet(setCode, number)}`;
}

function withCanonicalNumber(
  setCode: string,
  card: KayouChecklistCard,
): KayouChecklistCard {
  const number = canonicalizeKayouNumberForSet(setCode, card.number);
  return number === card.number ? card : { ...card, number };
}

function mergeCardFields(
  base: KayouChecklistCard,
  incoming: KayouChecklistCard,
): KayouChecklistCard {
  const out: KayouChecklistCard = { ...base };
  const alt = new Set(base.faceUrlAlternates ?? []);

  if (incoming.name.trim() && incoming.name !== incoming.printed) {
    if (!base.name.trim() || base.name === base.printed) {
      out.name = incoming.name.trim();
    }
  }

  if (incoming.rarity?.trim() && !base.rarity?.trim()) {
    out.rarity = incoming.rarity.trim();
  }

  const addAlt = (url: string | null | undefined) => {
    const u = url?.trim();
    if (u && u !== out.faceUrl) alt.add(u);
  };

  if (incoming.faceUrl?.trim()) {
    const incUrl = incoming.faceUrl.trim();
    if (!out.faceUrl?.trim()) {
      out.faceUrl = incUrl;
      out.faceSource = incoming.faceSource ?? null;
    } else if (out.faceUrl !== incUrl) {
      addAlt(incUrl);
    }
  }

  for (const u of incoming.faceUrlAlternates ?? []) addAlt(u);
  if (alt.size) out.faceUrlAlternates = [...alt];

  return out;
}

function mergeSets(
  baseSets: KayouChecklistSet[],
  extraSets: KayouChecklistSet[],
  source: KayouMergeSource,
): KayouChecklistSet[] {
  const byCode = new Map<string, KayouChecklistSet>();
  const cardsByKey = new Map<string, KayouChecklistCard>();

  for (const set of baseSets) {
    const code = set.code.trim().toLowerCase();
    byCode.set(code, {
      ...set,
      code,
      cards: set.cards.map((c) => ({ ...c })),
    });
    for (const card of set.cards) {
      const normalized = withCanonicalNumber(code, card);
      cardsByKey.set(cardKey(code, normalized.number), { ...normalized });
    }
  }

  for (const set of extraSets) {
    const code = set.code.trim().toLowerCase();
    let target = byCode.get(code);
    if (!target) {
      target = {
        slug: set.slug,
        code,
        label: set.label,
        url: set.url,
        cards: [],
      };
      byCode.set(code, target);
    } else if (target.label === code.toUpperCase() && set.label) {
      target.label = set.label;
    }

    for (const card of set.cards) {
      const normalized = withCanonicalNumber(code, card);
      const key = cardKey(code, normalized.number);
      const existing = cardsByKey.get(key);
      if (existing) {
        const merged = mergeCardFields(existing, normalized);
        cardsByKey.set(key, merged);
      } else {
        cardsByKey.set(key, {
          ...normalized,
          faceSource: normalized.faceSource ?? source,
        });
      }
    }
  }

  return [...byCode.values()]
    .map((set) => ({
      ...set,
      cards: [...cardsByKey.entries()]
        .filter(([key]) => key.startsWith(`${set.code}:`))
        .map(([, card]) => card)
        .sort((a, b) => a.number.localeCompare(b.number)),
    }))
    .filter((set) => set.cards.length > 0)
    .sort((a, b) => a.code.localeCompare(b.code));
}

export function mergeKayouChecklists(
  primary: KayouChecklist,
  ...extras: { ledger: KayouChecklist; source: KayouMergeSource }[]
): KayouChecklist {
  let sets = primary.sets;
  for (const { ledger, source } of extras) {
    sets = mergeSets(sets, ledger.sets, source);
  }
  return {
    source: [
      primary.source,
      ...extras.map((e) => e.ledger.source),
    ].join(" + "),
    url: primary.url,
    observed: primary.observed,
    ingest: "merged narutocards.ca + capsulecorpgear + kayouofficial + narutodb + alertehit",
    sets,
  };
}
