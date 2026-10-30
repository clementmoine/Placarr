/**
 * Séries check-list promo Lorcana.
 *
 * En base, les promos LorcanaJSON restent sous l'extension retail
 * (`set_code=2` + `promo_grouping=P1`) ; les fills Lorcast portent déjà un
 * code promo (`P2`, `C2`, `Coconut`). Pour la check-list / le parcours par
 * extension, on les range par série promo — sans réécrire `printKey` ni
 * `set_code`.
 *
 * Libellé : nom Lorcast (`lorcast-sets.json`) quand il est utile, sinon règles
 * structurelles / manuelles (RPH…), sinon le code.
 */

import { registerChecklistOwnershipSet } from "@/core/collect/checklistOwnership";
import {
  lorcastSetDisplayName,
  readLorcastSetNameMap,
} from "@/providers/lorcana/lorcast/setsLedger";
import type { SqlBindValue } from "@/providers/shared/cardCatalogue/sets";

/** Chapitre numéroté (`1`…`13`) ou quête (`Q1`, `Q2`) — hors séries promo. */
export function isLorcanaMainCatalogueSetCode(setCode: string): boolean {
  const code = setCode.trim();
  if (!code) return false;
  if (/^\d+$/.test(code)) return true;
  return /^q\d+$/i.test(code);
}

/**
 * Lorcast fill used to stamp `promo_grouping = setCode` on quests (`Q3`).
 * That is not a promo — clear it so the set stays a main checklist chapter.
 */
export function normalizeLorcanaPromoGrouping(
  setCode: string | null | undefined,
  promoGrouping: string | null | undefined,
): string | null {
  const set = (setCode ?? "").trim();
  const grouping = (promoGrouping ?? "").trim();
  if (!grouping) return null;
  if (
    set &&
    grouping.toUpperCase() === set.toUpperCase() &&
    isLorcanaMainCatalogueSetCode(set)
  ) {
    return null;
  }
  return grouping;
}

/** Tirage promo (observation : grouping non vide). */
export function isLorcanaPromoPrint(
  promoGrouping: string | null | undefined,
): boolean {
  return Boolean(promoGrouping?.trim());
}

export type LorcanaPromoChecklistSeries = {
  /** Id d'extension check-list (`p1`, `c2`, `coconut`…). */
  id: string;
  /** Code affiché (`P1`) — préfixe de libellé. */
  code: string;
  label: string;
  /**
   * Après les chapitres numérotés (≤13), avant les quêtes sans rang.
   * `P1` → 51, `P2` → 52, …
   */
  sortKey: number;
};

export type LorcanaPromoChecklistSeriesOptions = {
  /**
   * Lorcast `code → name`. Omit = ledger on disk ; pass `new Map()` to force
   * structural / manual labels only.
   */
  setNames?: ReadonlyMap<string, string>;
};

function structuralPromoLabel(code: string): {
  id: string;
  code: string;
  label: string;
  sortKey: number;
} | null {
  const g = code.toUpperCase();

  const promoYear = /^P(\d+)$/i.exec(g);
  if (promoYear) {
    const n = Number(promoYear[1]);
    return {
      id: `p${n}`,
      code: `P${n}`,
      label: `Promo Year ${n}`,
      sortKey: 50 + n,
    };
  }

  const productYear = /^PD(\d+)$/i.exec(g);
  if (productYear) {
    const n = Number(productYear[1]);
    return {
      id: `pd${n}`,
      code: `PD${n}`,
      label: `Product Year ${n}`,
      sortKey: 60 + n,
    };
  }

  const challenge = /^C(\d+)$/i.exec(g);
  if (challenge) {
    const n = Number(challenge[1]);
    return {
      id: `c${n}`,
      code: `C${n}`,
      label: `Challenge ${n}`,
      sortKey: 70 + n,
    };
  }

  if (g === "DIS") {
    return {
      id: "dis",
      code: "DIS",
      label: "Discover Promo",
      sortKey: 80,
    };
  }

  if (g === "RPH") {
    return {
      id: "rph",
      code: "RPH",
      label: "Ravensburger Play Hub",
      sortKey: 85,
    };
  }

  return null;
}

function prettyPromoCodeLabel(code: string): string {
  return code
    .replace(/_/g, " ")
    .replace(/\b([A-Z0-9]+)\b/g, (word) =>
      word.length <= 3 ? word : word[0] + word.slice(1).toLowerCase(),
    );
}

/**
 * `P1` → id `p1`, label Lorcast « Promo Set 1 » si ledger, sinon « Promo Year 1 ».
 * `RPH` → Ravensburger Play Hub (manuel ; absent de Lorcast).
 */
export function lorcanaPromoChecklistSeries(
  promoGrouping: string,
  options?: LorcanaPromoChecklistSeriesOptions,
): LorcanaPromoChecklistSeries | null {
  const raw = promoGrouping.trim();
  if (!raw) return null;
  const g = raw.toUpperCase();

  const structural = structuralPromoLabel(g);
  const id = structural?.id ?? g.toLowerCase();
  const code = structural?.code ?? g;
  const sortKey = structural?.sortKey ?? 90;

  const setNames = options?.setNames ?? readLorcastSetNameMap();
  const lorcastLabel = lorcastSetDisplayName(code, setNames);
  const label =
    lorcastLabel ?? structural?.label ?? prettyPromoCodeLabel(code);

  return { id, code, label, sortKey };
}

/** Groupe SQL `promo_grouping` attendu pour un id de série promo. */
export function lorcanaPromoGroupingForSetId(setId: string): string | null {
  const id = setId.trim().toLowerCase();
  if (!id || isLorcanaMainCatalogueSetCode(id)) return null;

  const promoYear = /^p(\d+)$/i.exec(id);
  if (promoYear) return `P${promoYear[1]}`;

  const productYear = /^pd(\d+)$/i.exec(id);
  if (productYear) return `PD${productYear[1]}`;

  const challenge = /^c(\d+)$/i.exec(id);
  if (challenge) return `C${challenge[1]}`;

  return id.toUpperCase();
}

/**
 * Clause SQL + params pour borner une recherche à une extension.
 *
 * - `p1` / `p2`… → `promo_grouping = P1` / `P2`… ;
 * - chapitre / quête → ce `set_code`, **sans** les promos rattachées ;
 * - autre id promo (`coconut`, `c2`…) → grouping exact.
 */
export function lorcanaSetScopeWhere(input: {
  setId?: string | null;
  textClause?: string | null;
  textParams?: readonly SqlBindValue[];
}): { where: string; params: SqlBindValue[] } {
  const setId = input.setId?.trim().toLowerCase() || "";
  const hasText = Boolean(input.textClause?.trim());
  const textAnd = `(${hasText ? input.textClause : "1 = 1"})`;
  const textParams: SqlBindValue[] = hasText
    ? [...(input.textParams ?? [])]
    : [];

  if (!setId) {
    return { where: `1 = 1 AND ${textAnd}`, params: textParams };
  }

  const promoPredicate = `NULLIF(TRIM(p.promo_grouping), '') IS NOT NULL`;
  const grouping = lorcanaPromoGroupingForSetId(setId);
  if (grouping) {
    return {
      where: `UPPER(TRIM(p.promo_grouping)) = ? AND ${textAnd}`,
      params: [grouping, ...textParams],
    };
  }

  return {
    where: `LOWER(p.set_code) = ? AND NOT (${promoPredicate}) AND ${textAnd}`,
    params: [setId, ...textParams],
  };
}

/**
 * Owned `lorcana:13-16-p4` must tick checklist set `p4`, not chapter `13`
 * (catalogue setCode / printKey segment).
 */
registerChecklistOwnershipSet("lorcana", (identity) => {
  const grouping = identity.grouping?.trim();
  if (!grouping) return null;
  return lorcanaPromoChecklistSeries(grouping)?.id ?? null;
});
