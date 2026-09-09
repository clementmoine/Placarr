/**
 * collectorscomet.com ui-api — Bandai USA CCG titles (750×1050 CDN).
 * Fill-only on prints that already exist; does not mint from the marketplace.
 */
import {
  canonicalizeNarutoPrintKey,
  mintNarutoPrintKey,
  narutoDiskCardId,
} from "../collectorIdentity";
import type { NarutoPrintRow, NarutoTitleRow } from "../indexStore";
import { parseEnCcgPrintedRef } from "./parseEnCcgPrinted";

const TP_BY_SET: Record<string, string> = {
  "17.5": "tp1",
  "19.5": "tp2",
  "21.5": "tp3",
  "23.5": "tp4",
};

export type CollectorsCometProduct = {
  name: string;
  number: string;
  editionName?: string | null;
};

export type CollectorsCometCard = {
  number: string;
  name: string;
  setCode: string;
  printedRef: string;
};

/** `Set 9 - The Chosen` → `s9`, `Set 21.5 - Tournament Pack 3` → `tp3`. */
export function collectorsCometEditionSetCode(
  editionName: string,
): string | null {
  const name = editionName.replace(/\s+/g, " ").trim();
  if (/^promos$/i.test(name)) return "promo";
  const tp = /^Set\s+(\d+\.5)\b/i.exec(name);
  if (tp) return TP_BY_SET[tp[1]!] ?? null;
  const booster = /^Set\s+(\d+)\b/i.exec(name);
  if (booster) {
    const n = Number(booster[1]);
    if (n >= 1 && n <= 28) return `s${n}`;
  }
  return null;
}

/** Strip redundant printed ref suffixes the shop repeats in the title. */
export function cleanCollectorsCometProductName(name: string): string {
  return name
    .replace(/\s*\((?:N|J|M|C|PR|PS|NUS|JUS|MUS|CUS)-[\dA-Za-z-]+\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCollectorsCometPrintedRef(raw: string): string | null {
  const trimmed = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!trimmed) return null;
  const m =
    /^(N|J|M|C|PR|PS)(?:-?US)?-?(\d{1,4}[A-Z]?)$/i.exec(trimmed) ??
    /^(NUS|JUS|MUS|CUS|PRUS)-(\d{1,4}[A-Z]?)$/i.exec(trimmed);
  if (!m) return null;
  let letter = m[1]!.toUpperCase();
  let digits = m[2]!;
  if (/^NUS$/i.test(letter)) {
    letter = "N";
    return `N-US-${digits.replace(/[^\d]/g, "")}`;
  }
  if (/^JUS$/i.test(letter)) {
    letter = "J";
    return `J-US-${digits.replace(/[^\d]/g, "")}`;
  }
  if (/^MUS$/i.test(letter)) {
    letter = "M";
    return `M-US-${digits.replace(/[^\d]/g, "")}`;
  }
  if (/^CUS$/i.test(letter)) {
    letter = "C";
    return `C-US-${digits.replace(/[^\d]/g, "")}`;
  }
  if (/^PRUS$/i.test(letter)) {
    letter = "PR";
    return `PR-US-${digits.replace(/[^\d]/g, "")}`;
  }
  const us = /US/i.test(m[0]!);
  return us ? `${letter}-US-${digits.replace(/[^\d]/g, "")}` : `${letter}-${digits}`;
}

export function parseCollectorsCometProduct(
  product: CollectorsCometProduct,
  editionName: string,
): CollectorsCometCard | null {
  const setCode = collectorsCometEditionSetCode(editionName);
  if (!setCode) return null;
  const printedRef = normalizeCollectorsCometPrintedRef(product.number);
  if (!printedRef) return null;
  const parsed = parseEnCcgPrintedRef(printedRef);
  if (!parsed?.number) return null;
  const name = cleanCollectorsCometProductName(product.name);
  if (!name) return null;
  const diskId = narutoDiskCardId(parsed.number) ?? parsed.number;
  return {
    number: diskId,
    name,
    setCode,
    printedRef,
  };
}

export function mergeCollectorsCometIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  cards: readonly CollectorsCometCard[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
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
  const titled: string[] = [];

  for (const row of input.cards) {
    const printKey = mintNarutoPrintKey(row.number);
    if (!printKey || !printByKey.has(printKey)) continue;
    const titleKey = `${printKey}\0en`;
    if (titleKeys.has(titleKey)) continue;
    titles.push({
      printKey,
      lang: "en",
      fullName: row.name.trim(),
      nameSource: "collectors-comet",
    });
    titleKeys.add(titleKey);
    titled.push(printKey);
  }

  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, titled };
}
