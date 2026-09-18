/**
 * Les tirages du 疾風伝, sous la forme que le sélecteur d'ajout attend.
 *
 * La référence se lit comme sur la carte : `忍伝-43`, `術伝-65`, `作伝-26`,
 * `忍伝-学-1`. C'est ce préfixe qui distingue ce jeu du Carddass, dont les
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

/** Le préfixe imprimé de chaque famille. */
const PRINTED_PREFIX: Readonly<Record<string, string>> = {
  shi: "忍伝",
  mju: "術伝",
  msa: "作伝",
  gaku: "忍伝-学",
};

/** `shi0043` → `忍伝-43`. Le zéro de tête ne s'imprime pas. */
export function formatShippudenReference(
  cardType: string,
  number: string,
): string {
  const prefix =
    PRINTED_PREFIX[cardType.toLowerCase()] ?? cardType.toUpperCase();
  const digits = number.replace(/^[a-z]+/i, "").replace(/^0+/, "");
  return `${prefix}-${digits || number}`;
}

/**
 * `忍伝-43` → `shi0043`. La référence telle qu'elle est **imprimée**.
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
  for (const [family, prefix] of Object.entries(PRINTED_PREFIX)) {
    const m = new RegExp(`^${prefix}[\\s-]*(\\d{1,4})$`).exec(text);
    if (m) return `${family}${m[1].padStart(4, "0")}`;
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
