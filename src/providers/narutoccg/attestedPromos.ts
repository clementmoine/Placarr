/**
 * Inject attested FR tournament / tin / CdF promos into the catalogue even
 * when no face JPEG exists yet (same honesty rule as cancelled S6: keep the
 * number + name, seek art later).
 *
 * Source: `curated/sources/attested-promos.json` (editorial ledger).
 * On-disk faces under `cards/promo/fr/` still win via `buildIndexFromDisk`.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { buildPrintKey } from "@/core/identify/printKey";

import { narutoCuratedSourcesDir } from "./curatedPaths";
import type { NarutoPrintRow, NarutoTitleRow } from "./indexStore";
import { cardTypeFromCollectorNumber } from "./parseBandaicgAsset";

export type AttestedPromoSource = {
  id: string;
  url?: string;
  path?: string;
  note?: string;
};

export type AttestedPromoRow = {
  number: string;
  name: string;
  confidence?: string;
  channel?: string;
  shuriken?: number | null;
  /** On-disk folder under `cards/promo/fr/` when art already exists. */
  diskCardId?: string;
  notes?: string;
  /** Evidence (forum / marketplace / archived site pages). */
  sources?: AttestedPromoSource[];
};

type AttestedPromosFile = {
  promos?: AttestedPromoRow[];
};

export function attestedPromosPath(): string {
  return path.join(narutoCuratedSourcesDir(), "attested-promos.json");
}

export function loadAttestedPromos(
  filePath = attestedPromosPath(),
): AttestedPromoRow[] {
  if (!existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(
      readFileSync(filePath, "utf8"),
    ) as AttestedPromosFile;
    const rows = raw.promos ?? [];
    return rows.filter(
      (row) =>
        typeof row?.number === "string" &&
        row.number.trim() &&
        typeof row?.name === "string" &&
        row.name.trim(),
    );
  } catch {
    return [];
  }
}

/** `te030` + diskCardId `te030-cdf` → grouping `cdf`. */
export function groupingFromDiskCardId(
  number: string,
  diskCardId: string | undefined,
): string | null {
  if (!diskCardId) return null;
  const id = diskCardId.trim().toLowerCase();
  const num = number.trim().toLowerCase();
  if (id === num) return null;
  if (id.startsWith(`${num}-`)) return id.slice(num.length + 1) || null;
  return null;
}

export function attestedPromoPrintKey(row: AttestedPromoRow): string | null {
  const number = row.number.trim().toLowerCase();
  const grouping = groupingFromDiskCardId(number, row.diskCardId);
  return buildPrintKey({
    game: "naruto",
    set: "promo",
    number,
    grouping,
  });
}

/**
 * Ensure every attested promo has a `promo` print + FR title.
 * Does not invent assets — art arrives later under `cards/promo/fr/`.
 */
export function mergeAttestedPromos(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  promos?: AttestedPromoRow[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  addedPrints: string[];
  titled: string[];
} {
  const promos = input.promos ?? loadAttestedPromos();
  const prints = [...input.prints];
  const titles = [...input.titles];
  const printByKey = new Map(prints.map((p) => [p.printKey, p]));
  const titleByKey = new Map(
    titles
      .filter((t) => t.lang.toLowerCase() === "fr")
      .map((t) => [t.printKey, t]),
  );
  const addedPrints: string[] = [];
  const titled: string[] = [];

  for (const row of promos) {
    const printKey = attestedPromoPrintKey(row);
    if (!printKey) continue;
    const number = row.number.trim().toLowerCase();
    const grouping = groupingFromDiskCardId(number, row.diskCardId);

    if (!printByKey.has(printKey)) {
      const print: NarutoPrintRow = {
        printKey,
        setCode: "promo",
        number,
        cardType: cardTypeFromCollectorNumber(number),
        grouping,
      };
      prints.push(print);
      printByKey.set(printKey, print);
      addedPrints.push(printKey);
    }

    const existing = titleByKey.get(printKey);
    if (!existing) {
      const title: NarutoTitleRow = {
        printKey,
        lang: "fr",
        fullName: row.name.trim(),
        rarity: "promo",
      };
      titles.push(title);
      titleByKey.set(printKey, title);
      titled.push(printKey);
    } else {
      if (!existing.fullName.trim() && row.name.trim()) {
        existing.fullName = row.name.trim();
        titled.push(printKey);
      }
      // Attested promo row → keep rarity honest even if checklist said « commune ».
      if (existing.rarity !== "promo") {
        existing.rarity = "promo";
        titled.push(printKey);
      }
    }
  }

  prints.sort((a, b) => a.printKey.localeCompare(b.printKey));
  return { prints, titles, addedPrints, titled };
}
