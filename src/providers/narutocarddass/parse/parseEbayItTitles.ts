/**
 * Italian Carddass titles from the curated eBay face ledger.
 *
 * Faces already carry a listing title (italianStore paste or short seller
 * name). This module cleans that string into a print title — fill-only, never
 * invents a name for a number that has no eBay row.
 *
 * Character (NI) rows must agree with an existing FR/EN latin sibling when one
 * exists: some listings pair the wrong title with the right scan.
 */
import {
  canonicalizeNarutoPrintKey,
  narutoDiskCardId,
  narutoNumbersEqual,
  parseNarutoCollector,
} from "../collectorIdentity";
import type { NarutoPrintRow, NarutoTitleRow } from "../indexStore";
import { ebayIngestFaces } from "../sources/ebayPackshots";

/** Set names observed on the davidborghfbperfectcards IT store paste. */
export const EBAY_IT_SET_PREFIXES = [
  "La Forza della Foglia",
  "Le Spire del Serpente",
  "La Maledizione della Sabbia",
  "Vendetta e Redenzione",
  "L'Eredità del Sogno",
  "L'Eredita del Sogno",
  "Rivalità Eterna",
  "Rivalita Eterna",
  "Promo",
] as const;

const REF_TAIL_RE = /\s+(NI|TE|TA|ST|CL)[-\s]?\d{1,4}\s*$/i;
const CONDITION_TAIL_RE =
  /\s+(?:(?:NEAR\s+)?MINT-?|NM|HOLO|FOIL|ITA)(?:\s+(?:(?:NEAR\s+)?MINT-?|NM|HOLO|FOIL|ITA))*\s*$/i;
const NARUTO_PREFIX_RE = /^(?:NARUTO\s+(?:TCG|CARD\s+GAME)\s+)/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** ALL-CAPS listing fragments → Title Case; mixed case left alone. */
export function softTitleCaseEbayItName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const letters = trimmed.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (!letters || letters !== letters.toUpperCase()) return trimmed;
  return trimmed
    .toLowerCase()
    .replace(/(^|[\s'’-])(\p{L})/gu, (_, boundary: string, ch: string) => {
      return `${boundary}${ch.toUpperCase()}`;
    });
}

/**
 * Strip store wrappers → printed Italian card name.
 * `null` when nothing usable remains.
 */
export function parseEbayItListingTitle(raw: string): string | null {
  let t = raw.replace(/\s+/g, " ").trim();
  if (!t) return null;
  t = t.replace(CONDITION_TAIL_RE, "").trim();
  t = t.replace(REF_TAIL_RE, "").trim();
  t = t.replace(NARUTO_PREFIX_RE, "").trim();
  const sets = [...EBAY_IT_SET_PREFIXES].sort((a, b) => b.length - a.length);
  for (const set of sets) {
    const re = new RegExp(`^${escapeRegExp(set)}\\s+`, "i");
    if (re.test(t)) {
      t = t.replace(re, "").trim();
      break;
    }
  }
  t = softTitleCaseEbayItName(t);
  if (t.length < 2) return null;
  if (/^(NI|TE|TA|ST|CL)[-\s]?\d{1,4}$/i.test(t)) return null;
  if (/^NARUTO\s+(TCG|CARD\s+GAME)\b/i.test(t)) return null;
  return t;
}

function foldNameTokens(raw: string): string[] {
  const folded = raw
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/uchiwa/g, "uchiha")
    .replace(/huyga|hyuuga/g, "hyuga")
    .replace(/kankurou/g, "kankuro")
    .replace(/chouji/g, "choji")
    .replace(/konoha-?maru/g, "konohamaru")
    .replace(/[^a-z0-9]+/g, " ");
  const stop = new Set([
    "naruto",
    "forme",
    "form",
    "possedee",
    "posseduto",
    "the",
    "of",
    "le",
    "la",
    "les",
    "del",
    "della",
    "di",
    "e",
    "et",
  ]);
  return folded
    .split(/\s+/)
    .filter((t) => t.length > 1 && !stop.has(t));
}

export function ebayItNamesCompatible(a: string, b: string): boolean {
  const left = foldNameTokens(a);
  const right = foldNameTokens(b);
  if (!left.length || !right.length) return false;
  const rightSet = new Set(right);
  for (const token of left) {
    if (rightSet.has(token)) return true;
    if (token.length < 4) continue;
    for (const other of right) {
      if (other.length < 4) continue;
      if (token.includes(other) || other.includes(token)) return true;
    }
  }
  return false;
}

function hasLatinLetters(value: string): boolean {
  return /[A-Za-zÀ-ÿ]/.test(value);
}

function titleKey(printKey: string, lang: string): string {
  return `${canonicalizeNarutoPrintKey(printKey)}\0${lang.toLowerCase()}`;
}

function siblingLatinNames(
  titles: readonly NarutoTitleRow[],
  printKey: string,
): string[] {
  const canon = canonicalizeNarutoPrintKey(printKey);
  return titles
    .filter(
      (t) =>
        canonicalizeNarutoPrintKey(t.printKey) === canon &&
        (t.lang === "fr" || t.lang === "en") &&
        hasLatinLetters(t.fullName),
    )
    .map((t) => t.fullName.trim())
    .filter(Boolean);
}

function isNinjaPrint(print: NarutoPrintRow): boolean {
  if (print.family === "ninja") return true;
  return parseNarutoCollector(print.number)?.family === "ninja";
}

/**
 * Accept IT listing title for this print?
 * NI with a latin FR/EN sibling: require token overlap (reject mislabeled
 * listings). Everything else: accept the cleaned curated title.
 */
export function shouldAcceptEbayItTitle(input: {
  cleaned: string;
  print: NarutoPrintRow;
  titles: readonly NarutoTitleRow[];
}): boolean {
  if (!isNinjaPrint(input.print)) return true;
  const siblings = siblingLatinNames(input.titles, input.print.printKey);
  if (!siblings.length) return true;
  return siblings.some((name) => ebayItNamesCompatible(name, input.cleaned));
}

export type EbayItTitleCard = {
  number: string;
  name: string;
  printedRef: string;
  setCode: string | null;
};

/** Clean IT titles from ingestible eBay face rows. */
export function ebayItTitleCardsFromFaces(
  faces: readonly {
    printedRef: string;
    lang: string;
    title?: string;
    setCode?: string | null;
    ingest?: boolean;
  }[] = ebayIngestFaces(),
): EbayItTitleCard[] {
  const byNumber = new Map<string, EbayItTitleCard>();
  for (const face of faces) {
    if (face.ingest === false) continue;
    if (face.lang.toLowerCase() !== "it") continue;
    const name = parseEbayItListingTitle(face.title ?? "");
    if (!name) continue;
    const disk = narutoDiskCardId(face.printedRef);
    if (!disk) continue;
    if (byNumber.has(disk)) continue;
    byNumber.set(disk, {
      number: disk,
      name,
      printedRef: face.printedRef,
      setCode: face.setCode?.trim() || null,
    });
  }
  return [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number),
  );
}

export function mergeEbayItTitlesIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  cards?: readonly EbayItTitleCard[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  titled: string[];
  skipped: string[];
} {
  const prints = [...input.prints];
  const titles = [...input.titles];
  const seen = new Set(titles.map((t) => titleKey(t.printKey, t.lang)));
  const titled: string[] = [];
  const skipped: string[] = [];
  const cards = input.cards ?? ebayItTitleCardsFromFaces();

  for (const card of cards) {
    const hits = prints.filter((p) => narutoNumbersEqual(p.number, card.number));
    if (!hits.length) {
      skipped.push(`${card.number}: aucun tirage`);
      continue;
    }
    for (const print of hits) {
      const key = titleKey(print.printKey, "it");
      if (seen.has(key)) continue;
      if (
        !shouldAcceptEbayItTitle({
          cleaned: card.name,
          print,
          titles,
        })
      ) {
        skipped.push(`${card.number}: titre listing incompatible`);
        continue;
      }
      titles.push({
        printKey: print.printKey,
        lang: "it",
        fullName: card.name,
        rarity: null,
        nameSource: "ebay-it-listing",
      });
      seen.add(key);
      titled.push(print.printKey);
    }
  }

  titled.sort((a, b) => a.localeCompare(b));
  skipped.sort((a, b) => a.localeCompare(b));
  return { prints, titles, titled, skipped };
}
