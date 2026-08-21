/**
 * narutocards.ca Bandai CCG set pages — titles only.
 * Skip Kayou and unofficial set 29. N-US stays prefix `nus`, never `n122`.
 *
 * Tournament pack / tin pages often reprint official Bandai numbers
 * (`N-0145` on TP2). A fan checklist may also invent a new sequential id
 * (`N-1715`). That is not proof the *card* never existed (fans remake
 * official cards too) — it is not enough to mint a new print key. Overlay
 * a name onto a print that already exists; keep any face already on disk.
 */
import ledger from "./curated/sources/narutocards-ca.json";
import {
  canonicalizeNarutoPrintKey,
  mintNarutoPrintKey,
  narutoDiskCardId,
  parseNarutoCollector,
} from "./collectorIdentity";
import type { NarutoPrintRow, NarutoTitleRow } from "./indexStore";
import { cardTypeFromCollectorNumber } from "./parseBandaicgAsset";
import { parseEnCcgPrintedRef } from "./parseEnCcgPrinted";
import { decodeNarutoHtmlEntities } from "./foldNarutoIndex";

export type NarutoCardsCaCard = {
  number: string;
  name: string;
  setCode: string;
  printedRef: string;
  usExclusive: boolean;
};

const LABEL_RE = /aria-label="([^"]+)"/gi;

export function decodeNarutoCardsCaEntities(raw: string): string {
  return decodeNarutoHtmlEntities(raw);
}

export function narutoCardsCaSetsToScrape(): Array<{
  slug: string;
  setCode: string;
  title: string;
}> {
  return (
    ledger.sets as Array<{ slug: string; setCode: string; title: string }>
  ).filter((row) => !ledger.skip.includes(row.slug));
}

export function parseNarutoCardsCaLabel(
  raw: string,
  setCode: string,
): NarutoCardsCaCard | null {
  const cleaned = decodeNarutoHtmlEntities(raw).replace(/\s+/g, " ").trim();
  const m = /^(.+),\s*((?:N|J|M|C|PR|PS)-?(?:US-?)?\d+),\s*[A-Z]{1,3}$/i.exec(
    cleaned,
  );
  if (!m) return null;
  const name = m[1]!.trim();
  const printedRef = m[2]!.replace(/\s+/g, "").toUpperCase();
  const parsed = parseEnCcgPrintedRef(printedRef);
  if (!parsed?.number) return null;
  if (!name || /^(main navigation|breadcrumb|footer|card grid)$/i.test(name)) {
    return null;
  }
  return {
    number: parsed.number,
    name,
    setCode,
    printedRef,
    usExclusive: parsed.usExclusive,
  };
}

/** TP / tin checklists are reprint lists, not a Bandai numbering authority. */
export function isNarutoCardsCaReprintSet(setCode: string): boolean {
  return /^(tp|tin)\d+$/i.test(setCode.trim());
}

/**
 * Fan TP/tin rows may title an attested print or mint a tin US exclusive.
 * They do not mint a new N-1715-style key from the checklist alone.
 */
export function narutoCardsCaMayMintPrint(
  row: Pick<NarutoCardsCaCard, "usExclusive" | "setCode">,
  printAlreadyExists: boolean,
): boolean {
  if (printAlreadyExists) return false;
  if (row.usExclusive) return true;
  return !isNarutoCardsCaReprintSet(row.setCode);
}

/**
 * Map Vintage faces onto attested collector ids (Bandai / Goat / US exclusive).
 * Skip using a TP/tin leftover number as the disk id — the scan may still be
 * a remake of an official card, just not under that invented number.
 */
export function narutoCardsCaHintBelongsOnDisk(
  row: NarutoCardsCaCard,
  attestedDiskIds: ReadonlySet<string>,
): boolean {
  if (row.usExclusive) return true;
  const diskId = (narutoDiskCardId(row.number) ?? row.number).toLowerCase();
  if (attestedDiskIds.has(diskId)) return true;
  return !isNarutoCardsCaReprintSet(row.setCode);
}

export function parseNarutoCardsCaSetHtml(
  html: string,
  setCode: string,
): NarutoCardsCaCard[] {
  const byNumber = new Map<string, NarutoCardsCaCard>();
  for (const match of html.matchAll(LABEL_RE)) {
    const row = parseNarutoCardsCaLabel(
      match[1]!.replace(/\s+/g, " ").trim(),
      setCode,
    );
    if (!row || byNumber.has(row.number)) continue;
    byNumber.set(row.number, row);
  }
  return [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number),
  );
}

export function mergeNarutoCardsCaIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  cards: readonly NarutoCardsCaCard[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  addedPrints: string[];
  titled: string[];
} {
  const prints = [...input.prints];
  const titles = [...input.titles];
  const printByKey = new Map(
    prints.map((p) => [canonicalizeNarutoPrintKey(p.printKey), p]),
  );
  const titleKeys = new Set(
    titles.map(
      (t) =>
        `${canonicalizeNarutoPrintKey(t.printKey)}\0${t.lang.toLowerCase()}`,
    ),
  );
  const addedPrints: string[] = [];
  const titled: string[] = [];

  for (const row of input.cards) {
    const printKey = mintNarutoPrintKey(row.number);
    if (!printKey) continue;
    const diskId = narutoDiskCardId(row.number) ?? row.number;
    const parsed = parseNarutoCollector(row.number);
    if (!printByKey.has(printKey)) {
      if (!narutoCardsCaMayMintPrint(row, false)) continue;
      const print: NarutoPrintRow = {
        printKey,
        setCode: row.setCode,
        number: diskId,
        cardType: cardTypeFromCollectorNumber(diskId),
        family: parsed?.family ?? null,
        grouping: parsed?.grouping ?? null,
      };
      prints.push(print);
      printByKey.set(printKey, print);
      addedPrints.push(printKey);
    }
    const titleKey = `${printKey}\0en`;
    if (titleKeys.has(titleKey)) continue;
    titles.push({ printKey, lang: "en", fullName: row.name.trim() });
    titleKeys.add(titleKey);
    titled.push(printKey);
  }

  prints.sort((a, b) => a.printKey.localeCompare(b.printKey));
  addedPrints.sort((a, b) => a.localeCompare(b));
  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, addedPrints, titled };
}
