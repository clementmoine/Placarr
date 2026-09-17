/**
 * TV Tokyo official card faces for Naruto Carddass CCG (card_01.html to card_13.html, card_kak.html).
 * Source of truth: `curated/sources/tvtokyo.json`.
 */
import ledger from "../curated/sources/tvtokyo.json";
import {
  canonicalizeNarutoPrintKey,
  mintNarutoPrintKey,
  narutoDiskCardId,
  parseNarutoCollector,
} from "../collectorIdentity";
import type { NarutoPrintRow, NarutoTitleRow } from "../indexStore";
import { cardTypeFromCollectorNumber } from "../parse/parseBandaicgAsset";

export type NarutoCcgTvTokyoFace = (typeof ledger.faces)[number];

export function narutoCcgTvTokyoFaceLedger() {
  return ledger;
}

export function narutoCcgTvTokyoIngestFaces(): NarutoCcgTvTokyoFace[] {
  return ledger.faces.filter((row) => row.ingest !== false);
}

/**
 * Suffixe de fichier TV Tokyo → source disque.
 * `s193a.jpg` / `s193b.jpg` → tvtokyo-a / tvtokyo-b ; sinon `tvtokyo`.
 */
export function tvTokyoFaceSourceFromFile(
  file: string,
): "tvtokyo" | "tvtokyo-a" | "tvtokyo-b" {
  const stem = file.trim().toLowerCase().replace(/\.[^.]+$/, "");
  if (stem.endsWith("a")) return "tvtokyo-a";
  if (stem.endsWith("b")) return "tvtokyo-b";
  return "tvtokyo";
}

export function mergeTvTokyoJaNamesIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
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

  for (const row of narutoCcgTvTokyoIngestFaces()) {
    const printKey = mintNarutoPrintKey(row.diskId);
    if (!printKey) continue;
    const diskId = narutoDiskCardId(row.diskId) ?? row.diskId;
    const parsed = parseNarutoCollector(row.diskId);
    if (!printByKey.has(printKey)) {
      const print: NarutoPrintRow = {
        printKey,
        setCode: "promo",
        number: diskId,
        cardType: cardTypeFromCollectorNumber(diskId),
        family: parsed?.family ?? null,
      };
      prints.push(print);
      printByKey.set(printKey, print);
      addedPrints.push(printKey);
    }
    const titleKey = `${printKey}\0ja`;
    if (titleKeys.has(titleKey)) continue;
    const name = row.name.trim();
    if (!name) continue;
    titles.push({ printKey, lang: "ja", fullName: name });
    titleKeys.add(titleKey);
    titled.push(printKey);
  }

  prints.sort((a, b) => a.printKey.localeCompare(b.printKey));
  addedPrints.sort((a, b) => a.localeCompare(b));
  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, addedPrints, titled };
}
