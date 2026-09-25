/**
 * Les tirages du 疾風伝, sous la forme que le sélecteur d'ajout attend.
 *
 * La référence se lit comme sur la carte : `忍伝-43`, `術伝-65`, `作伝-26`,
 * `忍伝-学007`. C'est ce préfixe qui distingue ce jeu du Carddass, dont les
 * cartes portent `忍-43` sans le 伝 — et les deux numérotations repartant de 1,
 * il n'y a rien d'autre pour les départager à l'œil.
 */
import type { PrintCandidate } from "@/types/providerModule";

import {
  narutoShippudenAssetsCardUrl,
  NARUTO_SHIPPUDEN_EFFECT_PACK_ID,
} from "./assets";
import {
  ensureNarutoShippudenIndex,
  searchNarutoShippudenRows,
  shippudenSetLabel,
  type ShippudenSearchRow,
} from "./indexStore";

/**
 * Préfixe imprimé canonique (affichage + ledger Bandai / Suruga titre).
 * 忍者学校 : `忍伝-学007` — tiret avant 学, zéros, pas de tiret avant le n°.
 */
const PRINTED_PREFIX: Readonly<Record<string, string>> = {
  shi: "忍伝",
  mju: "術伝",
  msa: "作伝",
  gaku: "忍伝-学",
  prshi: "PR忍伝",
  prmsa: "PR作伝",
  prgaku: "PR学",
};

/**
 * Variantes acceptées à la saisie (carddas20 `忍伝学-001`, recherche Suruga
 * `忍伝学`, tiret optionnel avant le n°). Plus long d'abord pour ne pas
 * laisser `忍伝` avaler `忍伝-学` / `忍伝学`, ni `作伝` avaler `PR作伝`.
 */
const PRINTED_PARSE_ORDER: ReadonlyArray<{
  family: keyof typeof PRINTED_PREFIX;
  prefixes: readonly string[];
}> = [
  { family: "prgaku", prefixes: ["PR学"] },
  { family: "prmsa", prefixes: ["PR作伝"] },
  { family: "prshi", prefixes: ["PR忍伝"] },
  { family: "gaku", prefixes: ["忍伝-学", "忍伝学"] },
  { family: "mju", prefixes: ["術伝"] },
  { family: "msa", prefixes: ["作伝"] },
  { family: "shi", prefixes: ["忍伝"] },
];

/** `shi0043` → `忍伝-43` ; `gaku0007` → `忍伝-学007` ; `prmsa0005` → `PR作伝-5`. */
export function formatShippudenReference(
  cardType: string,
  number: string,
): string {
  const family = cardType.toLowerCase();
  const rawDigits = number.replace(/^[a-z]+/i, "").replace(/^0+/, "");
  const digits = rawDigits || number.replace(/^[a-z]+/i, "") || number;
  if (family === "gaku") {
    return `忍伝-学${digits.padStart(3, "0")}`;
  }
  if (family === "prgaku") {
    return `PR学-${digits.padStart(3, "0")}`;
  }
  const prefix = PRINTED_PREFIX[family] ?? cardType.toUpperCase();
  return `${prefix}-${digits}`;
}

/**
 * `忍伝-43` / `忍伝学007` → `shi0043` / `gaku0007`.
 *
 * C'est ce qu'un joueur a sous les yeux, donc ce qu'il tape ; sans cette
 * traduction la recherche ne voyait que l'identifiant disque, et chercher sa
 * carte par son numéro ne rendait rien. Le tiret est facultatif et les zéros de
 * tête sont tolérés, parce que les deux s'écrivent.
 *
 * `null` si ce n'est pas une référence de ce jeu — le Carddass imprime `忍-43`,
 * sans le 伝, et les deux numérotations repartent de 1.
 */
export function diskIdFromPrintedReference(query: string): string | null {
  const text = query.trim();
  if (!text) return null;
  for (const { family, prefixes } of PRINTED_PARSE_ORDER) {
    for (const prefix of prefixes) {
      const m = new RegExp(`^${prefix}[\\s-]*(\\d{1,4})$`).exec(text);
      if (m) return `${family}${m[1]!.padStart(4, "0")}`;
    }
  }
  return null;
}

function toCandidate(row: ShippudenSearchRow): PrintCandidate {
  const reference = formatShippudenReference(row.cardType, row.number);
  const art = row.art
    ? narutoShippudenAssetsCardUrl(row.cardType, row.number, row.lang, row.art)
    : null;
  const thumb = row.thumb
    ? narutoShippudenAssetsCardUrl(
        row.cardType,
        row.number,
        row.lang,
        row.thumb,
      )
    : null;
  return {
    printKey: row.printKey,
    /*
      Une carte sans titre reste choisissable : sa référence l'identifie, et la
      cacher la rendrait impossible à ajouter. Quatre tirages sont dans ce cas.
    */
    title: row.fullName?.trim() || reference,
    reference,
    setLabel: shippudenSetLabel(row.setCode),
    ...(row.rarity ? { rarity: row.rarity } : {}),
    ...(art ? { imageUrl: art } : {}),
    ...(thumb ? { thumbnailUrl: thumb } : {}),
    language: row.lang,
    printed: true,
    effectPack: NARUTO_SHIPPUDEN_EFFECT_PACK_ID,
  };
}

export function searchNarutoShippudenPrints(
  query: string,
  opts: { language?: string; limit?: number; setId?: string | null } = {},
): PrintCandidate[] {
  const rows = searchNarutoShippudenRows(
    diskIdFromPrintedReference(query) ?? query,
    opts,
  );
  const seen = new Set<string>();
  const out: PrintCandidate[] = [];
  for (const row of rows) {
    if (seen.has(row.printKey)) continue;
    seen.add(row.printKey);
    out.push(toCandidate(row));
    if (opts.limit && out.length >= opts.limit) break;
  }
  return out;
}

export function lookupNarutoShippudenPrint(
  printKey: string,
): PrintCandidate | null {
  const db = ensureNarutoShippudenIndex();
  if (!db) return null;
  const row = db
    .prepare(
      `SELECT p.print_key AS printKey, p.set_code AS setCode, p.number,
              p.card_type AS cardType, p.grouping,
              t.lang, t.full_name AS fullName, t.rarity,
              a.art, a.thumb
         FROM prints p
         LEFT JOIN print_titles t ON t.print_key = p.print_key
         LEFT JOIN print_assets a
                ON a.print_key = p.print_key AND a.lang = t.lang
        WHERE p.print_key = ?
        LIMIT 1`,
    )
    .get(printKey.trim().toLowerCase()) as ShippudenSearchRow | undefined;
  return row ? toCandidate(row) : null;
}
